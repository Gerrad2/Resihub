// js/dashboard_landlord.js

import {
    supabase,
    getCurrentUser,
    getProfile,
    getLandlordListings,
    getLandlordBookings
} from "./core/api.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const MAX_DASHBOARD_LISTINGS = 6;
const MAX_BOOKING_PREVIEW = 5;
const MAX_MESSAGE_PREVIEW = 5;


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentProfile = null;
let landlordListings = [];
let landlordBookings = [];


/* =========================================================
   DOM
========================================================= */

const landlordNameElement =
    document.getElementById("landlordName");

const landlordAvatarElement =
    document.getElementById("landlordAvatar");

const listingCountElement =
    document.getElementById("listingCount");

const bookingCountElement =
    document.getElementById("bookingCount");

const messageCountElement =
    document.getElementById("messageCount");

const reviewCountElement =
    document.getElementById("reviewCount");

const landlordListingsElement =
    document.getElementById("landlordListings");

const bookingPreviewElement =
    document.getElementById("bookingPreview");

const recentMessagesElement =
    document.getElementById("recentMessages");


/* =========================================================
   UTILITIES
========================================================= */

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function formatCurrency(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "₦0";
    }

    return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        maximumFractionDigits: 0
    }).format(amount);
}


function formatDate(value) {
    if (!value) {
        return "N/A";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "N/A";
    }

    return new Intl.DateTimeFormat("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(date);
}


function formatRelativeDate(value) {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const difference =
        Date.now() - date.getTime();

    const minutes =
        Math.floor(difference / 60000);

    if (minutes < 1) {
        return "Just now";
    }

    if (minutes < 60) {
        return `${minutes}m ago`;
    }

    const hours =
        Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours}h ago`;
    }

    const days =
        Math.floor(hours / 24);

    if (days < 7) {
        return `${days}d ago`;
    }

    return formatDate(value);
}


function getListingImage(listing) {
    const images =
        Array.isArray(listing?.listing_images)
            ? [...listing.listing_images]
            : [];

    images.sort(
        (a, b) =>
            Number(a.display_order ?? 0) -
            Number(b.display_order ?? 0)
    );

    return (
        images[0]?.image_url ||
        "../assets/images/placeholder-room.jpg"
    );
}


function getUniversityName(listing) {
    return (
        listing?.universities?.name ||
        listing?.university?.name ||
        "University not specified"
    );
}


function setText(element, value) {
    if (element) {
        element.textContent = value;
    }
}


/* =========================================================
   AUTHENTICATION
========================================================= */

async function initializeUser() {
    const result =
        await getCurrentUser();

    if (
        !result.success ||
        !result.data
    ) {
        window.location.href =
            "../auth/landlord_login.htm";

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
            "[ResiHub] Unable to load landlord profile:",
            profileResult.error
        );

        showDashboardError(
            "Unable to load your landlord profile."
        );

        return false;
    }

    currentProfile =
        profileResult.data;

    if (
        currentProfile.role !== "landlord"
    ) {
        console.error(
            "[ResiHub] User attempted to access landlord dashboard."
        );

        window.location.href =
            "../general/index.htm";

        return false;
    }

    return true;
}


/* =========================================================
   PROFILE
========================================================= */

function renderProfile() {
    if (!currentProfile) {
        return;
    }

    const name =
        currentProfile.full_name?.trim() ||
        "Landlord";

    setText(
        landlordNameElement,
        name
    );

    if (landlordAvatarElement) {
        landlordAvatarElement.src =
            currentProfile.avatar_url ||
            "../assets/images/default-avatar.png";

        landlordAvatarElement.alt =
            `${name} profile picture`;
    }
}


/* =========================================================
   LISTINGS
========================================================= */

async function loadListings() {
    const result =
        await getLandlordListings(
            currentUser.id
        );

    if (!result.success) {
        console.error(
            "[ResiHub] Failed to load landlord listings:",
            result.error
        );

        landlordListings = [];

        renderListingsError();

        return;
    }

    landlordListings =
        Array.isArray(result.data)
            ? result.data
            : [];

    renderListings();

    setText(
        listingCountElement,
        landlordListings.filter(
            listing =>
                listing.availability_status ===
                "available"
        ).length
    );
}


function renderListings() {
    if (!landlordListingsElement) {
        return;
    }

    if (landlordListings.length === 0) {
        landlordListingsElement.innerHTML = `
            <div class="dashboard-empty-state">
                <i class="fa-solid fa-house-circle-exclamation"></i>
                <h3>No listings yet</h3>
                <p>
                    Create your first property listing
                    to start reaching students.
                </p>

                <a
                    href="../landlord/create_listing.htm"
                    class="btn-primary"
                >
                    <i class="fa-solid fa-plus"></i>
                    Create Listing
                </a>
            </div>
        `;

        return;
    }

    landlordListingsElement.innerHTML =
        landlordListings
            .slice(0, MAX_DASHBOARD_LISTINGS)
            .map(createListingCard)
            .join("");
}


function createListingCard(listing) {
    const image =
        escapeHtml(
            getListingImage(listing)
        );

    const title =
        escapeHtml(
            listing.title ||
            "Untitled Property"
        );

    const area =
        escapeHtml(
            listing.area ||
            "Location unavailable"
        );

    const university =
        escapeHtml(
            getUniversityName(listing)
        );

    const price =
        formatCurrency(
            listing.price
        );

    const status =
        listing.availability_status ||
        "unknown";

    const statusClass =
        status.toLowerCase();

    return `
        <article
            class="listing-card"
            data-listing-id="${escapeHtml(listing.id)}"
        >

            <div class="listing-image">
                <img
                    src="${image}"
                    alt="${title}"
                    loading="lazy"
                >

                <span class="listing-status ${statusClass}">
                    ${escapeHtml(
        formatStatus(status)
    )}
                </span>
            </div>

            <div class="listing-content">

                <h3>
                    ${title}
                </h3>

                <p class="listing-location">
                    <i class="fa-solid fa-location-dot"></i>
                    ${area}
                </p>

                <p class="listing-university">
                    <i class="fa-solid fa-building-columns"></i>
                    ${university}
                </p>

                <div class="listing-footer">

                    <strong>
                        ${escapeHtml(price)}
                    </strong>

                    <a
                        href="../landlord/listing_details.htm?id=${encodeURIComponent(listing.id)}"
                        class="btn-primary"
                    >
                        View
                    </a>

                </div>

            </div>

        </article>
    `;
}


function formatStatus(status) {
    const normalized =
        String(status ?? "")
            .replaceAll("_", " ")
            .trim();

    if (!normalized) {
        return "Unknown";
    }

    return normalized
        .charAt(0)
        .toUpperCase() +
        normalized.slice(1);
}


function renderListingsError() {
    if (!landlordListingsElement) {
        return;
    }

    landlordListingsElement.innerHTML = `
        <div class="dashboard-empty-state">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <h3>Unable to load listings</h3>
            <p>
                We couldn't retrieve your properties.
                Please try again later.
            </p>
        </div>
    `;
}


/* =========================================================
   BOOKINGS
========================================================= */

async function loadBookings() {
    const result =
        await getLandlordBookings(
            currentUser.id
        );

    if (!result.success) {
        console.error(
            "[ResiHub] Failed to load landlord bookings:",
            result.error
        );

        landlordBookings = [];

        renderBookingsError();

        return;
    }

    landlordBookings =
        Array.isArray(result.data)
            ? result.data
            : [];

    const pendingBookings =
        landlordBookings.filter(
            booking =>
                booking.status === "pending"
        );

    setText(
        bookingCountElement,
        pendingBookings.length
    );

    renderBookings();
}


function renderBookings() {
    if (!bookingPreviewElement) {
        return;
    }

    if (landlordBookings.length === 0) {
        bookingPreviewElement.innerHTML = `
            <div class="dashboard-empty-state">
                <i class="fa-solid fa-calendar-xmark"></i>
                <h3>No inspection requests</h3>
                <p>
                    New inspection requests from students
                    will appear here.
                </p>
            </div>
        `;

        return;
    }

    bookingPreviewElement.innerHTML =
        landlordBookings
            .slice(0, MAX_BOOKING_PREVIEW)
            .map(createBookingItem)
            .join("");
}


function createBookingItem(booking) {
    const listing =
        booking.listings || {};

    const title =
        escapeHtml(
            listing.title ||
            "Property"
        );

    const area =
        escapeHtml(
            listing.area ||
            "Location unavailable"
        );

    const status =
        escapeHtml(
            formatStatus(
                booking.status
            )
        );

    const inspectionDate =
        booking.inspection_date
            ? formatDate(
                booking.inspection_date
            )
            : "Date not selected";

    return `
        <article
            class="inspection-item"
            data-booking-id="${escapeHtml(booking.id)}"
        >

            <div class="inspection-icon">
                <i class="fa-solid fa-calendar-check"></i>
            </div>

            <div class="inspection-content">

                <h3>
                    ${title}
                </h3>

                <p>
                    <i class="fa-solid fa-location-dot"></i>
                    ${area}
                </p>

                <span>
                    Inspection:
                    ${escapeHtml(inspectionDate)}
                </span>

            </div>

            <span class="booking-status">
                ${status}
            </span>

        </article>
    `;
}


function renderBookingsError() {
    if (!bookingPreviewElement) {
        return;
    }

    bookingPreviewElement.innerHTML = `
        <div class="dashboard-empty-state">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <h3>Unable to load requests</h3>
            <p>
                We couldn't retrieve your inspection requests.
            </p>
        </div>
    `;
}


/* =========================================================
   MESSAGES
========================================================= */

async function loadMessages() {
    /*
     * The current API provides getMessages() for a specific
     * conversation, but the landlord dashboard needs a
     * conversation-wide preview.
     *
     * Therefore this query remains isolated here until a
     * dedicated conversation-list API method is introduced.
     */

    try {
        const {
            data,
            error
        } = await supabase
            .from("messages")
            .select(`
                id,
                sender_id,
                receiver_id,
                listing_id,
                message,
                is_read,
                created_at
            `)
            .or(
                `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            )
            .limit(
                MAX_MESSAGE_PREVIEW
            );

        if (error) {
            throw error;
        }

        const messages =
            Array.isArray(data)
                ? data
                : [];

        const unreadCount =
            messages.filter(
                message =>
                    message.receiver_id ===
                    currentUser.id &&
                    message.is_read === false
            ).length;

        /*
         * Dashboard count currently represents the
         * unread messages returned by the preview query.
         */
        setText(
            messageCountElement,
            unreadCount
        );

        renderMessages(messages);

    } catch (error) {
        console.error(
            "[ResiHub] Failed to load messages:",
            error
        );

        renderMessagesError();
    }
}


