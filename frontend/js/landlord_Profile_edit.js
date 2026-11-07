import { getCurrentUser, supabase } from "./api.js";
import { showError } from "./student_utils.js";
import { showToast } from "./ui/toast.js";

const $ = (id) => document.getElementById(id);

const DEFAULT_AVATAR = "../assets/images/default-avatar.png";
const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

let me = null;
let originalCac = "";
let originalAddress = "";

export async function init() {
    bindEvents();

    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;

    if (!me) {
        showError("Please sign in to edit your profile.");
        return;
    }

    await loadProfile();
}

function bindEvents() {
    $("landlordProfileForm")?.addEventListener("submit", saveProfile);
    $("profileImage")?.addEventListener("change", (event) => uploadAvatar(event.target.files[0]));
}

async function loadProfile() {
    const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", me.id)
        .maybeSingle();

    if (error || !data) {
        console.error("[landlord_profile_edit] load failed:", error);
        showError("Your profile could not be loaded. Please refresh the page.");
        return;
    }

    originalCac = data.cac_number ?? "";
    originalAddress = data.address ?? "";

    setValue("fullName", data.full_name);
    setValue("email", me.email);
    setValue("phone", data.phone);
    setValue("gender", data.gender);
    setValue("dob", data.date_of_birth);
    setValue("businessName", data.business_name);
    setValue("address", data.address);
    setValue("cacNumber", data.cac_number);
    setValue("businessDescription", data.business_description);
    setValue("emergencyName", data.emergency_name);
    setValue("emergencyRelationship", data.emergency_relationship);
    setValue("emergencyPhone", data.emergency_phone);

    $("profilePreview")?.setAttribute("src", data.avatar_url || DEFAULT_AVATAR);

    const { data: details, error: detailsError } = await supabase
        .from("verification_details")
        .select("nin")
        .eq("landlord_id", me.id)
        .maybeSingle();

    if (detailsError) {
        console.error("[landlord_profile_edit] NIN lookup failed:", detailsError);
        return;
    }

    if (details?.nin) {
        setValue("nin", "");
        $("nin").placeholder = `Saved ending in ${details.nin.slice(-3)}. Enter a new NIN to change it.`;
    }
}

async function saveProfile(event) {
    event.preventDefault();

    /* Check everything first, so a mistake never leaves a half-saved profile */

    const fullName = $("fullName").value.trim();
    if (!fullName) {
        setMessage("Please enter your full name.", "error");
        $("fullName").focus();
        return;
    }

    const nin = valueOrNull("nin");
    if (nin && !/^\d{11}$/.test(nin)) {
        setMessage("Your NIN must be exactly 11 digits.", "error");
        $("nin").focus();
        return;
    }

    const address = valueOrNull("address");
    const cac = valueOrNull("cacNumber");
    const cacChanged = (cac ?? "") !== originalCac;
    const addressChanged = (address ?? "") !== originalAddress;

    const button = $("saveProfileBtn");
    button.disabled = true;
    setMessage("Saving...", "info");

    // 1. Profile
    const { error: profileError } = await supabase
        .from("profiles")
        .update({
            full_name: fullName,
            phone: valueOrNull("phone"),
            gender: valueOrNull("gender"),
            date_of_birth: valueOrNull("dob"),
            business_name: valueOrNull("businessName"),
            address,
            cac_number: cac,
            business_description: valueOrNull("businessDescription"),
            emergency_name: valueOrNull("emergencyName"),
            emergency_relationship: valueOrNull("emergencyRelationship"),
            emergency_phone: valueOrNull("emergencyPhone"),
        })
        .eq("id", me.id);

    if (profileError) {
        console.error("[landlord_profile_edit] profile save failed:", profileError);
        finish(`Your profile could not be saved: ${profileError.message}`, "error");
        return;
    }

    // 2. Identity record: a new NIN, or an address change that must be copied across
    if (nin) {
        const { error: ninError } = await supabase
            .from("verification_details")
            .upsert(
                { landlord_id: me.id, nin, address: address ?? "", updated_at: new Date().toISOString() },
                { onConflict: "landlord_id" }
            );

        if (ninError) {
            console.error("[landlord_profile_edit] NIN save failed:", ninError);
            finish(`Your profile was saved, but your NIN could not be saved: ${ninError.message}`, "error");
            return;
        }
    } else if (address) {
        const { error: addressError } = await supabase
            .from("verification_details")
            .update({ address, updated_at: new Date().toISOString() })
            .eq("landlord_id", me.id);

        if (addressError) {
            console.error("[landlord_profile_edit] identity address sync failed:", addressError);
            finish(`Your profile was saved, but your identity address could not be updated: ${addressError.message}`, "error");
            return;
        }
    }

    originalCac = cac ?? "";
    originalAddress = address ?? "";

    let message = "Profile saved.";
    if (cacChanged && cac) {
        message = "Saved. Your CAC number has been sent for verification.";
    }

    finish(message, "success");
    showToast(message, { type: "success" });

    setTimeout(() => {
        window.location.href = "landlord_profile.htm";
    }, 1200);
}

async function uploadAvatar(file) {
    if (!file || !me) return;

    if (!file.type.startsWith("image/")) {
        showToast("Please choose an image file.", { type: "error" });
        return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
        showToast("Photo must be 5 MB or smaller.", { type: "error" });
        return;
    }

    const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${me.id}/avatar-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

    if (uploadError) {
        console.error("[landlord_profile_edit] avatar upload failed:", uploadError);
        showToast(`Your photo could not be uploaded: ${uploadError.message}`, { type: "error" });
        return;
    }

    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

    const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl })
        .eq("id", me.id);

    if (updateError) {
        console.error("[landlord_profile_edit] avatar save failed:", updateError);
        showToast(`Your photo was uploaded, but could not be saved: ${updateError.message}`, { type: "error" });
        return;
    }

    $("profilePreview")?.setAttribute("src", data.publicUrl);
    showToast("Profile photo updated.", { type: "success" });
}

function finish(text, type) {
    const button = $("saveProfileBtn");
    if (button) button.disabled = false;
    setMessage(text, type);
}

function setValue(id, value) {
    const node = $(id);
    if (node) node.value = value ?? "";
}

function valueOrNull(id) {
    const value = $(id)?.value.trim();
    return value ? value : null;
}

function setMessage(text, type = "info") {
    const node = $("landlordProfileMessage");
    if (!node) return;
    node.textContent = text;
    node.className = `ep-hint ${type}`;
}