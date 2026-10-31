import { getCurrentUser, getUniversities, supabase } from "./api.js";
import { showError } from "./student_utils.js";
import { showToast } from "./ui/toast.js";

const $ = (id) => document.getElementById(id);

const BUCKET = "property-media";
const MAX_PHOTOS = 10;
const MIN_PHOTOS_TO_PUBLISH = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const AMENITIES = {
    wifi: "wifiAmenity",
    water: "waterAmenity",
    electricity: "electricityAmenity",
    security: "securityAmenity",
    parking: "parkingAmenity",
    furnished: "furnishedAmenity",
    kitchen: "kitchenAmenity",
    bathroom: "bathroomAmenity",
};

let me = null;
let listingId = null;
let listing = null;
let photos = [];

/* ---------- Entry point ---------- */

export async function init() {
    listingId = new URLSearchParams(location.search).get("id");

    bindEvents();

    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;

    if (!me) {
        showError("Please sign in to edit your listing.");
        return;
    }

    if (!listingId) {
        setMessage("No listing was selected. Go back to My Listings and choose one.", "error");
        setFormDisabled(true);
        return;
    }

    await loadUniversities();
    await loadListing();
}

function bindEvents() {
    $("editListingForm")?.addEventListener("submit", saveChanges);
    $("publishListingBtn")?.addEventListener("click", publishListing);
    $("deleteListingBtn")?.addEventListener("click", deleteListing);
    $("propertyImages")?.addEventListener("change", (event) => uploadPhotos(event.target.files));
}

/* ---------- Loading ---------- */

async function loadUniversities() {
    const result = await getUniversities();
    if (!result.success) return;

    const select = $("propertyUniversity");
    result.data.forEach((university) => {
        select.append(new Option(university.name, university.id));
    });
}

async function loadListing() {
    const { data, error } = await supabase
        .from("listings")
        .select("*, listing_images(id, image_url, display_order)")
        .eq("id", listingId)
        .eq("landlord_id", me.id)
        .maybeSingle();

    if (error || !data) {
        setMessage("This listing could not be found.", "error");
        setFormDisabled(true);
        return;
    }

    listing = data;
    photos = sortPhotos(data.listing_images ?? []);

    fillForm(data);
    renderPhotos();
    updatePublishButton();
}

function fillForm(data) {
    setValue("listingId", data.id);
    setValue("propertyTitle", data.title);
    setSelect("propertyType", data.property_type);
    setSelect("propertyUniversity", data.university_id ?? "");
    setValue("propertyArea", data.area);
    setValue("propertyAddress", data.address);
    setValue("propertyPrice", data.price);
    setValue("availableRooms", data.available_rooms);
    setSelect("listingAvailability", data.availability_status);
    setValue("propertyDescription", data.description);

    const amenities = data.amenities ?? {};
    Object.entries(AMENITIES).forEach(([key, id]) => {
        setChecked(id, Boolean(amenities[key]));
    });
}

/* ---------- Saving ---------- */

function readForm() {
    const title = $("propertyTitle").value.trim();
    const propertyType = $("propertyType").value;
    const area = $("propertyArea").value.trim();
    const price = Number($("propertyPrice").value);
    const rooms = $("availableRooms").value;

    if (title.length < 3) {
        return { error: "Enter a property title of at least 3 characters." };
    }
    if (!propertyType) {
        return { error: "Choose a property type." };
    }
    if (!area) {
        return { error: "Enter the area the property is in." };
    }
    if ($("propertyPrice").value === "" || !Number.isFinite(price) || price < 0) {
        return { error: "Enter a valid monthly price." };
    }

    const amenities = {};
    Object.entries(AMENITIES).forEach(([key, id]) => {
        amenities[key] = $(id).checked;
    });

    return {
        payload: {
            title,
            property_type: propertyType,
            university_id: $("propertyUniversity").value || null,
            area,
            address: $("propertyAddress").value.trim() || null,
            price,
            available_rooms: rooms === "" ? null : Number(rooms),
            availability_status: $("listingAvailability").value,
            description: $("propertyDescription").value.trim() || null,
            amenities,
        },
    };
}

async function saveChanges(event) {
    event.preventDefault();

    const { error: validationError, payload } = readForm();
    if (validationError) {
        setMessage(validationError, "error");
        return;
    }

    setBusy(true);
    setMessage("Saving...", "info");

    const { error } = await supabase
        .from("listings")
        .update(payload)
        .eq("id", listingId)
        .eq("landlord_id", me.id);

    setBusy(false);

    if (error) {
        setMessage("Changes could not be saved. Please try again.", "error");
        return;
    }

    listing = { ...listing, ...payload };
    showToast("Listing saved.", { type: "success" });

    setTimeout(() => {
        window.location.href = "my_listing.htm";
    }, 1200);
}

async function publishListing() {
    if (photos.length < MIN_PHOTOS_TO_PUBLISH) {
        setMessage(
            `Add at least ${MIN_PHOTOS_TO_PUBLISH} photos before publishing. You have ${photos.length}.`,
            "error"
        );
        return;
    }

    const { error: validationError, payload } = readForm();
    if (validationError) {
        setMessage(validationError, "error");
        return;
    }

    setBusy(true);

    const { error } = await supabase
        .from("listings")
        .update({ ...payload, publication_status: "pending_review" })
        .eq("id", listingId)
        .eq("landlord_id", me.id);

    setBusy(false);

    if (error) {
        console.error("[edit_listing] publish failed:", error);
        setMessage(error.message, "error");
        return;
    }

    listing = { ...listing, ...payload, publication_status: "pending_review" };
    updatePublishButton();
    setMessage("Your listing has been sent for admin review.", "success");
    showToast("Listing published.", { type: "success" });
}

