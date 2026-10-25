import {
    getCurrentUser,
    getProfile,
    getFavorites,
    getStudentBookings,
    getUnreadNotificationCount,
    getListings,
    supabase,
} from "../../api.js";
import { renderListingCards } from "../../listings.js";

const $ = (id) => document.getElementById(id);

const DEFAULT_AVATAR = "../assets/images/default-avatar.png";
const DEFAULT_ROOM = "../assets/images/placeholder-room.jpg";

const STATUS = {
    pending: { label: "Pending", className: "status-pending" },
    approved: { label: "Confirmed", className: "status-confirmed" },
    rejected: { label: "Rejected", className: "status-rejected" },
    cancelled: { label: "Cancelled", className: "status-rejected" },
};

export async function init() {
    setTodayAndGreeting();

    const userResult = await getCurrentUser();
    const user = userResult.success ? userResult.data : null;
    if (!user) return;

    const [profileResult, favoritesResult, bookingsResult, notificationsResult, unreadMessages, listingsResult] =
        await Promise.all([
            getProfile(user.id),
            getFavorites(user.id),
            getStudentBookings(user.id),
            getUnreadNotificationCount(user.id),
            countUnreadMessages(user.id),
            getListings({ pageSize: 3 }),
        ]);

    if (profileResult.success && profileResult.data) {
        renderProfile(profileResult.data);
    }

    if (favoritesResult.success) {
        setText("savedCount", favoritesResult.data.length);
    }

    if (bookingsResult.success) {
        renderBookings(bookingsResult.data);
    }

    setText("messageCount", unreadMessages);
    setBadge("notificationBadge", notificationsResult.success ? notificationsResult.data : 0);

    if (listingsResult.success) {
        const listings = listingsResult.data?.listings ?? [];
        renderListingCards($("recommendedListings"), listings);
        $("noRecommendations")?.classList.toggle("hidden", listings.length > 0);
    }
}

function setTodayAndGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? "Good morning," : hour < 17 ? "Good afternoon," : "Good evening,";

    setText("greetingKicker", greeting);
    setText(
        "todayDate",
        now.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    );
}

async function countUnreadMessages(userId) {
    const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .eq("is_read", false);

    return error ? 0 : count ?? 0;
}

function renderProfile(profile) {
    setText("studentName", profile.full_name || "Student");
    setText("profileUniversity", profile.university || "");
    setText("profileLevel", profile.level ? `${profile.level} Level` : "");

    const avatar = profile.avatar_url || DEFAULT_AVATAR;
    $("studentAvatar")?.setAttribute("src", avatar);
    $("headerAvatar")?.setAttribute("src", avatar);
}

function renderBookings(bookings) {
    setText("activeBookingCount", bookings.filter((b) => b.status === "approved").length);
    setText("pendingCount", bookings.filter((b) => b.status === "pending").length);

    const upcoming = bookings
        .filter((b) => b.status === "pending" || b.status === "approved")
        .slice(0, 3);

    $("inspectionList")?.replaceChildren(...upcoming.map((b) => createBookingItem(b)));
    $("noInspections")?.classList.toggle("hidden", upcoming.length > 0);
}

function createBookingItem(booking) {
    const listing = booking.listings ?? {};
    const status = STATUS[booking.status] ?? { label: booking.status, className: "status-pending" };

    const item = document.createElement("article");
    item.className = "booking-item";

    const image = document.createElement("img");
    image.src = roomImage(listing);
    image.alt = listing.title || "Room photo";

    const info = document.createElement("div");
    info.className = "booking-info";

    const title = document.createElement("h3");
    title.textContent = listing.title || "Room";

    const place = document.createElement("p");
    place.textContent = listing.universities?.name || listing.area || "";

    const when = document.createElement("p");
    const date = booking.inspection_date ?? booking.created_at;
    when.textContent = `${booking.inspection_date ? "Inspection" : "Requested"}: ${formatDate(date)}`;

    info.append(title, place, when);

    const badge = document.createElement("span");
    badge.className = `booking-status ${status.className}`;
    badge.textContent = status.label;

    const view = document.createElement("a");
    view.className = "booking-view";
    view.href = "../student/booking_requests.htm";
    view.textContent = "View";

    item.append(image, info, badge, view);
    return item;
}

function roomImage(listing) {
    const images = [...(listing.listing_images ?? [])].sort(
        (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );
    return images[0]?.image_url || DEFAULT_ROOM;
}

function formatDate(value) {
    if (!value) return "Date unavailable";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "Date unavailable"
        : date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function setBadge(id, count) {
    const el = $(id);
    if (!el) return;
    el.textContent = count;
    el.classList.toggle("hidden", !count);
}