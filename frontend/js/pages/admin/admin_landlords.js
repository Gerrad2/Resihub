import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN LANDLORDS
   Landlord table for admin/admin_landlords.htm, plus a
   document review panel for each landlord.
   Approve and reject call review_verification_document
   in the database, which checks the admin role, matches
   the NIN address to the profile address, and notifies
   the landlord.
========================================= */

const SIGNED_URL_SECONDS = 300;
const shortDate = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" });

const STATUS_LABEL = {
    pending: "Pending",
    verified: "Verified",
    rejected: "Rejected",
    none: "Not submitted",
};

const state = {
    landlords: [],
    listingCounts: new Map(),
    totalListings: 0,
    search: "",
    statusFilter: "",
    open: null,
};

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function statusOf(landlord) {
    return landlord.verification_status || "none";
}

/* ---------- Data ---------- */

async function loadLandlords() {
    const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, address, verification_status, created_at")
        .eq("role", "landlord")
        .order("created_at", { ascending: false });

    if (error) throw error;
    state.landlords = data ?? [];
}

async function loadListingCounts() {
    const { data, error } = await supabase.from("listings").select("landlord_id");
    if (error) throw error;

    state.listingCounts = new Map();
    for (const row of data ?? []) {
        state.listingCounts.set(row.landlord_id, (state.listingCounts.get(row.landlord_id) ?? 0) + 1);
    }
    state.totalListings = data?.length ?? 0;
}

function renderStats() {
    const count = (status) => state.landlords.filter((landlord) => statusOf(landlord) === status).length;

    setText("totalLandlords", state.landlords.length);
    setText("verifiedLandlords", count("verified"));
    setText("pendingLandlords", count("pending"));
    setText("totalProperties", state.totalListings);
}

/* ---------- Table ---------- */

function visibleLandlords() {
    return state.landlords.filter((landlord) => {
        if (state.statusFilter && statusOf(landlord) !== state.statusFilter) return false;

        if (state.search) {
            const haystack = [landlord.full_name, landlord.phone, landlord.address]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            if (!haystack.includes(state.search)) return false;
        }
        return true;
    });
}

function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
}

function statusCell(landlord) {
    const td = document.createElement("td");
    const badge = document.createElement("span");
    const status = statusOf(landlord);
    badge.className = `status-badge ${status}`;
    badge.textContent = STATUS_LABEL[status] ?? status;
    td.append(badge);
    return td;
}

function createRow(landlord) {
    const row = document.createElement("tr");
    row.dataset.landlordId = landlord.id;

    const actions = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-outline btn-sm";
    button.dataset.action = "review";
    button.textContent = "Review documents";
    actions.append(button);

    row.append(
        cell(landlord.full_name || "Landlord"),
        cell("—"),
        cell(landlord.phone || "—"),
        cell(String(state.listingCounts.get(landlord.id) ?? 0)),
        statusCell(landlord),
        cell(landlord.created_at ? shortDate.format(new Date(landlord.created_at)) : "—"),
        actions
    );
    return row;
}

function renderTable() {
    const body = $("landlordTableBody");
    const empty = $("noLandlordsFound");
    if (!body) return;

    const rows = visibleLandlords();
    body.replaceChildren(...rows.map(createRow));

    if (empty) empty.classList.toggle("hidden", rows.length > 0);
}

/* ---------- Review panel ---------- */

