import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN PROFILE
   The signed-in admin's own details (design 12).
   Name and phone are saved to the profile. The password is
   changed only after the current password is confirmed.
   Photo upload and security switches are not available yet.
========================================= */

const ROLE_TITLE = {
    super_admin: "Super Administrator",
    admin: "Administrator",
};

const MIN_PASSWORD = 8;

const dateFormat = new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

const DEFAULT_AVATAR = "../assets/images/default-avatar.png";

const state = {
    user: null,
    profile: null,
};

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function setValue(id, value) {
    const el = $(id);
    if (el) el.value = value;
}

function valueOf(id) {
    return $(id)?.value ?? "";
}

/* ---------- Data ---------- */

async function loadProfile() {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
        throw new Error("Not signed in");
    }
    state.user = userData.user;

    const { data, error } = await supabase
        .from("profiles")
        .select("id, role, full_name, phone, avatar_url")
        .eq("id", state.user.id)
        .maybeSingle();

    if (error) throw error;
    state.profile = data ?? { id: state.user.id, role: "admin" };
}

function renderProfile() {
    const profile = state.profile;
    const user = state.user;
    const roleTitle = ROLE_TITLE[profile.role] ?? "Administrator";

    setText("adminName", profile.full_name || user.email || "Administrator");
    setText("adminRole", roleTitle);

    setValue("fullName", profile.full_name ?? "");
    setValue("email", user.email ?? "");
    setValue("phone", profile.phone ?? "");
    setValue("position", roleTitle);

    setText("joinDate", user.created_at ? dateFormat.format(new Date(user.created_at)) : "—");
    setText("lastLogin", user.last_sign_in_at ? dateFormat.format(new Date(user.last_sign_in_at)) : "—");
    setText("activeSessions", "—");

    const image = $("adminProfileImage");
    if (image) image.src = profile.avatar_url || DEFAULT_AVATAR;

    // Not editable here: email and role are managed elsewhere
    ["email", "position", "enable2FA", "loginNotification", "profileImageUpload"].forEach((id) => {
        const el = $(id);
        if (el) el.disabled = true;
    });
}

function clearPasswordFields() {
    setValue("currentPassword", "");
    setValue("newPassword", "");
    setValue("confirmPassword", "");
}

/* ---------- Saving ---------- */

async function saveProfile(event) {
    event.preventDefault();

    const fullName = valueOf("fullName").trim();
    const phone = valueOf("phone").trim();
    const currentPassword = valueOf("currentPassword");
    const newPassword = valueOf("newPassword");
    const confirmPassword = valueOf("confirmPassword");

    if (!fullName) {
        showToast("Enter your full name.", { type: "error" });
        return;
    }

    const changingPassword = Boolean(currentPassword || newPassword || confirmPassword);

    if (changingPassword) {
        if (!currentPassword) {
            showToast("Enter your current password to change it.", { type: "error" });
            return;
        }
        if (newPassword.length < MIN_PASSWORD) {
            showToast(`The new password must be at least ${MIN_PASSWORD} characters.`, { type: "error" });
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast("The new passwords do not match.", { type: "error" });
            return;
        }
    }

    const button = $("saveProfileBtn");
    if (button) button.disabled = true;

    const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, phone: phone || null })
        .eq("id", state.user.id);

    if (error) {
        if (button) button.disabled = false;
        console.error("[admin_profile] save failed:", error);
        showToast(error.message || "Your details could not be saved.", { type: "error" });
        return;
    }

    if (changingPassword) {
        const { error: checkError } = await supabase.auth.signInWithPassword({
            email: state.user.email,
            password: currentPassword,
        });

        if (checkError) {
            if (button) button.disabled = false;
            showToast("Your current password is incorrect. Your details were saved.", { type: "error" });
            return;
        }

        const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });

        if (passwordError) {
            if (button) button.disabled = false;
            showToast(passwordError.message || "The password could not be changed.", { type: "error" });
            return;
        }

        clearPasswordFields();
    }

    showToast("Profile saved.", { type: "success" });

    await loadProfile();
    renderProfile();
    if (button) button.disabled = false;
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_profile" });

    $("adminProfileForm")?.addEventListener("submit", saveProfile);

    loadProfile()
        .then(renderProfile)
        .catch((error) => {
            console.error("[admin_profile] could not load profile:", error);
            showToast("Your profile could not be loaded.", { type: "error" });
        });
}