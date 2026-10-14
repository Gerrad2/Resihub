// js/listing_details.js

import {
    getListing,
    getListings,
    getReviews,
    getCurrentUser,
    createBookingRequest,
    sendMessage
} from "./core/api.js";

import { showToast } from "./ui/toast.js";
import { openModal, closeModal } from "./ui/modal.js";


/* =========================================================
   DOM HELPERS
========================================================= */

function $(id) {
    return document.getElementById(id);
}


/* =========================================================
   STATE
========================================================= */

let currentListing = null;
let currentUser = null;


/* =========================================================
   URL
========================================================= */

function getListingId() {
    const params = new URLSearchParams(
        window.location.search
    );

    return params.get("id");
}


/* =========================================================
   FORMATTING
========================================================= */

function formatPrice(value) {
    const price = Number(value);

    if (!Number.isFinite(price)) {
        return "Price unavailable";
    }

    return `₦${price.toLocaleString("en-NG")}`;
}


function formatDate(value) {
    if (!value) {
        return "Unknown";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Unknown";
    }

    return date.toLocaleDateString("en-NG", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}


function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function imageUrl(image) {
    return image?.image_url ||
        "../assets/images/placeholder-room.jpg";
}


/* =========================================================
   LOADING / ERROR
========================================================= */

function showLoading() {

    const title = $("propertyTitle");

    if (title) {
        title.textContent = "Loading property...";
    }

    const gallery = $("propertyGallery");

    if (gallery) {
        gallery.innerHTML = `
            <div class="loading-state">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>Loading property images...</p>
            </div>
        `;
    }
}


function showError(message) {

    const title = $("propertyTitle");

    if (title) {
        title.textContent = "Property unavailable";
    }

    const description = $("propertyDescription");

    if (description) {
        description.textContent = message;
    }

    const gallery = $("propertyGallery");

    if (gallery) {
        gallery.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-house-circle-exclamation"></i>
                <h3>Property unavailable</h3>
                <p>${escapeHtml(message)}</p>
                <a
                    href="../general/browse_rooms.htm"
                    class="btn-primary"
                >
                    Browse Rooms
                </a>
            </div>
        `;
    }
}


/* =========================================================
   PROPERTY HEADER
========================================================= */

function renderProperty() {

    const listing = currentListing;

    if (!listing) {
        return;
    }

    const university =
        listing.universities?.name ||
        "University not specified";

    const location = [
        listing.area,
        listing.address
    ]
        .filter(Boolean)
        .join(", ");

    $("propertyTitle").textContent =
        listing.title || "Student Accommodation";

    $("propertyLocation").textContent =
        location || university;

    $("propertyPrice").textContent =
        formatPrice(listing.price);

    $("propertyDescription").textContent =
        listing.description ||
        "No description has been provided for this property.";

    $("propertyType").textContent =
        listing.property_type ||
        "Not specified";

    $("bedroomCount").textContent =
        listing.bedrooms ??
        listing.available_rooms ??
        "N/A";

    $("bathroomCount").textContent =
        listing.bathrooms ??
        "N/A";

    $("propertySize").textContent =
        listing.property_size
            ? `${listing.property_size} m²`
            : "N/A";

    updateBadges();
}


/* =========================================================
   BADGES
========================================================= */

function updateBadges() {

    const container =
        $("propertyBadges");

    if (!container || !currentListing) {
        return;
    }

    const badges = [];

    if (
        currentListing.availability_status ===
        "available"
    ) {
        badges.push("Available");
    }

    if (
        currentListing.publication_status ===
        "published"
    ) {
        badges.push("Published");
    }

    if (currentListing.property_type) {
        badges.push(
            currentListing.property_type
        );
    }

    container.innerHTML =
        badges.map(
            badge => `
                <span class="property-badge">
                    ${escapeHtml(badge)}
                </span>
            `
        ).join("");
}


/* =========================================================
   GALLERY
========================================================= */

function renderGallery() {

    const gallery =
        $("propertyGallery");

    if (!gallery || !currentListing) {
        return;
    }

    const images =
        Array.isArray(currentListing.listing_images)
            ? [...currentListing.listing_images]
                .sort(
                    (a, b) =>
                        (a.display_order ?? 0) -
                        (b.display_order ?? 0)
                )
            : [];

    if (!images.length) {

        gallery.innerHTML = `
            <div class="gallery-empty">
                <img
                    src="../assets/images/placeholder-room.jpg"
                    alt="No property image available"
                >
            </div>
        `;

        return;
    }

    gallery.innerHTML = images
        .map(
            (image, index) => `
                <button
                    type="button"
                    class="gallery-image"
                    data-image-index="${index}"
                    aria-label="View property image ${index + 1}"
                >
                    <img
                        src="${escapeHtml(imageUrl(image))}"
                        alt="${escapeHtml(
                currentListing.title || "Property"
            )} image ${index + 1}"
                        loading="${index === 0 ? "eager" : "lazy"}"
                    >
                </button>
            `
        )
        .join("");

    gallery
        .querySelectorAll("[data-image-index]")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const index =
                        Number(
                            button.dataset.imageIndex
                        );

                    openImageViewer(
                        images,
                        index
                    );
                }
            );
        });
}


/* =========================================================
   IMAGE VIEWER
========================================================= */

function openImageViewer(images, startIndex = 0) {

    let index = startIndex;

    const modal =
        document.createElement("div");

    modal.className =
        "resihub-image-viewer";

    modal.innerHTML = `
        <div class="image-viewer-backdrop"></div>

        <div
            class="image-viewer-content"
            role="dialog"
            aria-modal="true"
            aria-label="Property image viewer"
        >

            <button
                type="button"
                class="image-viewer-close"
                aria-label="Close image viewer"
            >
                <i class="fa-solid fa-xmark"></i>
            </button>

            <button
                type="button"
                class="image-viewer-prev"
                aria-label="Previous image"
            >
                <i class="fa-solid fa-chevron-left"></i>
            </button>

            <img
                class="image-viewer-image"
                alt="Property image"
            >

            <button
                type="button"
                class="image-viewer-next"
                aria-label="Next image"
            >
                <i class="fa-solid fa-chevron-right"></i>
            </button>

            <div class="image-viewer-counter"></div>

        </div>
    `;

    document.body.appendChild(modal);

    const image =
        modal.querySelector(
            ".image-viewer-image"
        );

    const counter =
        modal.querySelector(
            ".image-viewer-counter"
        );

    function render() {

        const item =
            images[index];

        image.src =
            imageUrl(item);

        image.alt =
            `${currentListing?.title || "Property"} image ${index + 1}`;

        counter.textContent =
            `${index + 1} / ${images.length}`;
    }

    function close() {
        modal.remove();
        document.body.style.overflow = "";
    }

    modal
        .querySelector(".image-viewer-close")
        .addEventListener("click", close);

    modal
        .querySelector(".image-viewer-backdrop")
        .addEventListener("click", close);

    modal
        .querySelector(".image-viewer-prev")
        .addEventListener(
            "click",
            () => {

                index =
                    (index - 1 + images.length) %
                    images.length;

                render();
            }
        );

    modal
        .querySelector(".image-viewer-next")
        .addEventListener(
            "click",
            () => {

                index =
                    (index + 1) %
                    images.length;

                render();
            }
        );

    document.addEventListener(
        "keydown",
        function keyboardHandler(event) {

            if (!document.body.contains(modal)) {
                document.removeEventListener(
                    "keydown",
                    keyboardHandler
                );

                return;
            }

            if (event.key === "Escape") {
                close();
            }

            if (event.key === "ArrowLeft") {
                index =
                    (index - 1 + images.length) %
                    images.length;

                render();
            }

            if (event.key === "ArrowRight") {
                index =
                    (index + 1) %
                    images.length;

                render();
            }
        }
    );

    document.body.style.overflow = "hidden";

    render();
}


/* =========================================================
   AMENITIES
========================================================= */

function renderAmenities() {

    const container =
        $("amenitiesGrid");

    if (!container || !currentListing) {
        return;
    }

    const amenities =
        currentListing.amenities;

    if (!amenities) {
        container.innerHTML =
            "<p>No amenities listed.</p>";

        return;
    }

    let items = [];

    if (Array.isArray(amenities)) {
        items = amenities;
    } else if (
        typeof amenities === "object"
    ) {

        items =
            Object.entries(amenities)
                .filter(([, value]) =>
                    value === true ||
                    value === "true"
                )
                .map(([key]) => key);
    }

    if (!items.length) {

        container.innerHTML =
            "<p>No amenities listed.</p>";

        return;
    }

    const icons = {
        wifi: "fa-wifi",
        water: "fa-droplet",
        electricity: "fa-bolt",
        security: "fa-shield-halved",
        parking: "fa-square-parking",
        kitchen: "fa-kitchen-set",
        bathroom: "fa-bath",
        furnished: "fa-couch"
    };

    container.innerHTML =
        items.map(item => {

            const key =
                String(item)
                    .toLowerCase()
                    .replace(/\s+/g, "_");

            const icon =
                icons[key] ||
                "fa-circle-check";

            return `
                <div class="amenity-item">
                    <i class="fa-solid ${icon}"></i>
                    <span>
                        ${escapeHtml(
                String(item)
                    .replaceAll("_", " ")
            )}
                    </span>
                </div>
            `;

        }).join("");
}


/* =========================================================
   FEATURES
========================================================= */

function renderFeatures() {

    const container =
        $("featuresGrid");

    if (!container || !currentListing) {
        return;
    }

    const features = [];

    if (currentListing.available_rooms != null) {
        features.push(
            `${currentListing.available_rooms} rooms available`
        );
    }

    if (currentListing.availability_status) {
        features.push(
            `Status: ${currentListing.availability_status}`
        );
    }

    if (currentListing.publication_status) {
        features.push(
            `Listing: ${currentListing.publication_status}`
        );
    }

    if (!features.length) {

        container.innerHTML =
            "<p>No additional features listed.</p>";

        return;
    }

    container.innerHTML =
        features.map(
            feature => `
                <div class="feature-item">
                    <i class="fa-solid fa-circle-check"></i>
                    <span>
                        ${escapeHtml(feature)}
                    </span>
                </div>
            `
        ).join("");
}


/* =========================================================
   MAP
========================================================= */

function renderMap() {

    const map =
        $("propertyMap");

    if (!map || !currentListing) {
        return;
    }

    const address = [
        currentListing.address,
        currentListing.area,
        currentListing.universities?.name
    ]
        .filter(Boolean)
        .join(", ");

    if (!address) {

        map.innerHTML = `
            <p>
                Location information is not available.
            </p>
        `;

        return;
    }

    const query =
        encodeURIComponent(address);

    map.innerHTML = `
        <div class="map-placeholder">
            <i class="fa-solid fa-location-dot"></i>

            <p>
                ${escapeHtml(address)}
            </p>

            <a
                href="https://www.google.com/maps/search/?api=1&query=${query}"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-primary"
            >
                Open in Maps
            </a>
        </div>
    `;
}


/* =========================================================
   LANDLORD
========================================================= */

function renderLandlord() {

    if (!currentListing) {
        return;
    }

    const profile =
        currentListing.profile ||
        currentListing.profiles ||
        null;

    $("landlordName").textContent =
        profile?.full_name ||
        "Verified Landlord";

    $("landlordJoined").textContent =
        profile?.created_at
            ? `Joined ${formatDate(profile.created_at)}`
            : "ResiHub Landlord";

    const photo =
        $("landlordPhoto");

    if (photo) {

        photo.src =
            profile?.avatar_url ||
            "../assets/images/default-avatar.png";

        photo.alt =
            profile?.full_name
                ? `${profile.full_name} profile picture`
                : "Landlord profile picture";
    }
}


/* =========================================================
   REVIEWS
========================================================= */

function renderReviews(reviews) {

    const container =
        $("reviewList");

    if (!container) {
        return;
    }

    if (!reviews?.length) {

        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-comment"></i>
                <h3>No reviews yet</h3>
                <p>
                    This property has not received any student reviews yet.
                </p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        reviews.map(review => {

            const stars =
                "★".repeat(
                    Math.max(
                        0,
                        Math.min(
                            5,
                            Number(review.rating) || 0
                        )
                    )
                );

            const reviewer =
                review.profiles?.full_name ||
                "Student";

            return `
                <article class="review-card">

                    <div class="review-header">

                        <strong>
                            ${escapeHtml(reviewer)}
                        </strong>

                        <span
                            class="review-rating"
                            aria-label="${Number(review.rating) || 0} out of 5 stars"
                        >
                            ${stars}
                        </span>

                    </div>

                    <p>
                        ${escapeHtml(
                review.comment ||
                "No comment provided."
            )}
                    </p>

                    <time datetime="${escapeHtml(
                review.created_at || ""
            )}">
                        ${formatDate(
                review.created_at
            )}
                    </time>

                </article>
            `;

        }).join("");
}


/* =========================================================
   SIMILAR LISTINGS
========================================================= */

async function loadSimilarListings() {

    const container =
        $("similarListings");

    if (!container || !currentListing) {
        return;
    }

    const result =
        await getListings({
            page: 1,
            pageSize: 4,
            area: currentListing.area,
            propertyType:
                currentListing.property_type,
            availabilityStatus: "available",
            publicationStatus: "published"
        });

    if (!result.success) {
        container.innerHTML = "";
        return;
    }

    const listings =
        (result.data?.listings || [])
            .filter(
                listing =>
                    String(listing.id) !==
                    String(currentListing.id)
            )
            .slice(0, 3);

    if (!listings.length) {

        container.innerHTML = `
            <p>
                No similar properties found.
            </p>
        `;

        return;
    }

    container.innerHTML =
        listings.map(listing => {

            const image =
                listing.listing_images?.[0]
                    ?.image_url ||
                "../assets/images/placeholder-room.jpg";

            return `
                <article class="listing-card">

                    <img
                        src="${escapeHtml(image)}"
                        alt="${escapeHtml(
                listing.title ||
                "Student accommodation"
            )}"
                        loading="lazy"
                    >

                    <div class="listing-card-content">

                        <h3>
                            ${escapeHtml(
                listing.title ||
                "Accommodation"
            )}
                        </h3>

                        <p>
                            ${escapeHtml(
                [
                    listing.area,
                    listing.universities?.name
                ]
                    .filter(Boolean)
                    .join(", ")
            )}
                        </p>

                        <strong>
                            ${formatPrice(
                listing.price
            )}
                        </strong>

                        <a
                            href="listing_details.htm?id=${encodeURIComponent(
                listing.id
            )}"
                            class="btn-primary"
                        >
                            View Details
                        </a>

                    </div>

                </article>
            `;

        }).join("");
}


/* =========================================================
   CHAT
========================================================= */

async function handleChat() {

    if (!currentListing) {
        return;
    }

    if (!currentUser) {

        showToast(
            "Please sign in to contact the landlord.",
            { type: "warning" }
        );

        window.location.href =
            "../auth/student_login.htm";

        return;
    }

    if (
        currentUser.id ===
        currentListing.landlord_id
    ) {

        showToast(
            "You cannot message yourself.",
            { type: "warning" }
        );

        return;
    }

    /*
     * The actual messaging page handles the
     * conversation UI. Pass the listing and
     * landlord through the URL.
     */

    const params =
        new URLSearchParams({
            user: currentListing.landlord_id,
            listing: currentListing.id
        });

    window.location.href =
        `../landlord/landlord_messages.htm?${params}`;
}


/* =========================================================
   INSPECTION
========================================================= */

function buildInspectionModal() {

    const modal =
        document.createElement("div");

    modal.className =
        "resihub-modal";

    modal.innerHTML = `
        <div class="modal-backdrop"></div>

        <div
            class="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inspectionModalTitle"
        >

            <button
                type="button"
                class="modal-close"
                aria-label="Close"
            >
                <i class="fa-solid fa-xmark"></i>
            </button>

            <h2 id="inspectionModalTitle">
                Book Inspection
            </h2>

            <form id="inspectionForm">

                <label for="inspectionDate">
                    Preferred Date
                </label>

                <input
                    type="datetime-local"
                    id="inspectionDate"
                    required
                >

                <label for="inspectionMessage">
                    Message
                </label>

                <textarea
                    id="inspectionMessage"
                    rows="4"
                    placeholder="Add a message for the landlord..."
                ></textarea>

                <button
                    type="submit"
                    class="btn-primary"
                >
                    Request Inspection
                </button>

            </form>

        </div>
    `;

    document.body.appendChild(modal);

    const close =
        () => modal.remove();

    modal
        .querySelector(".modal-close")
        .addEventListener("click", close);

    modal
        .querySelector(".modal-backdrop")
        .addEventListener("click", close);

    modal
        .querySelector("#inspectionForm")
        .addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                const date =
                    modal.querySelector(
                        "#inspectionDate"
                    ).value;

                const message =
                    modal.querySelector(
                        "#inspectionMessage"
                    ).value.trim();

                const chosenDate =
                    new Date(date);

                if (
                    !date ||
                    Number.isNaN(
                        chosenDate.getTime()
                    ) ||
                    chosenDate <= new Date()
                ) {

                    showToast(
                        "Please choose a future inspection date.",
                        { type: "warning" }
                    );

                    return;
                }

                const result =
                    await createBookingRequest({
                        listingId:
                            currentListing.id,

                        landlordId:
                            currentListing.landlord_id,

                        inspectionDate:
                            chosenDate.toISOString(),

                        message
                    });

                if (!result.success) {

                    showToast(
                        result.error?.message ||
                        "Unable to send inspection request.",
                        { type: "error" }
                    );

                    return;
                }

                close();

                showToast(
                    "Inspection request sent successfully.",
                    { type: "success" }
                );
            }
        );

    const input =
        modal.querySelector("#inspectionDate");

    const now =
        new Date();

    now.setMinutes(
        now.getMinutes() -
        now.getTimezoneOffset()
    );

    input.min =
        now.toISOString().slice(0, 16);
}


/* =========================================================
   ACTIONS
========================================================= */

function wireActions() {

    $("chatLandlordBtn")
        ?.addEventListener(
            "click",
            handleChat
        );

    $("inspectionBtn")
        ?.addEventListener(
            "click",
            async () => {

                if (!currentUser) {

                    showToast(
                        "Please sign in to book an inspection.",
                        { type: "warning" }
                    );

                    window.location.href =
                        "../auth/student_login.htm";

                    return;
                }

                buildInspectionModal();
            }
        );
}


/* =========================================================
   INITIALIZATION
========================================================= */

export async function init() {

    showLoading();

    const listingId =
        getListingId();

    if (!listingId) {

        showError(
            "No property was selected."
        );

        return;
    }

    const [
        listingResult,
        userResult
    ] = await Promise.all([
        getListing(listingId),
        getCurrentUser()
    ]);

    if (
        !listingResult.success ||
        !listingResult.data
    ) {

        showError(
            listingResult.error?.message ||
            "We could not load this property."
        );

        return;
    }

    currentListing =
        listingResult.data;

    currentUser =
        userResult.success
            ? userResult.data
            : null;

    renderProperty();
    renderGallery();
    renderAmenities();
    renderFeatures();
    renderMap();
    renderLandlord();
    wireActions();

    const reviewsResult =
        await getReviews(currentListing.id);

    renderReviews(
        reviewsResult.success
            ? reviewsResult.data
            : []
    );

    await loadSimilarListings();
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
        init,
        { once: true }
    );

} else {

    init();
}
