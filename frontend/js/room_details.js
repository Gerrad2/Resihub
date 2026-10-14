
import {
    getListing,
    getListings,
    getReviews,
    createReview,
    createBookingRequest,
    addFavorite,
    removeFavorite,
    isFavorite,
    getCurrentUser,
    getProfile,
} from "./core/api.js";

import { showToast } from "./ui/toast.js";
import { openModal, closeModal } from "./ui/modal.js";
import { saveRecentlyViewed } from "./core/storage.js";
import { createListingCard, getListingImageUrl, formatPrice } from "./listings.js";


const DEFAULT_AVATAR = "../assets/images/default-user.png";
const PLACEHOLDER_IMAGE = "../assets/images/placeholder-room.jpg";

const AMENITY_META = {
    wifi: { icon: "fa-wifi", label: "Wi-Fi" },
    water: { icon: "fa-faucet-drip", label: "Running Water" },
    electricity: { icon: "fa-bolt", label: "Stable Electricity" },
    security: { icon: "fa-shield-halved", label: "Security" },
    parking: { icon: "fa-square-parking", label: "Parking" },
    furnished: { icon: "fa-couch", label: "Furnished" },
    kitchen: { icon: "fa-utensils", label: "Kitchen" },
    bathroom: { icon: "fa-bath", label: "Private Bathroom" },
};

/*
|--------------------------------------------------------------------------
| Module state
|--------------------------------------------------------------------------
*/

let currentListing = null;
let currentUser = null;
let favorited = false;
let selectedRating = 0;
let submittingBooking = false;
let submittingReview = false;

/*
|--------------------------------------------------------------------------
| DOM helpers
|--------------------------------------------------------------------------
*/

function el(id) {
    return document.getElementById(id);
}

function getListingId() {
    return new URLSearchParams(window.location.search).get("id");
}

