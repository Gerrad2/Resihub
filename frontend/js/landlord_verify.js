import { getCurrentUser, supabase } from "./api.js";
import { showError } from "./student_utils.js";
import { showToast } from "./ui/toast.js";

const $ = (id) => document.getElementById(id);

const BUCKET = "verification-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

let me = null;
let profile = null;
let details = null;
let latestDoc = null;

export async function init() {
    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;

    if (!me) {
        showError("Please sign in to verify your business.");
        return;
    }

    $("addressFile")?.addEventListener("change", (event) => uploadAddress(event.target.files[0], event.target));

    await loadAll();
}

async function loadAll() {
    const [profileResult, detailsResult, docResult] = await Promise.all([
        supabase.from("profiles")
            .select("id, full_name, business_name, cac_number, phone, address, verification_status")
            .eq("id", me.id)
            .maybeSingle(),
        supabase.from("verification_details").select("nin, address").eq("landlord_id", me.id).maybeSingle(),
        supabase.from("verification_documents")
            .select("id, status, rejection_reason, created_at")
            .eq("user_id", me.id)
            .eq("document_type", "address")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    if (profileResult.error || !profileResult.data) {
        console.error("[verify] profile failed:", profileResult.error);
        showError("Your verification status could not be loaded.");
        return;
    }

    if (detailsResult.error || docResult.error) {
        console.error("[verify] details:", detailsResult.error, "docs:", docResult.error);
        showError("Your verification details could not be loaded.");
        return;
    }

    profile = { ...profileResult.data, email: me.email };
    details = detailsResult.data;
    latestDoc = docResult.data;

    renderSteps();
    renderBanner();
    renderBusiness();
    renderDocuments();
}

/* ---------- Status ---------- */

function renderSteps() {
    const verified = profile.verification_status === "verified";
    const docUploaded = Boolean(latestDoc);
    const docVerified = latestDoc?.status === "verified";
    const docPending = latestDoc?.status === "pending";

    setStep("details", Boolean(details), false);
    setStep("docs", docUploaded, !docUploaded && Boolean(details));
    setStep("review", docVerified || verified, docPending);
    setStep("approved", verified, false);
}

function setStep(name, done, active) {
    const step = document.querySelector(`.vf-step[data-step="${name}"]`);
    if (!step) return;

    step.classList.toggle("done", done);
    step.classList.toggle("active", !done && active);
    step.querySelector(".vf-step-state").textContent = done ? "Completed" : active ? "In progress" : "Pending";
}

function renderBanner() {
    const verified = profile.verification_status === "verified";
    const rejected = latestDoc?.status === "rejected";

    let text;
    if (verified) {
        text = "Your business is verified. Your listings show the verified badge.";
    } else if (rejected) {
        text = `Your proof of address needs attention${latestDoc.rejection_reason ? `: ${latestDoc.rejection_reason}` : ""}. Please upload it again.`;
    } else if (!details) {
        text = "Start by entering your NIN below. Your proof of address can be uploaded after that.";
    } else if (!latestDoc) {
        text = "Your NIN is saved. Upload your proof of address to continue.";
    } else if (latestDoc.status === "pending") {
        text = "Your verification is in progress. We'll notify you once your documents have been reviewed.";
    } else {
        text = "Your details are being checked. You'll be notified after each decision.";
    }

    setText("verifyBannerText", text);
}

/* ---------- Business details and NIN ---------- */

function renderBusiness() {
    const rows = $("businessRows");
    if (!rows) return;

    const nodes = [
        row("fa-user", "Full name", profile.full_name || "Not added"),
        row("fa-briefcase", "Business name", profile.business_name || "Not added"),
        row("fa-file-contract", "CAC number", profile.cac_number || "Not added"),
        row("fa-location-dot", "Address (from profile)", profile.address || "Not added"),
        row("fa-phone", "Phone number", profile.phone || "Not added"),
        row("fa-envelope", "Email address", profile.email || "Not added"),
        ninRow(),
    ];

    rows.replaceChildren(...nodes);
}

function ninRow() {
    const wrapper = document.createDocumentFragment();

    const masked = details ? `***********${details.nin.slice(-3)}` : "Not added";
    wrapper.append(row("fa-id-card", "NIN", masked, !details));

    const form = element("form", "vf-nin-form");
    const input = element("input", "vf-input");
    input.type = "text";
    input.inputMode = "numeric";
    input.maxLength = 11;
    input.placeholder = details ? "Enter a new NIN to update" : "Enter your 11-digit NIN";
    input.required = true;

    const button = element("button", "vf-action", details ? "Update NIN" : "Save NIN");
    button.type = "submit";

    form.append(input, button);
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        saveNin(input.value.trim(), button, input);
    });

    wrapper.append(form);
    return wrapper;
}