async function deleteListing() {
    const confirmed = confirm("Delete this listing? This cannot be undone.");
    if (!confirmed) return;

    setBusy(true);
    setMessage("Deleting...", "info");

    const { error } = await supabase
        .from("listings")
        .delete()
        .eq("id", listingId)
        .eq("landlord_id", me.id);

    setBusy(false);

    if (error) {
        console.error("[edit_listing] delete failed:", error);
        setMessage(`The listing could not be deleted: ${error.message}`, "error");
        showToast("Delete failed. See the message on the page.", { type: "error" });
        return;
    }

    showToast("Listing deleted.", { type: "success" });
    window.location.href = "my_listing.htm";
}

/* ---------- Photos ---------- */

async function uploadPhotos(fileList) {
    const files = [...fileList];
    if (!files.length) return;

    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
        setMessage(`You can have up to ${MAX_PHOTOS} photos. Remove one to add another.`, "error");
        $("propertyImages").value = "";
        return;
    }

    const chosen = files.slice(0, room);
    const invalid = chosen.find((file) => !PHOTO_TYPES.includes(file.type) || file.size > MAX_BYTES);

    if (invalid) {
        setMessage("Photos must be JPG, PNG or WebP, and under 10 MB each.", "error");
        $("propertyImages").value = "";
        return;
    }

    setBusy(true);
    setMessage("Uploading photos...", "info");

    let order = photos.length;

    for (const file of chosen) {
        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${me.id}/${listingId}/${Date.now()}-${order}.${extension}`;

        const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });

        if (uploadError) {
            console.error("[edit_listing] upload failed:", uploadError);
            setMessage("A photo could not be uploaded. Please try again.", "error");
            break;
        }

        const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);

        const { data: row, error: rowError } = await supabase
            .from("listing_images")
            .insert({ listing_id: listingId, image_url: publicData.publicUrl, display_order: order })
            .select("id, image_url, display_order")
            .single();

        if (rowError) {
            console.error("[edit_listing] photo record failed:", rowError);
            setMessage("The photo was uploaded but could not be saved to the listing.", "error");
            break;
        }

        photos.push(row);
        order += 1;
    }

    setBusy(false);
    $("propertyImages").value = "";

    photos = sortPhotos(photos);
    renderPhotos();
    updatePublishButton();

    if (files.length > room) {
        setMessage(`Only ${room} photo(s) were added, because the limit is ${MAX_PHOTOS}.`, "info");
    } else if (!$("editListingMessage").classList.contains("error")) {
        setMessage("Photos added.", "success");
    }
}

async function removePhoto(photo) {
    const confirmed = confirm("Remove this photo?");
    if (!confirmed) return;

    const { error } = await supabase.from("listing_images").delete().eq("id", photo.id);

    if (error) {
        setMessage("The photo could not be removed. Please try again.", "error");
        return;
    }

    photos = photos.filter((p) => p.id !== photo.id);

    // Also remove the file from storage. A failure here leaves an unused file, which is harmless.
    const marker = `/${BUCKET}/`;
    const index = photo.image_url.indexOf(marker);
    if (index >= 0) {
        const path = decodeURIComponent(photo.image_url.slice(index + marker.length));
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([path]);
        if (storageError) console.warn("[edit_listing] storage cleanup skipped:", storageError);
    }

    renderPhotos();
    updatePublishButton();
    setMessage("Photo removed.", "success");
}

function renderPhotos() {
    const box = $("imagePreview");
    if (!box) return;

    box.replaceChildren(...photos.map((photo, index) => {
        const card = element("div", "el-photo");

        const image = element("img");
        image.src = photo.image_url;
        image.alt = index === 0 ? "Cover photo" : "Property photo";

        const remove = element("button", "el-photo-remove");
        remove.type = "button";
        remove.setAttribute("aria-label", "Remove photo");
        remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        remove.addEventListener("click", () => removePhoto(photo));

        card.append(image, remove);

        if (index === 0) {
            card.append(element("span", "el-cover", "Cover"));
        }

        return card;
    }));
}

function sortPhotos(list) {
    return [...list].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

/* ---------- Helpers ---------- */

function updatePublishButton() {
    const button = $("publishListingBtn");
    if (!button) return;

    const published = listing?.publication_status === "published";
    button.disabled = published;
    button.innerHTML = published
        ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Published'
        : '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Publish';
}

function setBusy(on) {
    ["updateListingBtn", "publishListingBtn", "deleteListingBtn"].forEach((id) => {
        const button = $(id);
        if (button) button.disabled = on;
    });
}

function setFormDisabled(on) {
    const form = $("editListingForm");
    if (!form) return;
    form.querySelectorAll("input, select, textarea, button").forEach((node) => {
        node.disabled = on;
    });
}

function setMessage(text, type = "info") {
    const box = $("editListingMessage");
    if (!box) return;
    box.textContent = text;
    box.className = `el-message ${type}`;
}

function setValue(id, value) {
    const node = $(id);
    if (node) node.value = value ?? "";
}

function setSelect(id, value) {
    const node = $(id);
    if (!node) return;

    if (value && ![...node.options].some((option) => option.value === value)) {
        node.append(new Option(value, value));
    }

    node.value = value ?? "";
}

function setChecked(id, value) {
    const node = $(id);
    if (node) node.checked = Boolean(value);
}

function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}