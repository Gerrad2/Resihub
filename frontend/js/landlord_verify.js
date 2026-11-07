import { getCurrentUser, supabase } from "./api.js";
import { showError } from "./student_utils.js";
import { showToast } from "./ui/toast.js";
import { watchTables } from "./core/realtime.js";

const $ = (id) => document.getElementById(id);

const BUCKET = "verification-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const RELATIONSHIPS = ["Spouse", "Parent", "Sibling", "Child", "Relative", "Friend", "Other"];
const DASHBOARD = "dashboard_landlord.htm";
const EDIT_PROFILE = "edit_landlord_profile.htm";

const STATUS_LABEL = {
    pending: "Waiting for review",
    verified: "Approved",
    rejected: "Needs attention",
};

let me = null;
let profile = null;
let details = null;
let latestDoc = null;
let tier = null;
let tierInfo = null;
let tierUsed = 0;

export async function init() {
    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;

    if (!me) {
        showError("Please sign in to verify your business.");
        return;
    }

    $("addressFile")?.addEventListener("change", (event) => uploadAddress(event.target.files[0], event.target));

    await loadAll();
    startLiveUpdates();
}

function startLiveUpdates() {
    watchTables(
        `verify-${me.id}`,
        [
            { table: "profiles", filter: `id=eq.${me.id}` },
            { table: "verification_details", filter: `landlord_id=eq.${me.id}` },
            { table: "verification_documents", filter: `user_id=eq.${me.id}` },
        ],
        () => loadAll()
    );
}

async function loadAll() {
    const [profileResult, detailsResult, docResult, tierResult, countResult] = await Promise.all([
        supabase.from("profiles")
            .select("id, address, verification_status, emergency_name, emergency_phone, emergency_relationship")
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
        supabase.rpc("resihub_landlord_tier", { p_user: me.id }),
        supabase.from("listings")
            .select("id", { count: "exact", head: true })
            .eq("landlord_id", me.id)
            .neq("publication_status", "archived"),
    ]);

    if (profileResult.error || !profileResult.data) {
        console.error("[verify] profile failed:", profileResult.error);
        showError("Your verification status could not be loaded.");
        return;
    }

    if (detailsResult.error || docResult.error || tierResult.error || countResult.error) {
        console.error("[verify] load failed:", {
            details: detailsResult.error,
            docs: docResult.error,
            tier: tierResult.error,
            count: countResult.error,
        });
        showError("Your verification details could not be loaded. Please refresh the page.");
        return;
    }

    profile = profileResult.data;
    details = detailsResult.data;
    latestDoc = docResult.data;
    tier = tierResult.data;
    tierUsed = countResult.count ?? 0;

    // Tier 2 means nothing is left to do here
    if (tier === "tier_2") {
        location.replace(DASHBOARD);
        return;
    }

    tierInfo = null;
    if (tier) {
        const { data, error } = await supabase
            .from("landlord_tiers")
            .select("label, max_listings")
            .eq("code", tier)
            .maybeSingle();

        if (error) console.error("[verify] tier lookup failed:", error);
        tierInfo = data ?? null;
    }

    render();
}

/* ---------- Address check ---------- */