function formatDate(value) {
    if (!value) {
        return "Not specified";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Not specified";
    }

    return date.toLocaleDateString("en-NG", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function formatPropertyType(propertyType) {
    if (!propertyType) {
        return "Not specified";
    }

    return propertyType
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

/*
|--------------------------------------------------------------------------
| Loading / error states
|--------------------------------------------------------------------------
|
| Never leaves the page blank on failure - always offers retry, and
| never lets a failed request break navigation, theming, or anything
| else already initialized by app.js.
*/

function showLoadingState() {
    el("propertyTitle").textContent = "Loading property...";
    el("propertyLocation").textContent = "Please wait";
    el("breadcrumbRoomName").textContent = "Loading...";

    const mainImage = el("mainPropertyImage");
    mainImage.classList.add("skeleton");
}

function showErrorState(message) {
    const main = document.querySelector(".property-details .container");

    if (!main) {
        showToast(message, { type: "error" });
        return;
    }

    main.replaceChildren();

    const wrapper = document.createElement("div");
    wrapper.className = "empty-state";

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-triangle-exclamation";

    const heading = document.createElement("h3");
    heading.textContent = "Couldn't load this listing";

    const description = document.createElement("p");
    description.textContent = message;

    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "btn-primary";
    retryButton.textContent = "Try Again";
    retryButton.addEventListener("click", () => init());

    const browseLink = document.createElement("a");
    browseLink.href = "../general/browse_rooms.htm";
    browseLink.className = "btn-primary";
    browseLink.textContent = "Browse Other Rooms";

    wrapper.append(icon, heading, description, retryButton, browseLink);
    main.append(wrapper);
}

/*
|--------------------------------------------------------------------------
| Rendering
|--------------------------------------------------------------------------
*/

function renderHero(listing) {
    el("propertyTitle").textContent = listing.title || "Untitled listing";

    const universityName = listing.universities?.name;
    el("propertyLocation").textContent = universityName
        ? `${listing.area || "Unknown area"} - Near ${universityName}`
        : listing.area || "Location not specified";

    el("breadcrumbRoomName").textContent = listing.title || "Room Details";

    document.title = `${listing.title || "Room Details"} | ResiHub`;
}

function renderGallery(listing) {
    const mainImage = el("mainPropertyImage");
    mainImage.classList.remove("skeleton");

    const images = Array.isArray(listing.listing_images)
        ? [...listing.listing_images].sort(
            (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
        )
        : [];

    const urls = images.length
        ? images.map((image) => image.image_url)
        : [PLACEHOLDER_IMAGE];

    mainImage.src = urls[0];
    mainImage.alt = listing.title || "Student accommodation";

    const gallery = el("thumbnailGallery");
    gallery.replaceChildren();

    if (urls.length <= 1) {
        return;
    }

    urls.forEach((url) => {
        const thumb = document.createElement("img");
        thumb.src = url;
        thumb.alt = "Property photo";
        thumb.loading = "lazy";

        thumb.addEventListener("click", () => {
            mainImage.src = url;
        });

        gallery.append(thumb);
    });
}

function renderAmenities(listing) {
    const grid = el("amenitiesGrid");
    grid.replaceChildren();

    const amenities = listing.amenities;
    const activeKeys = amenities && typeof amenities === "object"
        ? Object.entries(amenities).filter(([, enabled]) => Boolean(enabled))
        : [];

    if (activeKeys.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No amenities listed for this property yet.";
        grid.append(empty);
        return;
    }

    activeKeys.forEach(([key]) => {
        const meta = AMENITY_META[key] || {
            icon: "fa-circle-check",
            label: key.charAt(0).toUpperCase() + key.slice(1),
        };

        const item = document.createElement("div");

        const icon = document.createElement("i");
        icon.className = `fa-solid ${meta.icon}`;
        icon.setAttribute("aria-hidden", "true");

        const label = document.createElement("span");
        label.textContent = meta.label;
        label.style.display = "block";
        label.style.marginTop = ".4rem";

        item.append(icon, label);
        grid.append(item);
    });

    renderMapFallback(listing);
}

function renderMapFallback(listing) {
    const mapContainer = el("propertyMap");
    mapContainer.replaceChildren();

    /*
     * No mapping library or API key is configured anywhere in this
     * project yet. Rather than fake a map, show the address we do
     * have and flag that a real map needs a provider + key.
     */
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "center";
    wrapper.style.height = "100%";
    wrapper.style.textAlign = "center";
    wrapper.style.padding = "1.5rem";
    wrapper.style.gap = ".5rem";

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-map-location-dot";
    icon.style.fontSize = "2rem";

    const address = document.createElement("p");
    address.textContent = listing.address || listing.area || "Address not specified";

    const note = document.createElement("p");
    note.textContent = "Map view coming soon.";
    note.style.opacity = "0.6";
    note.style.fontSize = "0.85rem";

    wrapper.append(icon, address, note);
    mapContainer.append(wrapper);
}

function renderSidebar(listing) {
    el("propertyPrice").textContent = formatPrice(listing.price);
    el("propertyType").textContent = formatPropertyType(listing.property_type);
    el("propertyUniversity").textContent = listing.universities?.name || "Not specified";
    el("propertyArea").textContent = listing.area || "Not specified";

    /*
     * "listings" has no bedrooms column in the current schema -
     * showing this honestly rather than guessing a number.
     */
    el("propertyBedrooms").textContent = "Not specified";

    const amenities = listing.amenities || {};
    el("propertyBathrooms").textContent = amenities.bathroom ? "Private" : "Not specified";
    el("propertyKitchen").textContent = amenities.kitchen ? "Available" : "Not specified";
    el("propertyFurnished").textContent = amenities.furnished ? "Furnished" : "Not specified";

    el("propertyAvailability").textContent =
        listing.availability_status === "available" ? "Available Now" : "Currently Booked";

    el("propertyDate").textContent = formatDate(listing.created_at);
}

async function renderLandlord(listing) {
    if (!listing.landlord_id) {
        return;
    }

    const result = await getProfile(listing.landlord_id);

    if (!result.success || !result.data) {
        el("landlordName").textContent = "Landlord";
        return;
    }

    const profile = result.data;

    el("landlordName").textContent = profile.full_name || "Landlord";
    el("landlordImage").src = profile.avatar_url || DEFAULT_AVATAR;
}

function renderStarDisplay(container, rating) {
    container.replaceChildren();

    for (let index = 1; index <= 5; index += 1) {
        const star = document.createElement("i");
        star.className = index <= rating ? "fa-solid fa-star" : "fa-regular fa-star";
        container.append(star);
    }
}

function renderReviews(reviews) {
    const container = el("reviewsContainer");
    container.replaceChildren();

    if (!Array.isArray(reviews) || reviews.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No reviews yet. Be the first to share your experience.";
        container.append(empty);
        return;
    }

    const list = document.createElement("div");
    list.className = "review-list";

    reviews.forEach((review) => {
        const card = document.createElement("div");
        card.className = "review-card";

        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";
        header.style.marginBottom = ".5rem";

        const name = document.createElement("strong");
        name.textContent = review.profiles?.full_name || "Student";

        const rating = document.createElement("div");
        rating.className = "rating";
        renderStarDisplay(rating, review.rating);

        header.append(name, rating);

        const comment = document.createElement("p");
        comment.textContent = review.comment || "No comment left.";

        const date = document.createElement("p");
        date.textContent = formatDate(review.created_at);
        date.style.opacity = "0.6";
        date.style.fontSize = "0.85rem";
        date.style.marginTop = ".5rem";

        card.append(header, comment, date);
        list.append(card);
    });

    container.append(list);
}

async function renderSimilarListings(listing) {
    const container = el("similarListings");

    const result = await getListings({
        universityId: listing.university_id || undefined,
        propertyType: listing.property_type || undefined,
        pageSize: 4,
    });

    if (!result.success) {
        container.replaceChildren();
        const message = document.createElement("p");
        message.textContent = "Couldn't load similar listings right now.";
        container.append(message);
        return;
    }

    const others = result.data.listings.filter((item) => item.id !== listing.id).slice(0, 3);

    container.replaceChildren();

    if (others.length === 0) {
        const message = document.createElement("p");
        message.textContent = "No similar listings found yet.";
        container.append(message);
        return;
    }

    const fragment = document.createDocumentFragment();
    others.forEach((item) => fragment.append(createListingCard(item)));
    container.append(fragment);
}

function renderFavoriteButton() {
    const button = el("saveListing");

    if (!button) {
        return;
    }

    button.textContent = favorited ? "❤️ Saved" : "🤍 Save";
    button.setAttribute("aria-pressed", String(favorited));
}

/*
|--------------------------------------------------------------------------
| Favorites
|--------------------------------------------------------------------------
*/

async function toggleFavorite() {
    if (!currentUser) {
        showToast("Please log in as a student to save listings.", { type: "info" });
        window.location.href = "../auth/student_login.htm";
        return;
    }

    const previous = favorited;
    favorited = !favorited;
    renderFavoriteButton();

    const result = previous
        ? await removeFavorite(currentUser.id, currentListing.id)
        : await addFavorite(currentUser.id, currentListing.id);

    if (!result.success) {
        favorited = previous;
        renderFavoriteButton();
        showToast("Couldn't update your favorites. Please try again.", { type: "error" });
        return;
    }

    showToast(previous ? "Removed from saved properties." : "Saved to your favorites.", {
        type: "success",
    });
}

/*
|--------------------------------------------------------------------------
| Booking modal
|--------------------------------------------------------------------------
*/

function buildBookingModal() {
    if (el("bookingInspectionModal")) {
        return;
    }

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "bookingInspectionModal";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Book an Inspection</h2>
                <button type="button" class="modal-close" data-modal-close aria-label="Close">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <form id="bookingForm" novalidate>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="inspectionDate">Preferred Date &amp; Time</label>
                        <input type="datetime-local" id="inspectionDate" name="inspectionDate" class="form-control" required>
                        <p class="validation-message" id="inspectionDateError" hidden>Please choose a valid future date and time.</p>
                    </div>
                    <div class="form-group">
                        <label for="bookingMessage">Message to Landlord (optional)</label>
                        <textarea id="bookingMessage" name="message" class="form-control" rows="3" maxlength="500" placeholder="Any details you'd like to share..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline" data-modal-close>Cancel</button>
                    <button type="submit" class="btn btn-primary" id="submitBookingBtn">Send Request</button>
                </div>
            </form>
        </div>
    `;

    document.body.append(modal);

    el("bookingForm").addEventListener("submit", handleBookingSubmit);
}

async function handleBookingSubmit(event) {
    event.preventDefault();

    if (submittingBooking) {
        return;
    }

    if (!currentUser) {
        showToast("Please log in as a student to book an inspection.", { type: "info" });
        window.location.href = "../auth/student_login.htm";
        return;
    }

    const dateInput = el("inspectionDate");
    const dateError = el("inspectionDateError");
    const chosenDate = dateInput.value ? new Date(dateInput.value) : null;

    const isValidFutureDate = chosenDate && !Number.isNaN(chosenDate.getTime()) && chosenDate > new Date();

    dateError.hidden = isValidFutureDate;

    if (!isValidFutureDate) {
        dateInput.focus();
        return;
    }

    const submitButton = el("submitBookingBtn");
    submittingBooking = true;
    submitButton.disabled = true;
    submitButton.textContent = "Sending...";

    const result = await createBookingRequest({
        listingId: currentListing.id,
        landlordId: currentListing.landlord_id,
        inspectionDate: chosenDate.toISOString(),
        message: el("bookingMessage").value,
    });

    submittingBooking = false;
    submitButton.disabled = false;
    submitButton.textContent = "Send Request";

    if (!result.success) {
        showToast(result.error?.message || "Couldn't send your booking request.", { type: "error" });
        return;
    }

    showToast("Inspection request sent to the landlord.", { type: "success" });
    el("bookingForm").reset();
    closeModal();
}

/*
|--------------------------------------------------------------------------
| Review modal
|--------------------------------------------------------------------------
*/

function buildReviewModal() {
    if (el("reviewModal")) {
        return;
    }

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "reviewModal";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Write a Review</h2>
                <button type="button" class="modal-close" data-modal-close aria-label="Close">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <form id="reviewForm" novalidate>
                <div class="modal-body">
                    <div class="form-group">
                        <label id="starRatingLabel">Your Rating</label>
                        <div class="rating" id="starRatingInput" role="radiogroup" aria-labelledby="starRatingLabel"></div>
                        <p class="validation-message" id="ratingError" hidden>Please select a rating.</p>
                    </div>
                    <div class="form-group">
                        <label for="reviewComment">Your Review</label>
                        <textarea id="reviewComment" name="comment" class="form-control" rows="4" maxlength="1000" placeholder="Share your experience with this property..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline" data-modal-close>Cancel</button>
                    <button type="submit" class="btn btn-primary" id="submitReviewBtn">Submit Review</button>
                </div>
            </form>
        </div>
    `;

    document.body.append(modal);

    buildStarRatingInput();

    el("reviewForm").addEventListener("submit", handleReviewSubmit);
}

function buildStarRatingInput() {
    const container = el("starRatingInput");
    container.replaceChildren();
    selectedRating = 0;

    for (let value = 1; value <= 5; value += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", "false");
        button.setAttribute("aria-label", `${value} star${value > 1 ? "s" : ""}`);
        button.style.background = "none";
        button.style.border = "none";
        button.style.cursor = "pointer";
        button.style.fontSize = "1.4rem";
        button.style.color = "rgba(255, 255, 255, 0.3)";

        const icon = document.createElement("i");
        icon.className = "fa-solid fa-star";
        button.append(icon);

        button.addEventListener("click", () => {
            selectedRating = value;
            updateStarRatingDisplay(container);
            el("ratingError").hidden = true;
        });

        container.append(button);
    }
}

function updateStarRatingDisplay(container) {
    [...container.children].forEach((button, index) => {
        const active = index < selectedRating;
        button.style.color = active ? "#FFD54F" : "rgba(255, 255, 255, 0.3)";
        button.setAttribute("aria-checked", String(active));
    });
}

async function handleReviewSubmit(event) {
    event.preventDefault();

    if (submittingReview) {
        return;
    }

    if (!currentUser) {
        showToast("Please log in as a student to leave a review.", { type: "info" });
        window.location.href = "../auth/student_login.htm";
        return;
    }

    if (selectedRating < 1) {
        el("ratingError").hidden = false;
        return;
    }

    const submitButton = el("submitReviewBtn");
    submittingReview = true;
    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    const result = await createReview({
        listingId: currentListing.id,
        rating: selectedRating,
        comment: el("reviewComment").value,
    });

    submittingReview = false;
    submitButton.disabled = false;
    submitButton.textContent = "Submit Review";

    if (!result.success) {
        showToast(result.error?.message || "Couldn't submit your review.", { type: "error" });
        return;
    }

    showToast("Thanks for your review!", { type: "success" });
    el("reviewForm").reset();
    buildStarRatingInput();
    closeModal();

    const reviewsResult = await getReviews(currentListing.id);
    if (reviewsResult.success) {
        renderReviews(reviewsResult.data);
    }
}

/*
|--------------------------------------------------------------------------
| Contact actions
|--------------------------------------------------------------------------
*/

function normalizePhoneForWhatsApp(phone) {
    if (!phone) {
        return null;
    }

    const digitsOnly = phone.replace(/[^\d+]/g, "");

    if (digitsOnly.startsWith("+")) {
        return digitsOnly.slice(1);
    }

    if (digitsOnly.startsWith("0")) {
        return `234${digitsOnly.slice(1)}`;
    }

    return digitsOnly;
}

function handleWhatsAppClick() {
    const number = normalizePhoneForWhatsApp(currentListing?.phone);

    if (!number) {
        showToast("This landlord hasn't provided a WhatsApp number.", { type: "info" });
        return;
    }

    const message = encodeURIComponent(
        `Hi, I'm interested in "${currentListing.title}" on ResiHub.`
    );

    window.open(`https://wa.me/${number}?text=${message}`, "_blank", "noopener");
}

function handleChatClick() {
    if (!currentUser) {
        showToast("Please log in as a student to message the landlord.", { type: "info" });
        window.location.href = "../auth/student_login.htm";
        return;
    }

    window.location.href =
        `../student/messages.htm?landlord=${encodeURIComponent(currentListing.landlord_id)}` +
        `&listing=${encodeURIComponent(currentListing.id)}`;
}

/*
|--------------------------------------------------------------------------
| Event wiring
|--------------------------------------------------------------------------
*/

function wireActions() {
    el("saveListing")?.addEventListener("click", toggleFavorite);

    el("bookInspection")?.addEventListener("click", () => {
        buildBookingModal();
        openModal("bookingInspectionModal");
    });

    el("writeReviewBtn")?.addEventListener("click", () => {
        buildReviewModal();
        openModal("reviewModal");
    });

    el("whatsappBtn")?.addEventListener("click", handleWhatsAppClick);
    el("chatBtn")?.addEventListener("click", handleChatClick);

    el("viewLandlordProfile")?.addEventListener("click", () => {
        showToast("Public landlord profile pages are coming soon.", { type: "info" });
    });
}

/*
|--------------------------------------------------------------------------
| Init
|--------------------------------------------------------------------------
*/

export async function init() {
    const listingId = getListingId();

    if (!listingId) {
        showErrorState("No listing was specified. Please go back and pick a property to view.");
        return;
    }

    showLoadingState();

    const [listingResult, userResult] = await Promise.all([
        getListing(listingId),
        getCurrentUser(),
    ]);

    if (!listingResult.success) {
        showErrorState(listingResult.error?.message || "This listing could not be found.");
        return;
    }

    currentListing = listingResult.data;
    currentUser = userResult.success ? userResult.data : null;

    renderHero(currentListing);
    renderGallery(currentListing);
    renderAmenities(currentListing);
    renderSidebar(currentListing);
    wireActions();

    saveRecentlyViewed(currentListing.id);

    if (currentUser) {
        const favoriteResult = await isFavorite(currentUser.id, currentListing.id);
        favorited = favoriteResult.success && favoriteResult.data;
        renderFavoriteButton();
    } else {
        renderFavoriteButton();
    }

    const [reviewsResult] = await Promise.all([
        getReviews(currentListing.id),
        renderLandlord(currentListing),
        renderSimilarListings(currentListing),
    ]);

    if (reviewsResult.success) {
        renderReviews(reviewsResult.data);
    } else {
        renderReviews([]);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
    init();
}