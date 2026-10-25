import { getCurrentUser, getProfile, supabase } from "./api.js";
import { showError } from "./student_utils.js";
import { renderLandlordBanner } from "./core/verification.js";

const $ = (id) => document.getElementById(id);

const DEFAULT_AVATAR = "../assets/images/default-avatar.png";
const DEFAULT_ROOM = "../assets/images/placeholder-room.jpg";

const BOOKING_LABEL = {
    pending: "Pending",
    approved: "Confirmed",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
};

const money = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
});

let me = null;

/* ---------- Entry point ---------- */

export async function init() {
    setToday();

    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;

    if (!me) {
        showError("Please sign in to see your dashboard.");
        return;
    }

    await loadProfile();

    // Each section loads on its own, so one failure does not stop the others
    await Promise.all([
        safely("stats", loadStats),
        safely("bookings", loadBookings),
        safely("messages", loadMessages),
        safely("listings", loadListings),
    ]);
}

async function safely(name, task) {
    try {
        await task();
    } catch (error) {
        console.error(`[dashboard] ${name} failed:`, error);
    }
}

/* ---------- Greeting ---------- */

function setToday() {
    setText(
        "todayDate",
        new Date().toLocaleDateString("en-NG", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
        })
    );
}

async function loadProfile() {
    const result = await getProfile(me.id);
    const profile = result.success ? result.data : null;

    setText("landlordName", profile?.business_name || profile?.full_name || "Landlord");
    setImage("landlordAvatar", profile?.avatar_url || DEFAULT_AVATAR);
    renderLandlordBanner($("verifyBanner"), profile?.verification_status ?? "unverified");
}

/* ---------- Stat tiles ---------- */

async function loadStats() {
    const [listings, bookings, unread, reviews] = await Promise.all([
        supabase
            .from("listings")
            .select("id", { count: "exact", head: true })
            .eq("landlord_id", me.id),

        supabase
            .from("booking_requests")
            .select("id", { count: "exact", head: true })
            .eq("landlord_id", me.id),

        // Unread messages sent to this landlord, in their conversations
        supabase
            .from("messages")
            .select("id, conversations!inner(landlord_id)", { count: "exact", head: true })
            .eq("conversations.landlord_id", me.id)
            .eq("is_read", false)
            .neq("sender_id", me.id),

        // Reviews on this landlord's listings
        supabase
            .from("reviews")
            .select("id, listings!inner(landlord_id)", { count: "exact", head: true })
            .eq("listings.landlord_id", me.id),
    ]);

    setText("listingCount", countOf(listings));
    setText("bookingCount", countOf(bookings));
    setText("messageCount", countOf(unread));
    setText("reviewCount", countOf(reviews));
}

function countOf(result) {
    if (result.error) {
        console.error("[dashboard] count failed:", result.error);
        return "—";
    }
    return result.count ?? 0;
}

/* ---------- Recent bookings ---------- */

async function loadBookings() {
    const { data, error } = await supabase
        .from("booking_requests")
        .select(`
            id,
            status,
            created_at,
            listings(title),
            student:profiles!booking_requests_student_id_fkey(full_name)
        `)
        .eq("landlord_id", me.id)
        .order("created_at", { ascending: false })
        .limit(4);

    if (error) throw error;

    const rows = (data ?? []).map((booking) => {
        const link = element("a", "ld-row");
        link.href = "booking_requests.htm";

        const text = element("div");
        text.append(
            element("strong", "", booking.student?.full_name || "Student"),
            element("span", "", booking.listings?.title || "Room")
        );

        const tag = element("span", "ld-tag", BOOKING_LABEL[booking.status] ?? booking.status);

        link.append(text, tag);
        return link;
    });

    renderList("bookingPreview", rows, "No bookings yet.");
}

/* ---------- Recent messages ---------- */

async function loadMessages() {
    const { data, error } = await supabase
        .from("messages")
        .select("id, body, created_at, sender_id, conversation_id, conversations!inner(landlord_id)")
        .eq("conversations.landlord_id", me.id)
        .order("created_at", { ascending: false })
        .limit(4);

    if (error) throw error;

    const rows = (data ?? []).map((message) => {
        const link = element("a", "ld-row");
        link.href = `landlord_messages.htm?c=${encodeURIComponent(message.conversation_id)}`;

        const text = element("div");
        text.append(
            element("strong", "", message.sender_id === me.id ? "You" : "Student"),
            element("span", "", message.body ?? "")
        );

        const time = element("span", "ld-tag", formatTime(message.created_at));

        link.append(text, time);
        return link;
    });

    renderList("recentMessages", rows, "No messages yet.");
}

/* ---------- Your listings ---------- */

async function loadListings() {
    const { data, error } = await supabase
        .from("listings")
        .select("id, title, price, area, listing_images(image_url, display_order)")
        .eq("landlord_id", me.id)
        .order("created_at", { ascending: false })
        .limit(4);

    if (error) throw error;

    const container = $("landlordListings");
    if (!container) return;

    if (!data?.length) {
        container.replaceChildren(emptyNote("You have not added any listings yet."));
        return;
    }

    container.replaceChildren(...data.map((listing) => createListingCard(listing)));
}

function createListingCard(listing) {
    const card = element("a", "ld-listing");
    card.href = `listing_details.htm?id=${encodeURIComponent(listing.id)}`;

    const image = element("img");
    image.src = roomImage(listing);
    image.alt = listing.title || "Room photo";

    const price = element(
        "span",
        "ld-price",
        listing.price != null ? `${money.format(listing.price)}/month` : "Price on request"
    );

    card.append(image, element("strong", "", listing.title || "Room"), price, element("span", "", listing.area || ""));
    return card;
}

function roomImage(listing) {
    const images = [...(listing.listing_images ?? [])].sort(
        (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );
    return images[0]?.image_url || DEFAULT_ROOM;
}

/* ---------- Helpers ---------- */

function renderList(id, nodes, emptyText) {
    const container = $(id);
    if (!container) return;

    container.replaceChildren(...(nodes.length ? nodes : [emptyNote(emptyText)]));
}

function emptyNote(text) {
    return element("p", "ld-empty", text);
}

function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function formatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    const sameDay = date.toDateString() === new Date().toDateString();

    return sameDay
        ? date.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })
        : date.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
}

function setImage(id, src) {
    const node = $(id);
    if (node) node.src = src;
}