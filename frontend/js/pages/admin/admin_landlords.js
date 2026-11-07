import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";
import { watchTables } from "../../core/realtime.js";

/* =========================================
   ADMIN LANDLORDS
   Landlord table for admin/admin_landlords.htm, plus a
   document review panel for each landlord. Approve and reject
   call review_verification_document in the database, which
   checks the admin role, matches the NIN address to the profile
   address, and notifies the landlord. Changes arrive live.
========================================= */

const SIGNED_URL_SECONDS = 300;
const PAGE_SIZE = 10;
const shortDate = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" });

/* Design labels: verified is Active, rejected is Suspended */
const STATUS_LABEL = {
    verified: "Active",
    pending: "Pending",
    rejected: "Suspended",
    none: "Unverified",
};

const STATUS_BADGE_CLASS = {
    verified: "active",
    pending: "pending",
    rejected: "suspended",
    none: "pending",
};

/* Values in the status dropdown mapped to verification_status */
const STATUS_FILTER = {
    Verified: "verified",
    Pending: "pending",
    Suspended: "rejected",
};

const state = {
    landlords: [],
    emails: new Map(),
    listingCounts: new Map(),
    totalListings: 0,
    search: "",
    statusFilter: "",
    propertyFilter: "",
    page: 1,
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

    try {
        await loadEmails();
    } catch (emailError) {
        console.error("[admin_landlords] could not load emails:", emailError);
    }
}

