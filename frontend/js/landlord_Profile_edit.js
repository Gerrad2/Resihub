import { getCurrentUser, supabase } from "./api.js";
import { showError } from "./student_utils.js";
import { showToast } from "./ui/toast.js";

const $ = (id) => document.getElementById(id);

const DEFAULT_AVATAR = "../assets/images/default-avatar.png";
const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

let me = null;
let originalCac = "";

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
        showError("Your profile could not be loaded.");
        return;
    }

    originalCac = data.cac_number ?? "";

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
    const { data: details } = await supabase
        .from("verification_details")
        .select("nin")
        .eq("landlord_id", me.id)
        .maybeSingle();

    if (details?.nin) {
        setValue("nin", "");
        $("nin").placeholder = `Saved ending in ${details.nin.slice(-3)}. Enter a new NIN to change it.`;
    }
}

async function saveProfile(event) {
    event.preventDefault();

    const fullName = $("fullName").value.trim();
    if (!fullName) {
        setMessage("Please enter your full name.", "error");
        $("fullName").focus();
        return;
    }

    const cac = valueOrNull("cacNumber");
    const cacChanged = (cac ?? "") !== originalCac;

    const button = $("saveProfileBtn");
    button.disabled = true;
    setMessage("Saving...", "info");

    const { error } = await supabase
        .from("profiles")
        .update({
            full_name: fullName,
            phone: valueOrNull("phone"),
            gender: valueOrNull("gender"),
            date_of_birth: valueOrNull("dob"),
            business_name: valueOrNull("businessName"),
            cac_number: cac,
            business_description: valueOrNull("businessDescription"),
            emergency_name: valueOrNull("emergencyName"),
            emergency_relationship: valueOrNull("emergencyRelationship"),
            emergency_phone: valueOrNull("emergencyPhone"),
        })
        .eq("id", me.id);

    button.disabled = false;

    if (error) {
        console.error("[landlord_profile_edit] save failed:", error);
        setMessage("Your profile could not be saved. Please try again.", "error");
        return;
    }

    const nin = valueOrNull("nin");
    if (nin) {
        if (!/^\d{11}$/.test(nin)) {
            setMessage("Your NIN must be exactly 11 digits.", "error");
            button.disabled = false;
            return;
        }

        const { error: ninError } = await supabase
            .from("verification_details")
            .upsert(
                { landlord_id: me.id, nin, address: valueOrNull("address") ?? "", updated_at: new Date().toISOString() },
                { onConflict: "landlord_id" }
            );

        if (ninError) {
            console.error("[landlord_profile_edit] NIN save failed:", ninError);
            setMessage("Your NIN could not be saved. Please try again.", "error");
            button.disabled = false;
            return;
        }
    }

    originalCac = cac ?? "";

    const message = cacChanged && cac
        ? "Saved. Your CAC number has been sent for verification."
        : "Profile saved.";

    setMessage(message, "success");
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
        showToast("Your photo could not be uploaded. Please try again.", { type: "error" });
        return;
    }

    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

    const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl })
        .eq("id", me.id);

    if (updateError) {
        console.error("[landlord_profile_edit] avatar save failed:", updateError);
        showToast("Your photo was uploaded, but could not be saved to your profile.", { type: "error" });
        return;
    }

    $("profilePreview")?.setAttribute("src", data.publicUrl);
    showToast("Profile photo updated.", { type: "success" });
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