function renderMessages(messages) {
    if (!recentMessagesElement) {
        return;
    }

    if (!messages.length) {
        recentMessagesElement.innerHTML = `
            <div class="dashboard-empty-state">
                <i class="fa-solid fa-message"></i>
                <h3>No messages yet</h3>
                <p>
                    Student enquiries will appear here.
                </p>
            </div>
        `;

        return;
    }

    recentMessagesElement.innerHTML =
        messages
            .map(message => {
                const isIncoming =
                    message.receiver_id ===
                    currentUser.id;

                const preview =
                    String(
                        message.message ?? ""
                    ).slice(0, 100);

                return `
                    <article class="message-preview-item">

                        <div class="message-preview-icon">
                            <i class="fa-solid fa-user"></i>
                        </div>

                        <div class="message-preview-content">

                            <p>
                                ${escapeHtml(preview)}
                            </p>

                            <span>
                                ${escapeHtml(
                    formatRelativeDate(
                        message.created_at
                    )
                )}
                            </span>

                        </div>

                        ${isIncoming &&
                        !message.is_read
                        ? `
                                    <span
                                        class="unread-dot"
                                        aria-label="Unread message"
                                    ></span>
                                `
                        : ""
                    }

                    </article>
                `;
            })
            .join("");
}


function renderMessagesError() {
    if (!recentMessagesElement) {
        return;
    }

    recentMessagesElement.innerHTML = `
        <div class="dashboard-empty-state">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <h3>Unable to load messages</h3>
            <p>
                We couldn't retrieve your messages.
            </p>
        </div>
    `;
}


