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
let photos = []; // { file, previewUrl }

/* ---------- Entry point ---------- */

export async function init() {
    bindEvents();

    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;

    if (!me) {
        showError("Please sign in to add a listing.");
        setFormDisabled(true);
        return;
    }

    await loadUniversities();
    renderPhotos();
}

function bindEvents() {
    $("createListingForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        submitListing("draft");
    });

    $("saveDraftBtn")?.addEventListener("click", () => submitListing("draft"));
    $("publishListingBtn")?.addEventListener("click", () => submitListing("published"));
    $("propertyImages")?.addEventListener("change", (event) => addPhotos(event.target.files));
}

async function loadUniversities() {
    const result = await getUniversities();
    if (!result.success) return;

    const select = $("propertyUniversity");
    result.data.forEach((university) => {
        select.append(new Option(university.name, university.id));
    });
}

/* ---------- Form ---------- */

function readForm() {
    const title = $("propertyTitle").value.trim();
    const propertyType = $("propertyType").value;
    const area = $("propertyArea").value.trim();
    const priceText = $("propertyPrice").value;
    const price = Number(priceText);
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
    if (priceText === "" || !Number.isFinite(price) || price < 0) {
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
            description: $("propertyDescription").value.trim() || null,
            amenities,
        },
    };
}

/* ---------- Saving ---------- */

async function submitListing(status) {
    const { error: validationError, payload } = readForm();
    if (validationError) {
        setMessage(validationError, "error");
        return;
    }

    if (status === "published" && photos.length < MIN_PHOTOS_TO_PUBLISH) {
        setMessage(
            `Add at least ${MIN_PHOTOS_TO_PUBLISH} photos before publishing. You have ${photos.length}.`,
            "error"
        );
        return;
    }

    setBusy(true);
    setMessage(status === "published" ? "Publishing..." : "Saving draft...", "info");

    // 1. Create the listing as a draft first, so the photos have somewhere to go
    const { data: created, error: createError } = await supabase
        .from("listings")
        .insert({ ...payload, landlord_id: me.id, publication_status: "draft" })
        .select("id")
        .single();

    if (createError || !created) {
        console.error("[create_listing] insert failed:", createError);
        setBusy(false);
        setMessage("The listing could not be saved. Please try again.", "error");
        return;
    }

    // 2. Upload the photos and link them to the listing
    const result = await uploadPhotos(created.id);

    if (result.failed) {
        setBusy(false);
        setMessage(
            `Saved as a draft, but ${result.failed} photo(s) could not be uploaded. Add them from the edit page.`,
            "error"
        );
        return;
    }

    // 3. Publish only if enough photos were saved
    if (status === "published") {
        if (result.count < MIN_PHOTOS_TO_PUBLISH) {
            setBusy(false);
            setMessage(
                `Saved as a draft. Publishing needs at least ${MIN_PHOTOS_TO_PUBLISH} photos.`,
                "error"
            );
            return;
        }

        const { error: publishError } = await supabase
            .from("listings")
            .update({ publication_status: "pending_review" })
            .eq("id", created.id)
            .eq("landlord_id", me.id);

        if (publishError) {
            console.error("[create_listing] publish failed:", publishError);
            setBusy(false);
            setMessage(`Saved as a draft. ${publishError.message}`, "error");
            return;
        }
    }

    setBusy(false);
    showToast(status === "published" ? "Listing published." : "Draft saved.", { type: "success" });
    setMessage(status === "published" ? "Your listing is now published." : "Draft saved.", "success");

    setTimeout(() => {
        window.location.href = "my_listing.htm";
    }, 1000);
}

async function uploadPhotos(listingId) {
    const rows = [];
    let failed = 0;

    for (let i = 0; i < photos.length; i++) {
        const file = photos[i].file;
        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${me.id}/${listingId}/${Date.now()}-${i}.${extension}`;

        const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });

        if (uploadError) {
            console.error("[create_listing] upload failed:", uploadError);
            failed += 1;
            continue;
        }

        const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);

        rows.push({
            listing_id: listingId,
            image_url: publicData.publicUrl,
            display_order: rows.length,
        });
    }

    if (rows.length) {
        const { error: rowError } = await supabase.from("listing_images").insert(rows);

        if (rowError) {
            console.error("[create_listing] photo records failed:", rowError);
            failed += rows.length;
            return { count: 0, failed };
        }
    }

    return { count: rows.length, failed };
}

/* ---------- Photos (held on the page until saved) ---------- */

function addPhotos(fileList) {
    const files = [...fileList];
    if (!files.length) return;

    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
        setMessage(`You can add up to ${MAX_PHOTOS} photos. Remove one to add another.`, "error");
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

    chosen.forEach((file) => {
        photos.push({ file, previewUrl: URL.createObjectURL(file) });
    });

    $("propertyImages").value = "";
    renderPhotos();

    if (files.length > room) {
        setMessage(`Only ${room} photo(s) were added. The limit is ${MAX_PHOTOS}.`, "info");
    } else {
        setMessage("", "info");
    }
}

function removePhoto(index) {
    const [removed] = photos.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    renderPhotos();
}

function renderPhotos() {
    const box = $("imagePreview");
    if (!box) return;

    box.replaceChildren(...photos.map((photo, index) => {
        const card = element("div", "el-photo");

        const image = element("img");
        image.src = photo.previewUrl;
        image.alt = index === 0 ? "Cover photo" : "Property photo";

        const remove = element("button", "el-photo-remove");
        remove.type = "button";
        remove.setAttribute("aria-label", "Remove photo");
        remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        remove.addEventListener("click", () => removePhoto(index));

        card.append(image, remove);

        if (index === 0) {
            card.append(element("span", "el-cover", "Cover"));
        }

        return card;
    }));
}

/* ---------- Helpers ---------- */

function setBusy(on) {
    ["saveDraftBtn", "publishListingBtn"].forEach((id) => {
        const button = $(id);
        if (button) button.disabled = on;
    });
}

function setFormDisabled(on) {
    const form = $("createListingForm");
    if (!form) return;
    form.querySelectorAll("input, select, textarea, button").forEach((node) => {
        node.disabled = on;
    });
}

function setMessage(text, type = "info") {
    const box = $("createListingMessage");
    if (!box) return;
    box.textContent = text;
    box.className = `el-message ${type}`;
}

function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}