function buildPanel() {
    if ($("documentReviewModal")) return;

    const modal = document.createElement("div");
    modal.id = "documentReviewModal";
    modal.className = "modal hidden";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title" id="reviewPanelTitle">Review documents</h2>
                <button type="button" class="modal-close" id="reviewPanelClose" aria-label="Close">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>NIN</label>
                    <p id="reviewNin">Loading...</p>
                </div>
                <div class="form-group">
                    <label>Address on profile</label>
                    <p id="reviewProfileAddress">—</p>
                </div>
                <div class="form-group">
                    <label>Address on NIN record</label>
                    <p id="reviewNinAddress">—</p>
                </div>
                <p class="validation-message" id="reviewAddressHint" hidden></p>
                <div class="form-group">
                    <label>Documents</label>
                    <div id="reviewDocuments"></div>
                </div>
            </div>
        </div>
    `;
    document.body.append(modal);

    $("reviewPanelClose").addEventListener("click", closePanel);
    modal.addEventListener("click", (event) => {
        if (event.target === modal) closePanel();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && state.open) closePanel();
    });
}

function closePanel() {
    $("documentReviewModal")?.classList.add("hidden");
    state.open = null;
}

function normaliseAddress(value) {
    return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function fetchPanelData(landlordId) {
    const [details, documents] = await Promise.all([
        supabase.from("verification_details").select("nin, address").eq("landlord_id", landlordId).maybeSingle(),
        supabase
            .from("verification_documents")
            .select("id, document_type, storage_path, status, rejection_reason, created_at")
            .eq("user_id", landlordId)
            .order("created_at", { ascending: false }),
    ]);

    if (details.error) throw details.error;
    if (documents.error) throw documents.error;

    return { details: details.data, documents: documents.data ?? [] };
}

function renderPanelAddresses(landlord, details) {
    setText("reviewNin", details?.nin || "Not saved yet. The landlord must save their NIN before the address can be approved.");
    setText("reviewProfileAddress", landlord.address || "—");
    setText("reviewNinAddress", details?.address || "—");

    const hint = $("reviewAddressHint");
    if (!hint) return;

    if (!details?.address || !landlord.address) {
        hint.hidden = true;
        return;
    }
    const match = normaliseAddress(details.address) === normaliseAddress(landlord.address);
    hint.textContent = match
        ? "The two addresses look the same."
        : "The two addresses look different. Approval will be refused until they match.";
    hint.hidden = false;
}

function documentRow(doc, landlordId) {
    const item = document.createElement("div");
    item.className = "review-document";

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = doc.document_type === "address" ? "Proof of address" : doc.document_type;
    const meta = document.createElement("span");
    meta.textContent = `${doc.created_at ? shortDate.format(new Date(doc.created_at)) : ""} · ${doc.status}`;
    info.append(title, meta);

    if (doc.status === "rejected" && doc.rejection_reason) {
        const reason = document.createElement("p");
        reason.textContent = `Reason: ${doc.rejection_reason}`;
        info.append(reason);
    }

    const actions = document.createElement("div");
    actions.className = "admin-actions";

    const view = document.createElement("button");
    view.type = "button";
    view.className = "btn btn-outline btn-sm";
    view.textContent = "View";
    view.addEventListener("click", () => viewDocument(doc));

    const approve = document.createElement("button");
    approve.type = "button";
    approve.className = "btn btn-primary btn-sm";
    approve.textContent = "Approve";
    approve.disabled = doc.status !== "pending";
    approve.addEventListener("click", () => decide(landlordId, doc, true, approve));

    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "btn btn-outline btn-sm";
    reject.textContent = "Reject";
    reject.disabled = doc.status !== "pending";
    reject.addEventListener("click", () => decide(landlordId, doc, false, reject));

    actions.append(view, approve, reject);
    item.append(info, actions);
    return item;
}

function renderDocuments(documents, landlordId) {
    const list = $("reviewDocuments");
    if (!list) return;

    if (documents.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No documents uploaded yet.";
        list.replaceChildren(empty);
        return;
    }
    list.replaceChildren(...documents.map((doc) => documentRow(doc, landlordId)));
}

async function viewDocument(doc) {
    const { data, error } = await supabase.storage
        .from("verification-documents")
        .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);

    if (error || !data?.signedUrl) {
        console.error("[admin_landlords] could not open document:", error);
        showToast("This document could not be opened.", { type: "error" });
        return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
}

async function openPanel(landlord) {
    buildPanel();
    state.open = landlord.id;
    setText("reviewPanelTitle", `Review documents: ${landlord.full_name || "Landlord"}`);
    $("documentReviewModal").classList.remove("hidden");
    $("reviewDocuments").replaceChildren();
    setText("reviewNin", "Loading...");

    try {
        const { details, documents } = await fetchPanelData(landlord.id);
        if (state.open !== landlord.id) return;
        renderPanelAddresses(landlord, details);
        renderDocuments(documents, landlord.id);
    } catch (error) {
        console.error("[admin_landlords] could not load documents:", error);
        showToast("Documents for this landlord could not be loaded.", { type: "error" });
    }
}

async function decide(landlordId, doc, approve, button) {
    let reason = null;

    if (approve) {
        if (!confirm("Approve this document? If it is the address proof, the landlord becomes verified once their NIN is saved.")) {
            return;
        }
    } else {
        reason = window.prompt("Why is this document being rejected? The landlord will see this reason.");
        if (reason === null) return;
        if (!reason.trim()) {
            showToast("A reason is required to reject a document.", { type: "error" });
            return;
        }
        reason = reason.trim();
    }

    button.disabled = true;
    const { data, error } = await supabase.rpc("review_verification_document", {
        doc_id: doc.id,
        approve,
        reason,
    });
    button.disabled = false;

    if (error) {
        console.error("[admin_landlords] review failed:", error);
        showToast(error.message || "This document could not be reviewed.", { type: "error" });
        return;
    }

    showToast(approve ? "Document approved." : "Document rejected. The landlord has been notified.", { type: "success" });
    await refreshAfterDecision(landlordId);
}

async function refreshAfterDecision(landlordId) {
    await loadLandlords();
    renderStats();
    renderTable();

    const landlord = state.landlords.find((item) => item.id === landlordId);
    if (landlord && state.open === landlordId) {
        const { details, documents } = await fetchPanelData(landlordId);
        renderPanelAddresses(landlord, details);
        renderDocuments(documents, landlordId);
    }
}

/* ---------- Events ---------- */

function bindEvents() {
    $("landlordTableBody")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action='review']");
        if (!button) return;
        const landlordId = button.closest("tr")?.dataset.landlordId;
        const landlord = state.landlords.find((item) => item.id === landlordId);
        if (landlord) openPanel(landlord);
    });

    $("landlordFilterForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        state.search = ($("landlordSearch")?.value ?? "").trim().toLowerCase();
        renderTable();
    });

    $("landlordSearch")?.addEventListener("input", (event) => {
        state.search = event.target.value.trim().toLowerCase();
        renderTable();
    });

    $("verificationStatus")?.addEventListener("change", (event) => {
        state.statusFilter = event.target.value;
        renderTable();
    });

    $("resetLandlordFilters")?.addEventListener("click", () => {
        state.search = "";
        state.statusFilter = "";
        setTimeout(renderTable, 0);
    });
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_landlords" });
    bindEvents();

    loadLandlords()
        .then(() => {
            renderStats();
            renderTable();
        })
        .catch((error) => {
            console.error("[admin_landlords] could not load landlords:", error);
            showToast("Landlords could not be loaded.", { type: "error" });
        });

    loadListingCounts()
        .then(() => {
            renderStats();
            renderTable();
        })
        .catch((error) => console.error("[admin_landlords] could not load listing counts:", error));
}