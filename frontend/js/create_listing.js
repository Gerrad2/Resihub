// js/create_listing.js

import {
    supabase,
    getCurrentUser
} from "./core/api.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const MAX_IMAGES = 10;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp"
];


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let selectedImages = [];
let uploadedStoragePaths = [];


/* =========================================================
   DOM ELEMENTS
========================================================= */

const form = document.getElementById("createListingForm");
const imageInput = document.getElementById("propertyImages");
const imagePreview = document.getElementById("imagePreview");
const uploadZone = document.getElementById("imageUploadZone");

const publishButton = document.getElementById("publishListingBtn");
const draftButton = document.getElementById("saveDraftBtn");


/* =========================================================
   UTILITY
========================================================= */

function showMessage(message, type = "info") {
    console[type === "error" ? "error" : "log"](
        `[ResiHub] ${message}`
    );

    // Use an existing toast system if your project has one.
    // Otherwise fall back to a simple alert.
    if (typeof window.showToast === "function") {
        window.showToast(message, type);
        return;
    }

    alert(message);
}


function setButtonLoading(button, loading, text) {
    if (!button) return;

    if (loading) {
        button.dataset.originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            ${text}
        `;
    } else {
        button.disabled = false;

        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}


function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   AUTHENTICATION
========================================================= */

async function initializeUser() {
    const result = await getCurrentUser();

    if (!result.success || !result.data) {
        showMessage(
            "You must be signed in as a landlord to create a listing.",
            "error"
        );

        window.location.href = "../auth/landlord_login.htm";
        return false;
    }

    currentUser = result.data;

    const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, role, full_name")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error) {
        console.error("[ResiHub] Profile lookup failed:", error);
        showMessage(
            "Unable to verify your landlord account.",
            "error"
        );
        return false;
    }

    if (!profile || profile.role !== "landlord") {
        showMessage(
            "Only verified landlord accounts can create listings.",
            "error"
        );
        return false;
    }

    return true;
}


/* =========================================================
   IMAGE VALIDATION
========================================================= */

function validateImage(file) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return {
            valid: false,
            message: `${file.name}: Only JPG, PNG and WebP images are allowed.`
        };
    }

    if (file.size > MAX_IMAGE_SIZE) {
        return {
            valid: false,
            message: `${file.name}: Image must be 5 MB or smaller.`
        };
    }

    return {
        valid: true
    };
}


/* =========================================================
   IMAGE PREVIEW
========================================================= */

function renderImagePreview() {
    if (!imagePreview) return;

    imagePreview.innerHTML = "";

    selectedImages.forEach((file, index) => {
        const wrapper = document.createElement("div");

        wrapper.className = "image-preview-item";

        const image = document.createElement("img");

        image.alt = `Property image ${index + 1}`;

        const removeButton = document.createElement("button");

        removeButton.type = "button";
        removeButton.className = "remove-image";
        removeButton.setAttribute(
            "aria-label",
            `Remove image ${index + 1}`
        );

        removeButton.innerHTML = `
            <i class="fa-solid fa-xmark"></i>
        `;

        const objectUrl = URL.createObjectURL(file);

        image.src = objectUrl;

        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
        };

        removeButton.addEventListener("click", () => {
            selectedImages.splice(index, 1);

            renderImagePreview();

            if (imageInput) {
                imageInput.value = "";
            }
        });

        wrapper.appendChild(image);
        wrapper.appendChild(removeButton);

        imagePreview.appendChild(wrapper);
    });
}


/* =========================================================
   IMAGE SELECTION
========================================================= */

function handleImageSelection(files) {
    const incomingFiles = Array.from(files);

    if (
        selectedImages.length + incomingFiles.length >
        MAX_IMAGES
    ) {
        showMessage(
            `You can upload a maximum of ${MAX_IMAGES} images.`,
            "error"
        );
        return;
    }

    for (const file of incomingFiles) {
        const validation = validateImage(file);

        if (!validation.valid) {
            showMessage(validation.message, "error");
            continue;
        }

        selectedImages.push(file);
    }

    renderImagePreview();
}


/* =========================================================
   DRAG AND DROP
========================================================= */

function initializeImageUpload() {
    if (!imageInput) return;

    imageInput.addEventListener("change", (event) => {
        handleImageSelection(event.target.files);
    });

    if (!uploadZone) return;

    ["dragenter", "dragover"].forEach((eventName) => {
        uploadZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            uploadZone.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        uploadZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            uploadZone.classList.remove("dragover");
        });
    });

    uploadZone.addEventListener("drop", (event) => {
        const files = event.dataTransfer?.files;

        if (files?.length) {
            handleImageSelection(files);
        }
    });
}


/* =========================================================
   FORM DATA
========================================================= */

function getFormData() {
    const amenities = {};

    document
        .querySelectorAll(
            'input[name="amenities"]:checked'
        )
        .forEach((checkbox) => {
            amenities[checkbox.value] = true;
        });

    return {
        title: document
            .getElementById("propertyTitle")
            ?.value.trim(),

        propertyType: document
            .getElementById("propertyType")
            ?.value.trim(),

        price: document
            .getElementById("propertyPrice")
            ?.value,

        availableRooms: document
            .getElementById("availableRooms")
            ?.value,

        university: document
            .getElementById("propertyUniversity")
            ?.value.trim(),

        area: document
            .getElementById("propertyArea")
            ?.value.trim(),

        address: document
            .getElementById("propertyAddress")
            ?.value.trim(),

        description: document
            .getElementById("propertyDescription")
            ?.value.trim(),

        amenities
    };
}


/* =========================================================
   UNIVERSITY LOOKUP
========================================================= */

async function findUniversity(universityName) {
    if (!universityName) {
        return null;
    }

    const { data, error } = await supabase
        .from("universities")
        .select("id, name")
        .ilike("name", universityName)
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error(
            "[ResiHub] University lookup failed:",
            error
        );

        throw error;
    }

    return data;
}


/* =========================================================
   CREATE LISTING
========================================================= */

async function createListing(
    formData,
    publicationStatus
) {
    if (!currentUser) {
        throw new Error("User session is unavailable.");
    }

    const university = await findUniversity(
        formData.university
    );

    const listingPayload = {
        landlord_id: currentUser.id,

        university_id: university?.id ?? null,

        title: formData.title,

        description:
            formData.description || null,

        price:
            formData.price
                ? Number(formData.price)
                : null,

        property_type: formData.propertyType,

        area: formData.area,

        address:
            formData.address || null,

        availability_status: "available",

        available_rooms:
            formData.availableRooms
                ? Number(formData.availableRooms)
                : null,

        amenities: formData.amenities,

        publication_status: publicationStatus
    };

    const {
        data,
        error
    } = await supabase
        .from("listings")
        .insert(listingPayload)
        .select("id")
        .single();

    if (error) {
        throw error;
    }

    return data;
}


/* =========================================================
   UPLOAD LISTING IMAGES
========================================================= */

async function uploadListingImages(listingId) {
    if (!selectedImages.length) {
        return [];
    }

    const imageRecords = [];

    for (
        let index = 0;
        index < selectedImages.length;
        index++
    ) {
        const file = selectedImages[index];

        const extension =
            file.name
                .split(".")
                .pop()
                ?.toLowerCase() || "jpg";

        const filePath =
            `${currentUser.id}/${listingId}/${crypto.randomUUID()}.${extension}`;

        const {
            error: uploadError
        } = await supabase
            .storage
            .from("property-media")
            .upload(
                filePath,
                file,
                {
                    cacheControl: "3600",
                    upsert: false,
                    contentType: file.type
                }
            );

        if (uploadError) {
            throw uploadError;
        }

        uploadedStoragePaths.push(filePath);

        const {
            data: publicUrlData
        } = supabase
            .storage
            .from("property-media")
            .getPublicUrl(filePath);

        imageRecords.push({
            listing_id: listingId,
            image_url: publicUrlData.publicUrl,
            display_order: index + 1
        });
    }

    const {
        data,
        error
    } = await supabase
        .from("listing_images")
        .insert(imageRecords)
        .select();

    if (error) {
        throw error;
    }

    return data;
}


/* =========================================================
   CLEANUP FAILED UPLOADS
========================================================= */

async function cleanupUploadedImages() {
    if (!uploadedStoragePaths.length) {
        return;
    }

    try {
        await supabase
            .storage
            .from("property-media")
            .remove(uploadedStoragePaths);
    } catch (error) {
        console.error(
            "[ResiHub] Storage cleanup failed:",
            error
        );
    }

    uploadedStoragePaths = [];
}


/* =========================================================
   RESET STATE
========================================================= */

function resetListingState() {
    selectedImages = [];
    uploadedStoragePaths = [];

    if (imageInput) {
        imageInput.value = "";
    }

    renderImagePreview();
}


/* =========================================================
   PUBLISH LISTING
========================================================= */

async function publishListing(event) {
    event.preventDefault();

    if (!form) return;

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const formData = getFormData();

    if (!formData.title) {
        showMessage(
            "Please enter a property title.",
            "error"
        );
        return;
    }

    try {
        setButtonLoading(
            publishButton,
            true,
            "Publishing..."
        );

        const listing = await createListing(
            formData,
            "published"
        );

        await uploadListingImages(listing.id);

        showMessage(
            "Your listing has been published successfully!",
            "success"
        );

        resetListingState();

        form.reset();

        setTimeout(() => {
            window.location.href =
                "../landlord/landlord_dashboard.htm";
        }, 1000);

    } catch (error) {
        console.error(
            "[ResiHub] Listing publication failed:",
            error
        );

        await cleanupUploadedImages();

        showMessage(
            error.message ||
            "Unable to publish your listing.",
            "error"
        );

    } finally {
        setButtonLoading(
            publishButton,
            false
        );
    }
}


/* =========================================================
   SAVE DRAFT
========================================================= */

async function saveDraft() {
    const formData = getFormData();

    if (!formData.title) {
        showMessage(
            "A property title is required to save a draft.",
            "error"
        );
        return;
    }

    if (!formData.propertyType) {
        showMessage(
            "Please select a property type.",
            "error"
        );
        return;
    }

    if (!formData.area) {
        showMessage(
            "Please enter the property area.",
            "error"
        );
        return;
    }

    try {
        setButtonLoading(
            draftButton,
            true,
            "Saving..."
        );

        const listing = await createListing(
            formData,
            "draft"
        );

        await uploadListingImages(listing.id);

        showMessage(
            "Your listing draft has been saved.",
            "success"
        );

        resetListingState();

    } catch (error) {
        console.error(
            "[ResiHub] Draft save failed:",
            error
        );

        await cleanupUploadedImages();

        showMessage(
            error.message ||
            "Unable to save your draft.",
            "error"
        );

    } finally {
        setButtonLoading(
            draftButton,
            false
        );
    }
}


/* =========================================================
   INITIALIZATION
========================================================= */

async function initializeCreateListing() {
    if (!form) {
        console.warn(
            "[ResiHub] Create listing form not found."
        );
        return;
    }

    const authenticated = await initializeUser();

    if (!authenticated) {
        return;
    }

    initializeImageUpload();

    form.addEventListener(
        "submit",
        publishListing
    );

    draftButton?.addEventListener(
        "click",
        saveDraft
    );

    console.log(
        "[ResiHub] Create Listing initialized successfully."
    );
}


/* =========================================================
   START
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeCreateListing,
        { once: true }
    );
} else {
    initializeCreateListing();
}