async function loadEmails() {
    const { data, error } = await supabase.rpc("admin_landlord_emails");
    if (error) throw error;

    state.emails = new Map((data ?? []).map((row) => [row.id, row.email]));
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

function emailOf(landlord) {
    return state.emails.get(landlord.id) || "—";
}

function visibleLandlords() {
    const wantedStatus = STATUS_FILTER[state.statusFilter] ?? "";

    return state.landlords.filter((landlord) => {
        if (wantedStatus && statusOf(landlord) !== wantedStatus) return false;

        const listings = state.listingCounts.get(landlord.id) ?? 0;
        if (state.propertyFilter === "with" && listings === 0) return false;
        if (state.propertyFilter === "without" && listings > 0) return false;

        if (state.search) {
            const haystack = [landlord.full_name, landlord.address, emailOf(landlord)]
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
    const status = statusOf(landlord);

    const badge = document.createElement("span");
    badge.className = `status-badge ${STATUS_BADGE_CLASS[status] ?? "pending"}`;
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
        cell(emailOf(landlord)),
        cell(String(state.listingCounts.get(landlord.id) ?? 0)),
        statusCell(landlord),
        actions
    );
    return row;
}

function renderTable() {
    const body = $("landlordTableBody");
    const empty = $("noLandlordsFound");
    if (!body) return;

    const rows = visibleLandlords();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);

    const start = (state.page - 1) * PAGE_SIZE;
    body.replaceChildren(...rows.slice(start, start + PAGE_SIZE).map(createRow));

    if (empty) empty.classList.toggle("hidden", rows.length > 0);
    renderPagination(pages);
}

function pageButton(label, page, { active = false, disabled = false } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `page-btn${active ? " active" : ""}`;
    button.dataset.page = String(page);
    button.textContent = label;
    button.disabled = disabled;
    return button;
}

function renderPagination(pages) {
    const nav = $("landlordPagination");
    if (!nav) return;

    if (pages <= 1) {
        nav.replaceChildren();
        return;
    }

    const items = [pageButton("‹", state.page - 1, { disabled: state.page === 1 })];
    for (let page = 1; page <= pages; page += 1) {
        items.push(pageButton(String(page), page, { active: page === state.page }));
    }
    items.push(pageButton("›", state.page + 1, { disabled: state.page === pages }));
    nav.replaceChildren(...items);
}

/* ---------- Review panel ---------- */

const REVIEW_DOC_LABEL = { address: "Proof of address" };
const REVIEW_STATUS_TEXT = { pending: "Pending", verified: "Approved", rejected: "Rejected" };

function makeNode(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function buildPanel() {
    if ($("documentReviewModal")) return;

    const modal = document.createElement("div");
    modal.id = "documentReviewModal";
    modal.className = "modal hidden";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
        <div class="modal-content rv-panel" role="dialog" aria-modal="true" aria-labelledby="reviewPanelTitle">
            <button type="button" class="modal-close" id="reviewPanelClose" aria-label="Close">×</button>

            <header class="rv-header">
                <p class="rv-eyebrow">Verification review</p>
                <h2 class="modal-title" id="reviewPanelTitle">Review documents</h2>
            </header>

            <section class="rv-section">
                <h3 class="rv-heading">Identity</h3>
                <div class="rv-row">
                    <span class="rv-label">NIN</span>
                    <span id="reviewNin" class="rv-value rv-mono">Loading...</span>
                </div>
            </section>

            <section class="rv-section">
                <h3 class="rv-heading">Address check</h3>
                <div class="rv-addresses">
                    <div class="rv-card">
                        <span class="rv-label">Profile</span>
                        <p id="reviewProfileAddress" class="rv-value">—</p>
                    </div>
                    <div class="rv-card">
                        <span class="rv-label">NIN record</span>
                        <p id="reviewNinAddress" class="rv-value">—</p>
                    </div>
                </div>
                <p id="reviewAddressStatus" class="rv-status" hidden></p>
            </section>

            <section class="rv-section">
                <h3 class="rv-heading">Documents</h3>
                <div id="reviewDocuments" class="rv-docs"></div>
            </section>
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
    const modal = $("documentReviewModal");
    if (modal) {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
    }
    state.open = null;
}

function normaliseAddress(value) {
    return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// True only when the NIN is saved, both addresses are present, and they match
function addressReady(landlord, details) {
    return Boolean(
        details?.nin &&
        landlord.address &&
        details.address &&
        normaliseAddress(details.address) === normaliseAddress(landlord.address)
    );
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
    setText("reviewNin", details?.nin || "Not saved yet");
    setText("reviewProfileAddress", landlord.address || "Not added");
    setText("reviewNinAddress", details?.address || "Not saved");

    const status = $("reviewAddressStatus");
    if (!status) return;

    let kind;
    let text;

    if (!details?.nin) {
        kind = "missing";
        text = "The landlord hasn't saved their NIN yet, so the address can't be approved.";
    } else if (!landlord.address || !details.address) {
        kind = "missing";
        text = "One of the addresses is missing. The landlord needs to save their profile again.";
    } else if (addressReady(landlord, details)) {
        kind = "match";
        text = "The addresses match. The proof of address can be approved.";
    } else {
        kind = "mismatch";
        text = "The addresses differ. Approval is blocked until the landlord saves their profile again.";
    }

    status.className = `rv-status ${kind}`;
    status.textContent = text;
    status.hidden = false;
}

function documentRow(doc, landlordId, ready) {
    const card = makeNode("article", "rv-doc");

    const title = makeNode("div", "rv-doc-title");
    title.append(
        makeNode("strong", "", REVIEW_DOC_LABEL[doc.document_type] ?? doc.document_type),
        makeNode("span", "rv-doc-date", doc.created_at ? shortDate.format(new Date(doc.created_at)) : "")
    );

    const head = makeNode("div", "rv-doc-head");
    head.append(
        title,
        makeNode("span", `rv-pill ${doc.status}`, REVIEW_STATUS_TEXT[doc.status] ?? doc.status)
    );
    card.append(head);

    if (doc.status === "rejected" && doc.rejection_reason) {
        card.append(makeNode("p", "rv-reason", `Reason: ${doc.rejection_reason}`));
    }

    const actions = makeNode("div", "rv-actions");

    const view = makeNode("button", "btn btn-outline btn-sm", "View");
    view.type = "button";
    view.addEventListener("click", () => viewDocument(doc));

    const approve = makeNode("button", "btn btn-approve btn-sm", "Approve");
    approve.type = "button";
    const blockedByAddress = doc.document_type === "address" && !ready;
    approve.disabled = doc.status !== "pending" || blockedByAddress;
    if (blockedByAddress && doc.status === "pending") {
        approve.title = "The addresses must match before this can be approved.";
    }
    approve.addEventListener("click", () => decide(landlordId, doc, true, approve));

    const reject = makeNode("button", "btn btn-reject btn-sm", "Reject");
    reject.type = "button";
    reject.disabled = doc.status !== "pending";
    reject.addEventListener("click", () => decide(landlordId, doc, false, reject));

    actions.append(view, approve, reject);
    card.append(actions);
    return card;
}

function renderDocuments(documents, landlordId, ready) {
    const list = $("reviewDocuments");
    if (!list) return;

    if (documents.length === 0) {
        list.replaceChildren(makeNode("p", "rv-empty", "No documents uploaded yet."));
        return;
    }

    list.replaceChildren(...documents.map((doc) => documentRow(doc, landlordId, ready)));
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

    const modal = $("documentReviewModal");
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");

    setText("reviewNin", "Loading...");
    $("reviewDocuments").replaceChildren(makeNode("p", "rv-empty", "Loading documents..."));

    try {
        const { details, documents } = await fetchPanelData(landlord.id);
        if (state.open !== landlord.id) return;

        renderPanelAddresses(landlord, details);
        renderDocuments(documents, landlord.id, addressReady(landlord, details));
    } catch (error) {
        console.error("[admin_landlords] could not load documents:", error);
        showToast("Documents for this landlord could not be loaded.", { type: "error" });
    }
}

/* ---------- Decisions ---------- */

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
    const { error } = await supabase.rpc("review_verification_document", {
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

    showToast(
        approve ? "Document approved." : "Document rejected. The landlord has been notified.",
        { type: "success" }
    );
    await refreshAfterDecision();
}

/* ---------- Refresh (after a decision, and on live changes) ---------- */

async function refreshEverything() {
    await Promise.all([loadLandlords(), loadListingCounts()]);
    renderStats();
    renderTable();

    const open = state.open;
    if (!open) return;

    const landlord = state.landlords.find((item) => item.id === open);
    if (!landlord) return;

    const { details, documents } = await fetchPanelData(open);
    if (state.open !== open) return;

    renderPanelAddresses(landlord, details);
    renderDocuments(documents, open, addressReady(landlord, details));
}

async function refreshAfterDecision() {
    await refreshEverything();
}

let stopLiveUpdates = null;

function startLiveUpdates() {
    if (stopLiveUpdates) return;

    stopLiveUpdates = watchTables(
        "admin-landlords",
        [
            { table: "profiles", filter: "role=eq.landlord" },
            { table: "listings" },
            { table: "verification_documents" },
            { table: "verification_details" },
        ],
        () => refreshEverything()
    );
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

    $("propertyFilter")?.addEventListener("change", (event) => {
        state.propertyFilter = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("landlordPagination")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");
        if (!button || button.disabled) return;

        state.page = Number(button.dataset.page);
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

    startLiveUpdates();
}