import { getCurrentUser, getUniversities, supabase } from "../../api.js";
import { showToast } from "../../ui/toast.js";

const $ = (id) => document.getElementById(id);

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const DEFAULT_AVATAR = "../assets/images/default-avatar.png";

let currentUser = null;

export async function init() {
    bindEvents();

    const userResult = await getCurrentUser();
    currentUser = userResult.success ? userResult.data : null;

    if (!currentUser) return;

    await populateUniversities();
    await loadProfile();
}

function bindEvents() {
    $("editProfileForm")?.addEventListener("submit", saveProfile);
    $("profileImage")?.addEventListener("change", (event) => {
        uploadAvatar(event.target.files[0]);
    });
    const dob = $("dob");
    if (dob) {
        const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
        dob.min = "1940-01-01";
        dob.max = now.toISOString().slice(0, 10);
    }
}

async function populateUniversities() {
    const result = await getUniversities();
    if (!result.success) return;

    const select = $("university");
    result.data.forEach((university) => {
        select.append(new Option(university.name, university.name));
    });
}

async function loadProfile() {
    const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error || !data) {
        showToast("Your profile could not be loaded.", { type: "error" });
        return;
    }

    setValue("fullName", data.full_name);
    setValue("email", currentUser.email);
    setValue("phone", data.phone);
    setValue("gender", data.gender);
    setValue("dob", data.date_of_birth);
    setSelectWithFallback("university", data.university);
    setValue("faculty", data.faculty);
    setValue("department", data.department);
    setValue("level", data.level);
    setValue("matricNumber", data.matric_number);
    setValue("state", data.state);
    setValue("emergencyName", data.emergency_name);
    setValue("emergencyRelationship", data.emergency_relationship);
    setValue("emergencyPhone", data.emergency_phone);

    $("profilePreview")?.setAttribute("src", data.avatar_url || DEFAULT_AVATAR);
}

async function saveProfile(event) {
    event.preventDefault();

    const fullName = $("fullName").value.trim();
    if (!fullName) {
        showToast("Please enter your full name.", { type: "error" });
        $("fullName").focus();
        return;
    }

    const button = $("saveProfileBtn");
    button.disabled = true;

    const { error } = await supabase
        .from("profiles")
        .update({
            full_name: fullName,
            phone: valueOrNull("phone"),
            gender: valueOrNull("gender"),
            date_of_birth: valueOrNull("dob"),
            university: valueOrNull("university"),
            faculty: valueOrNull("faculty"),
            department: valueOrNull("department"),
            level: valueOrNull("level"),
            matric_number: valueOrNull("matricNumber"),
            state: valueOrNull("state"),
            emergency_name: valueOrNull("emergencyName"),
            emergency_relationship: valueOrNull("emergencyRelationship"),
            emergency_phone: valueOrNull("emergencyPhone"),
        })
        .eq("id", currentUser.id);

    button.disabled = false;

    if (error) {
        showToast("Your profile could not be saved. Please try again.", { type: "error" });
        return;
    }

    showToast("Profile updated.", { type: "success" });

    setTimeout(() => {
        window.location.href = "../student/profile.htm";
    }, 1200);

}

async function uploadAvatar(file) {
    if (!file || !currentUser) return;

    if (!file.type.startsWith("image/")) {
        showToast("Please choose an image file.", { type: "error" });
        return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
        showToast("Photo must be 5 MB or smaller.", { type: "error" });
        return;
    }

    const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${currentUser.id}/avatar-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

    if (uploadError) {
        showToast("Your photo could not be uploaded. Please try again.", { type: "error" });
        return;
    }

    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

    const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl })
        .eq("id", currentUser.id);

    if (updateError) {
        showToast("Your photo was uploaded, but could not be saved to your profile.", { type: "error" });
        return;
    }

    $("profilePreview")?.setAttribute("src", data.publicUrl);
    showToast("Profile photo updated.", { type: "success" });
}

function setValue(id, value) {
    const el = $(id);
    if (el) el.value = value ?? "";
}

/* If the saved university is not in the list, add it so it still shows */
function setSelectWithFallback(id, value) {
    const select = $(id);
    if (!select) return;

    if (value && ![...select.options].some((option) => option.value === value)) {
        select.append(new Option(value, value));
    }

    select.value = value ?? "";
}

function valueOrNull(id) {
    const value = $(id)?.value.trim();
    return value ? value : null;
}