/* =========================================================
   REVIEWS
========================================================= */

async function loadReviewStats() {
    /*
     * Reviews are connected to listings, so we first collect
     * this landlord's listing IDs and then retrieve reviews.
     */

    const listingIds =
        landlordListings
            .map(
                listing => listing.id
            )
            .filter(Boolean);

    if (!listingIds.length) {
        setText(
            reviewCountElement,
            "0.0"
        );

        return;
    }

    try {
        const {
            data,
            error
        } = await supabase
            .from("reviews")
            .select(
                "rating, listing_id"
            )
            .in(
                "listing_id",
                listingIds
            );

        if (error) {
            throw error;
        }

        const reviews =
            Array.isArray(data)
                ? data
                : [];

        if (!reviews.length) {
            setText(
                reviewCountElement,
                "0.0"
            );

            return;
        }

        const total =
            reviews.reduce(
                (sum, review) =>
                    sum +
                    Number(review.rating || 0),
                0
            );

        const average =
            total / reviews.length;

        setText(
            reviewCountElement,
            average.toFixed(1)
        );

    } catch (error) {
        console.error(
            "[ResiHub] Failed to load review statistics:",
            error
        );

        setText(
            reviewCountElement,
            "0.0"
        );
    }
}


/* =========================================================
   ERROR HANDLING
========================================================= */

function showDashboardError(message) {
    console.error(
        `[ResiHub] ${message}`
    );

    if (
        typeof window.showToast ===
        "function"
    ) {
        window.showToast(
            message,
            "error"
        );
    }
}


/* =========================================================
   INITIALIZATION
========================================================= */

async function initializeDashboard() {
    const authenticated =
        await initializeUser();

    if (!authenticated) {
        return;
    }

    renderProfile();

    /*
     * Listings must load before review statistics because
     * review statistics depend on the landlord's listing IDs.
     */

    await Promise.all([
        loadListings(),
        loadBookings(),
        loadMessages()
    ]);

    await loadReviewStats();

    console.log(
        "[ResiHub] Landlord dashboard initialized."
    );
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
        initializeDashboard,
        {
            once: true
        }
    );
} else {
    initializeDashboard();
}