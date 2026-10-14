// js/landlord_Profile_edit.js

import {
    supabase,
    getCurrentUser,
    getProfile
} from "./core/api.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const AVATAR_BUCKET = "profile-images";


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentProfile = null;
let selectedImage = null;
let originalProfile = null;


/* =========================================================
   DOM ELEMENTS
========================================================= */

const profilePreview =
    document.getElementById("profilePreview");

const profileImage =
    document.getElementById("profileImage");

const fullName =
    document.getElementById("fullName");

const email =
    document.getElementById("email");

const phone =
    document.getElementById("phone");

const gender =
    document.getElementById("gender");

const dob =
    document.getElementById("dob");

const businessName =
    document.getElementById("businessName");

const cacNumber =
    document.getElementById("cacNumber");

const businessDescription =
    document.getElementById("businessDescription");

const emergencyName =
    document.getElementById("emergencyName");

const emergencyRelationship =
    document.getElementById("emergencyRelationship");

const emergencyPhone =
    document.getElementById("emergencyPhone");

const saveProfileBtn =
    document.getElementById("saveProfileBtn");

const cancelEditBtn =
    document.getElementById("cancelEditBtn");


/* =========================================================
   UTILITIES
========================================================= */

function escapeText(value) {
    return String(value ?? "").trim();
}