async function saveNin(nin, button, input) {
    if (!/^\d{11}$/.test(nin)) {
        setMessage("Your NIN must be exactly 11 digits.", "error");
        return;
    }

    if (!profile.address) {
        setMessage("Add your address to your profile first. Your proof of address must match it.", "error");
        return;
    }

    button.disabled = true;

    const { error } = await supabase
        .from("verification_details")
        .upsert(
            { landlord_id: me.id, nin, address: profile.address, updated_at: new Date().toISOString() },
            { onConflict: "landlord_id" }
        );

    button.disabled = false;

    if (error) {
        console.error("[verify] NIN save failed:", error);
        setMessage("Your NIN could not be saved. Please check it and try again.", "error");
        return;
    }

    input.value = "";
    setMessage("NIN saved.", "success");
    showToast("NIN saved.", { type: "success" });
    await loadAll();
}

/* ---------- Proof of address ---------- */

function renderDocuments() {
    const drop = $("addressDropZone");
    const input = $("addressFile");
    const state = latestDoc?.status ?? "none";
    const locked = state === "verified" || state === "pending" || !details;

    if (drop) drop.classList.toggle("disabled", locked);
    if (input) input.disabled = locked;

    setText("docCount", state === "verified" ? "1/1" : "0/1");

    const list = $("uploadedDocs");
    if (!list) return;

    if (!latestDoc) {
        list.replaceChildren(emptyState(
            details ? "No documents uploaded yet" : "Save your NIN first, then upload your proof of address.",
            "Your documents will appear here once you upload them."
        ));
        return;
    }

    const card = element("div", "vf-doc");
    card.append(
        element("strong", "", "Proof of address"),
        element("span", "", STATUS_LABEL[state] ?? state),
    );

    if (state === "rejected" && latestDoc.rejection_reason) {
        card.append(element("span", "", `Reason: ${latestDoc.rejection_reason}`));
    }

    list.replaceChildren(card);
}

const STATUS_LABEL = {
    pending: "Waiting for review",
    verified: "Approved",
    rejected: "Needs attention",
};

async function uploadAddress(file, input) {
    if (!file || !me) return;

    if (!ALLOWED.includes(file.type)) {
        setMessage("Upload a JPG, PNG, WebP or PDF file.", "error");
        input.value = "";
        return;
    }

    if (file.size > MAX_BYTES) {
        setMessage("Each file must be 10 MB or smaller.", "error");
        input.value = "";
        return;
    }

    setMessage("Uploading...", "info");
    input.disabled = true;

    const extension =
        file.type === "application/pdf" ? "pdf" :
            file.type === "image/png" ? "png" :
                file.type === "image/webp" ? "webp" : "jpg";

    const path = `${me.id}/address-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
        console.error("[verify] upload failed:", uploadError);
        input.disabled = false;
        input.value = "";
        setMessage("The document could not be uploaded. Please try again.", "error");
        return;
    }

    const { error: rowError } = await supabase.from("verification_documents").insert({
        user_id: me.id,
        document_type: "address",
        storage_path: path,
        mime_type: file.type,
        file_size_bytes: file.size,
        status: "pending",
    });

    if (rowError) {
        console.error("[verify] record failed:", rowError);
        input.disabled = false;
        input.value = "";
        setMessage("The document was uploaded but could not be recorded. Please try again.", "error");
        return;
    }

    input.value = "";
    setMessage("Proof of address uploaded. It is now waiting for review.", "success");
    showToast("Document uploaded.", { type: "success" });
    await loadAll();
}

/* ---------- Helpers ---------- */

function row(icon, label, value, muted = false) {
    const node = element("div", "vf-row");

    const iconBox = element("span", "vf-row-icon");
    iconBox.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;

    const labelNode = element("span", "vf-row-label", label);
    const valueNode = element("span", `vf-row-value${muted ? " muted" : ""}`, value);

    node.append(iconBox, labelNode, valueNode);
    return node;
}

function emptyState(title, text) {
    const box = element("div", "vf-empty");
    const icon = element("i");
    icon.className = "fa-solid fa-file-circle-plus";
    box.append(icon, element("strong", "", title), element("span", "", text));
    return box;
}

function setMessage(text, type = "info") {
    const node = $("verifyMessage");
    if (!node) return;
    node.textContent = text;
    node.className = `vf-message ${type}`;
}

function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
}

function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}