function normaliseAddress(value) {
    return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

// True when the identity record was saved with a different address from the profile
function addressMismatch() {
    return Boolean(
        details &&
        profile?.address &&
        normaliseAddress(details.address) !== normaliseAddress(profile.address)
    );
}

/* ---------- Which step is shown ---------- */

function render() {
    const mismatch = addressMismatch();
    const onIdentity = tier === "none" || mismatch;
    const onAddress = tier === "tier_1";

    $("identityCard").hidden = !onIdentity;
    $("addressCard").hidden = !onAddress;

    renderHeader(mismatch);
    renderSteps(mismatch);
    renderTier();

    if (onIdentity) renderIdentityForm(mismatch);
    if (onAddress) {
        renderAddressOnFile();
        renderDocuments();
    }
}

function renderHeader(mismatch) {
    let text;

    if (mismatch) {
        text = "Your profile address has changed since your identity was saved. Update your profile to bring them back in line.";
    } else if (tier === "none") {
        text = "Step 1 of 2: enter your NIN and next of kin. Your business address comes from your profile. Once saved, you can list up to 2 properties.";
    } else if (tier === "tier_1" && latestDoc?.status === "pending") {
        text = "Your proof of address is under review. You'll be notified once it has been checked.";
    } else if (tier === "tier_1" && latestDoc?.status === "rejected") {
        text = "Your proof of address needs attention. Please upload it again.";
    } else if (tier === "tier_1") {
        text = "Step 2 of 2: upload your proof of address to list without a limit.";
    } else {
        text = "We couldn't load your verification progress. Please refresh the page.";
    }

    setText("verifyIntro", text);
}

function renderSteps(mismatch) {
    setStep("identity", tier === "tier_1" && !mismatch, tier === "none" || mismatch);
    setStep("address", false, tier === "tier_1");
}

function setStep(name, done, active) {
    const step = document.querySelector(`.vf-step[data-step="${name}"]`);
    if (!step) return;

    step.classList.toggle("done", done);
    step.classList.toggle("active", !done && active);
    step.querySelector(".vf-step-state").textContent = done ? "Completed" : active ? "In progress" : "Pending";
}

function renderTier() {
    if (tier === null) {
        setText("tierLabel", "Unavailable");
        setText("tierSummary", "Your tier could not be loaded. Please refresh the page.");
        return;
    }

    setText("tierLabel", tierInfo?.label ?? (tier === "none" ? "Not verified" : "Tier 1"));

    const summary = tier === "none"
        ? "Save your identity details to unlock up to 2 listings."
        : `Up to ${tierInfo?.max_listings ?? 2} listings (${tierUsed} in use). Upload your proof of address to list without a limit.`;

    setText("tierSummary", summary);
}

/* ---------- Step 1: identity ---------- */

function renderIdentityForm(mismatch) {
    const host = $("identityFormHost");
    if (!host) return;

    // No profile address yet: identity can't be saved until it is set on the profile
    if (!profile.address) {
        host.replaceChildren(
            element("p", "vf-message error", "Add your business address on your profile first. Your identity record and proof of address must show it."),
            editProfileLink("Add my address")
        );
        return;
    }

    // Profile and identity record disagree: the fix happens on the profile page
    if (mismatch) {
        host.replaceChildren(
            element("p", "vf-message error", "Your identity record has an older address. Save your profile again to update it."),
            editProfileLink("Update my profile")
        );
        return;
    }

    const form = element("form", "vf-nin-form vf-identity-form");

    if (details) {
        form.append(element("p", "vf-muted", "You've already saved your identity details. Update any field and save again."));
    }

    const addressLine = element("p", "vf-muted", `Business address: ${profile.address}`);

    const nin = element("input", "vf-input");
    nin.type = "text";
    nin.inputMode = "numeric";
    nin.maxLength = 11;
    nin.placeholder = "Your 11-digit NIN";
    nin.autocomplete = "off";
    nin.required = true;

    const kinName = element("input", "vf-input");
    kinName.type = "text";
    kinName.placeholder = "Next of kin full name";
    kinName.autocomplete = "off";
    kinName.required = true;
    kinName.value = profile.emergency_name ?? "";

    const kinPhone = element("input", "vf-input");
    kinPhone.type = "tel";
    kinPhone.placeholder = "Next of kin phone (e.g. 08012345678)";
    kinPhone.required = true;
    kinPhone.value = profile.emergency_phone ?? "";

    const kinRelation = element("select", "vf-input");
    kinRelation.required = true;
    kinRelation.append(new Option("Relationship to you", ""));
    for (const option of RELATIONSHIPS) {
        kinRelation.append(new Option(option, option));
    }
    kinRelation.value = profile.emergency_relationship ?? "";

    const button = element("button", "vf-action", "Save and continue");
    button.type = "submit";

    form.append(addressLine, nin, kinName, kinPhone, kinRelation, button);
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        saveIdentity(
            {
                nin: nin.value.trim(),
                name: kinName.value.trim(),
                phone: kinPhone.value.replace(/[\s-]/g, ""),
                relationship: kinRelation.value,
            },
            button
        );
    });

    host.replaceChildren(form);
}