function setButtonLoading(button, loading, loadingText) {
    if (!button) {
        return;
    }

    if (loading) {
        button.dataset.originalHtml =
            button.innerHTML;

        button.disabled = true;

        button.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            ${loadingText}
        `;

        button.setAttribute(
            "aria-busy",
            "true"
        );

        return;
    }

    button.disabled = false;

    if (button.dataset.originalHtml) {
        button.innerHTML =
            button.dataset.originalHtml;
    }

    button.removeAttribute("aria-busy");
}


function showMessage(message, type = "error") {
    /*
     * Use an existing global toast if the UI module
     * provides one.
     */

    if (
        typeof window.showToast ===
        "function"
    ) {
        window.showToast(
            message,
            type
        );

        return;
    }

    /*
     * Otherwise use a lightweight accessible notice.
     */

    let notice =
        document.getElementById(
            "profileNotice"
        );

    if (!notice) {
        notice =
            document.createElement("div");

        notice.id =
            "profileNotice";

        notice.setAttribute(
            "role",
            "alert"
        );

        notice.style.position =
            "fixed";

        notice.style.top =
            "20px";

        notice.style.right =
            "20px";

        notice.style.zIndex =
            "9999";

        document.body.appendChild(
            notice
        );
    }

    notice.textContent =
        message;

    notice.dataset.type =
        type;

    window.setTimeout(() => {
        notice?.remove();
    }, 5000);
}


function redirectToLogin() {
    window.location.href =
        "../auth/landlord_login.htm";
}


function redirectToDashboard() {
    window.location.href =
        "./dashboard_landlord.htm";
}


/* =========================================================
   AUTHENTICATION
========================================================= */

async function loadAuthenticatedUser() {
    const result =
        await getCurrentUser();

    if (
        !result.success ||
        !result.data
    ) {
        redirectToLogin();
        return false;
    }

    currentUser =
        result.data;

    const profileResult =
        await getProfile(
            currentUser.id
        );

    if (
        !profileResult.success ||
        !profileResult.data
    ) {
        console.error(
            "[ResiHub Profile] Profile could not be loaded:",
            profileResult.error
        );

        showMessage(
            "Unable to load your profile.",
            "error"
        );

        return false;
    }

    currentProfile =
        profileResult.data;

    if (
        currentProfile.role !==
        "landlord"
    ) {
        showMessage(
            "You do not have permission to access this page.",
            "error"
        );

        window.location.href =
            "../general/index.htm";

        return false;
    }

    originalProfile =
        structuredCloneSafe(
            currentProfile
        );

    return true;
}


/* =========================================================
   SAFE CLONE
========================================================= */

function structuredCloneSafe(value) {
    if (
        typeof structuredClone ===
        "function"
    ) {
        return structuredClone(value);
    }

    return JSON.parse(
        JSON.stringify(value)
    );
}


/* =========================================================
   LOAD PROFILE DATA
========================================================= */

function populateProfile() {
    if (!currentUser || !currentProfile) {
        return;
    }

    const name =
        escapeText(
            currentProfile.full_name
        );

    const userPhone =
        escapeText(
            currentProfile.phone
        );

    if (fullName) {
        fullName.value =
            name;
    }

    if (email) {
        email.value =
            currentUser.email ||
            "";
    }

    if (phone) {
        phone.value =
            userPhone;
    }

    if (profilePreview) {
        profilePreview.src =
            currentProfile.avatar_url ||
            "../assets/images/default-avatar.png";

        profilePreview.alt =
            name
                ? `${name} profile photo`
                : "Landlord profile photo";
    }

    /*
     * These fields are currently not part of the
     * profiles schema supplied for ResiHub.
     *
     * We deliberately do not populate them from
     * invented database columns.
     */

    if (gender) {
        gender.value = "";
    }

    if (dob) {
        dob.value = "";
    }

    if (businessName) {
        businessName.value = "";
    }

    if (cacNumber) {
        cacNumber.value = "";
    }

    if (businessDescription) {
        businessDescription.value = "";
    }

    if (emergencyName) {
        emergencyName.value = "";
    }

    if (emergencyRelationship) {
        emergencyRelationship.value = "";
    }

    if (emergencyPhone) {
        emergencyPhone.value = "";
    }
}


/* =========================================================
   IMAGE SELECTION
========================================================= */

function handleImageSelection(event) {
    const file =
        event.target.files?.[0];

    if (!file) {
        selectedImage = null;
        return;
    }

    if (!file.type.startsWith("image/")) {
        showMessage(
            "Please select a valid image file.",
            "error"
        );

        event.target.value = "";
        selectedImage = null;

        return;
    }

    /*
     * Keep profile images reasonably sized.
     * This protects the upload flow from accidentally
     * sending very large files.
     */

    const MAX_SIZE =
        5 * 1024 * 1024;

    if (file.size > MAX_SIZE) {
        showMessage(
            "Profile images must be 5 MB or smaller.",
            "error"
        );

        event.target.value = "";
        selectedImage = null;

        return;
    }

    selectedImage =
        file;

    const previewUrl =
        URL.createObjectURL(file);

    if (profilePreview) {
        profilePreview.src =
            previewUrl;
    }

    /*
     * Release the temporary object URL after the
     * image has loaded.
     */

    profilePreview?.addEventListener(
        "load",
        () => {
            URL.revokeObjectURL(
                previewUrl
            );
        },
        {
            once: true
        }
    );
}


/* =========================================================
   UPLOAD PROFILE IMAGE
========================================================= */

async function uploadProfileImage(file) {
    if (!file || !currentUser) {
        return null;
    }

    const fileExtension =
        file.name
            .split(".")
            .pop()
            ?.toLowerCase() ||
        "jpg";

    const safeExtension =
        /^[a-z0-9]+$/.test(
            fileExtension
        )
            ? fileExtension
            : "jpg";

    /*
     * Use the authenticated user's ID as the
     * ownership boundary.
     */

    const filePath =
        `${currentUser.id}/avatar-${Date.now()}.${safeExtension}`;

    const {
        error: uploadError
    } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(
            filePath,
            file,
            {
                cacheControl: "3600",
                upsert: true,
                contentType: file.type
            }
        );

    if (uploadError) {
        throw uploadError;
    }

    const {
        data
    } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(
            filePath
        );

    return data?.publicUrl ||
        null;
}


/* =========================================================
   SAVE PROFILE
========================================================= */

async function saveProfile() {
    if (!currentUser) {
        return;
    }

    const name =
        escapeText(
            fullName?.value
        );

    const userPhone =
        escapeText(
            phone?.value
        );

    if (!name) {
        showMessage(
            "Please enter your full name.",
            "error"
        );

        fullName?.focus();

        return;
    }

    if (
        userPhone &&
        userPhone.length < 7
    ) {
        showMessage(
            "Please enter a valid phone number.",
            "error"
        );

        phone?.focus();

        return;
    }

    setButtonLoading(
        saveProfileBtn,
        true,
        "Saving..."
    );

    try {
        let avatarUrl =
            currentProfile.avatar_url ||
            null;

        /*
         * Upload a new avatar first, if selected.
         */

        if (selectedImage) {
            avatarUrl =
                await uploadProfileImage(
                    selectedImage
                );
        }

        const updates = {
            full_name: name,
            phone: userPhone || null,
            avatar_url: avatarUrl
        };

        const {
            data,
            error
        } = await supabase
            .from("profiles")
            .update(updates)
            .eq(
                "id",
                currentUser.id
            )
            .select()
            .single();

        if (error) {
            throw error;
        }

        currentProfile =
            data;

        originalProfile =
            structuredCloneSafe(
                data
            );

        selectedImage =
            null;

        if (profileImage) {
            profileImage.value =
                "";
        }

        showMessage(
            "Your profile has been updated successfully.",
            "success"
        );

    } catch (error) {
        console.error(
            "[ResiHub Profile] Failed to save profile:",
            error
        );

        showMessage(
            getProfileErrorMessage(
                error
            ),
            "error"
        );

    } finally {
        setButtonLoading(
            saveProfileBtn,
            false
        );
    }
}


/* =========================================================
   ERROR MESSAGES
========================================================= */

function getProfileErrorMessage(error) {
    const message =
        String(
            error?.message ||
            ""
        ).toLowerCase();

    if (
        message.includes(
            "row-level security"
        ) ||
        message.includes(
            "permission denied"
        ) ||
        message.includes(
            "violates row-level security"
        )
    ) {
        return "You are not allowed to update this profile.";
    }

    if (
        message.includes(
            "duplicate"
        )
    ) {
        return "This profile information conflicts with an existing record.";
    }

    return (
        error?.message ||
        "Unable to save your profile. Please try again."
    );
}


/* =========================================================
   CANCEL
========================================================= */

function cancelEditing() {
    /*
     * If nothing has changed, leave immediately.
     */

    if (!originalProfile) {
        redirectToDashboard();
        return;
    }

    const currentName =
        escapeText(
            fullName?.value
        );

    const currentPhone =
        escapeText(
            phone?.value
        );

    const originalName =
        escapeText(
            originalProfile.full_name
        );

    const originalPhone =
        escapeText(
            originalProfile.phone
        );

    const hasChanges =
        currentName !== originalName ||
        currentPhone !== originalPhone ||
        selectedImage !== null;

    if (hasChanges) {
        const confirmed =
            window.confirm(
                "You have unsaved changes. Leave without saving?"
            );

        if (!confirmed) {
            return;
        }
    }

    redirectToDashboard();
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function initEvents() {
    profileImage?.addEventListener(
        "change",
        handleImageSelection
    );

    saveProfileBtn?.addEventListener(
        "click",
        saveProfile
    );

    cancelEditBtn?.addEventListener(
        "click",
        cancelEditing
    );

    /*
     * Warn before leaving with an unsaved image.
     */

    window.addEventListener(
        "beforeunload",
        (event) => {
            if (!selectedImage) {
                return;
            }

            event.preventDefault();

            event.returnValue = "";
        }
    );
}


/* =========================================================
   INITIALIZATION
========================================================= */

async function initialize() {
    try {
        const authenticated =
            await loadAuthenticatedUser();

        if (!authenticated) {
            return;
        }

        populateProfile();

        initEvents();

        console.log(
            "[ResiHub] Landlord profile edit initialized successfully."
        );

    } catch (error) {
        console.error(
            "[ResiHub Profile] Initialization failed:",
            error
        );

        showMessage(
            "Unable to initialize the profile page.",
            "error"
        );
    }
}


/* =========================================================
   START
========================================================= */

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initialize,
        {
            once: true
        }
    );
} else {
    initialize();
}