async function saveIdentity({ nin, name, phone, relationship }, button) {
    if (!profile.address) {
        setMessage("Add your business address on your profile first.", "error", "identityMessage");
        return;
    }

    if (!/^\d{11}$/.test(nin)) {
        setMessage("Your NIN must be exactly 11 digits.", "error", "identityMessage");
        return;
    }

    if (!name) {
        setMessage("Enter the full name of your next of kin.", "error", "identityMessage");
        return;
    }

    if (!/^(\+234|0)\d{10}$/.test(phone)) {
        setMessage("Enter a valid Nigerian phone number for your next of kin, such as 08012345678.", "error", "identityMessage");
        return;
    }

    if (!RELATIONSHIPS.includes(relationship)) {
        setMessage("Choose how your next of kin is related to you.", "error", "identityMessage");
        return;
    }

    button.disabled = true;

    const { error: profileError } = await supabase
        .from("profiles")
        .update({
            emergency_name: name,
            emergency_phone: phone,
            emergency_relationship: relationship,
        })
        .eq("id", me.id);

    if (profileError) {
        button.disabled = false;
        console.error("[verify] next of kin save failed:", profileError);
        setMessage(`Your next of kin details could not be saved: ${profileError.message}`, "error", "identityMessage");
        return;
    }

    // The identity record takes its address from the profile, so the two always match
    const { error: ninError } = await supabase
        .from("verification_details")
        .upsert(
            { landlord_id: me.id, nin, address: profile.address, updated_at: new Date().toISOString() },
            { onConflict: "landlord_id" }
        );

    button.disabled = false;

    if (ninError) {
        console.error("[verify] NIN save failed:", ninError);
        setMessage(`Your NIN could not be saved: ${ninError.message}`, "error", "identityMessage");
        return;
    }

    showToast("Identity saved.", { type: "success" });
    await loadAll();
    setMessage("Identity saved. Upload your proof of address to finish.", "success", "identityMessage");
}

/* ---------- Step 2: proof of address ---------- */

function renderAddressOnFile() {
    const node = $("addressOnFile");
    if (!node) return;

    node.replaceChildren();

    if (!profile.address) {
        node.append("No business address on your profile yet. ", editProfileLink("Add your address"));
        return;
    }

    node.append(
        `Address on your profile: ${profile.address}. Your proof of address must show this address. `,
        editProfileLink("Change address")
    );
}

function renderDocuments() {
    const drop = $("addressDropZone");
    const input = $("addressFile");
    const pending = latestDoc?.status === "pending";

    if (drop) drop.classList.toggle("disabled", pending);
    if (input) input.disabled = pending;

    setText("docCount", latestDoc ? "1/1" : "0/1");

    const list = $("uploadedDocs");
    if (!list) return;

    if (!latestDoc) {
        list.replaceChildren(emptyState(
            "No document uploaded yet",
            "Your document will appear here once you upload it."
        ));
        return;
    }

    const card = element("div", "vf-doc");
    card.append(
        element("strong", "", "Proof of address"),
        element("span", "", STATUS_LABEL[latestDoc.status] ?? latestDoc.status),
    );

    if (latestDoc.status === "rejected" && latestDoc.rejection_reason) {
        card.append(element("span", "", `Reason: ${latestDoc.rejection_reason}`));
    }

    list.replaceChildren(card);
}

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

    setMessage("Proof of address submitted. Taking you back to your dashboard...", "success");
    showToast("Proof of address submitted for review.", { type: "success" });
    setTimeout(() => {
        location.href = DASHBOARD;
    }, 1500);
}

/* ---------- Helpers ---------- */

function editProfileLink(text) {
    const link = element("a", "", text);
    link.href = EDIT_PROFILE;
    return link;
}

function emptyState(title, text) {
    const box = element("div", "vf-empty");
    const icon = element("i");
    icon.className = "fa-solid fa-file-circle-plus";
    box.append(icon, element("strong", "", title), element("span", "", text));
    return box;
}

function setMessage(text, type = "info", targetId = "verifyMessage") {
    const node = $(targetId);
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