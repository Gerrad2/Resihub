import { getCurrentUser, getProfile, supabase } from "./api.js";
import { showError } from "./student_utils.js";

const $ = (id) => document.getElementById(id);

const DEFAULT_ROOM = "../assets/images/placeholder-room.jpg";
const DEFAULT_AVATAR = "../assets/images/default-avatar.png";

const money = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
});

const PUBLICATION_LABEL = { published: "Published", draft: "Draft", archived: "Archived" };
const AVAILABILITY_LABEL = { available: "Available", booked: "Booked", unavailable: "Unavailable" };
const BOOKING_LABEL = { pending: "Pending", approved: "Confirmed", completed: "Completed", rejected: "Rejected", cancelled: "Cancelled" };

const AMENITY_LABEL = {
    wifi: "Wi-Fi",
    water: "Running water",
    electricity: "Stable electricity",
    security: "Security",
    parking: "Parking",
    furnished: "Furnished",
    kitchen: "Kitchen",
    bathroom: "Private bathroom",
};

let me = null;
let listingId = null;

export async function init() {
    listingId = new URLSearchParams(location.search).get("id");

    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;

    if (!me) {
        showError("Please sign in to view this listing.");
        return;
    }

    if (!listingId) {
        setText("propertyTitle", "No listing selected");
        setText("propertyDescription", "Go back to My Listings and choose a listing.");
        return;
    }

    const { data: listing, error } = await supabase
        .from("listings")
        .select("*, universities(name), listing_images(image_url, display_order)")
        .eq("id", listingId)
        .eq("landlord_id", me.id)
        .maybeSingle();

    if (error || !listing) {
        showError("This listing could not be found.");
        setText("propertyTitle", "Listing not found");
        return;
    }

    const [profileResult] = await Promise.all([
        getProfile(me.id),
        safely("bookings", () => loadBookings()),
        safely("reviews", () => loadReviews()),
        safely("similar", () => loadOtherListings()),
    ]);

    renderListing(listing);
    renderOwner(profileResult.success ? profileResult.data : null, listing);
    renderEditLinks();
}

async function safely(name, task) {
    try {
        await task();
    } catch (error) {
        console.error(`[listing_details] ${name} failed:`, error);
    }
}

/* ---------- Listing ---------- */

function renderListing(listing) {
    const images = sortImages(listing.listing_images ?? []);
    const gallery = $("propertyGallery");
    if (gallery) {
        gallery.replaceChildren(...(images.length
            ? images.map((image) => element("img", "", "", { src: image.image_url, alt: listing.title || "Room photo" }))
            : [element("img", "", "", { src: DEFAULT_ROOM, alt: "No photos yet" })]));
    }

    setText("propertyTitle", listing.title || "Room");
    setText("propertyLocation", [listing.area, listing.universities?.name].filter(Boolean).join(" · "));
    setText("propertyPrice", listing.price != null ? `${money.format(listing.price)}/month` : "On request");
    setText("propertyType", labelise(listing.property_type));
    setText("bedroomCount", listing.bedrooms ?? "—");
    setText("bathroomCount", listing.bathrooms ?? "—");
    setText("propertySize", listing.available_rooms ?? "—");
    setText("propertyDescription", listing.description || "No description yet.");

    const badges = $("propertyBadges");
    if (badges) {
        badges.replaceChildren(
            element("span", `ll-badge ${listing.publication_status || ""}`, PUBLICATION_LABEL[listing.publication_status] ?? "Draft"),
            element("span", `ll-badge ${listing.availability_status || ""}`, AVAILABILITY_LABEL[listing.availability_status] ?? "Available")
        );
    }

    const amenities = listing.amenities ?? {};
    const amenityList = $("amenitiesGrid");
    if (amenityList) {
        amenityList.replaceChildren(...Object.entries(AMENITY_LABEL).map(([key, label]) =>
            element("li", "", "", null, [
                element("span", "", label),
                element("strong", "", amenities[key] ? "Yes" : "No"),
            ])
        ));
    }

    const details = $("featuresGrid");
    if (details) {
        details.replaceChildren(
            detailRow("Area", listing.area),
            detailRow("Address", listing.address),
            detailRow("University", listing.universities?.name),
            detailRow("Listed", formatDate(listing.created_at))
        );
    }
}

function renderOwner(profile, listing) {
    const photo = $("landlordPhoto");
    if (photo) photo.src = profile?.avatar_url || DEFAULT_AVATAR;

    setText("landlordName", profile?.business_name || profile?.full_name || "You");
    setText("landlordJoined", profile?.created_at ? `Landlord since ${new Date(profile.created_at).getFullYear()}` : "");
}

function renderEditLinks() {
    const edit = $("inspectionBtn");
    if (edit && listingId) edit.href = `edit_listing.htm?id=${encodeURIComponent(listingId)}`;
}

/* ---------- Bookings for this listing ---------- */

async function loadBookings() {
    const { data, error } = await supabase
        .from("booking_requests")
        .select("id, status, created_at, student:profiles!booking_requests_student_id_fkey(full_name)")
        .eq("listing_id", listingId)
        .eq("landlord_id", me.id)
        .order("created_at", { ascending: false })
        .limit(6);

    if (error) throw error;

    const rows = (data ?? []).map((booking) => {
        const row = element("div", "ll-row");
        const who = element("div");
        who.append(
            element("strong", "", booking.student?.full_name || "Student"),
            element("span", "", formatDate(booking.created_at))
        );
        row.append(who, element("span", "ll-tag", BOOKING_LABEL[booking.status] ?? booking.status));
        return row;
    });

    renderRows("listingBookings", rows, "No bookings for this listing yet.");
}

/* ---------- Reviews for this listing ---------- */

async function loadReviews() {
    const { data, error } = await supabase
        .from("reviews")
        .select("rating, comment, created_at, profiles(full_name)")
        .eq("listing_id", listingId)
        .order("created_at", { ascending: false })
        .limit(6);

    if (error) throw error;

    const rows = (data ?? []).map((review) => {
        const row = element("div", "ll-row");
        const who = element("div");
        who.append(
            element("strong", "", review.profiles?.full_name || "Student"),
            element("span", "", review.comment || "No comment written.")
        );
        const stars = element("span", "ll-stars", `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`);
        row.append(who, stars);
        return row;
    });

    renderRows("reviewList", rows, "No reviews yet.");
}

/* ---------- Your other listings ---------- */

async function loadOtherListings() {
    const { data, error } = await supabase
        .from("listings")
        .select("id, title, price, listing_images(image_url, display_order)")
        .eq("landlord_id", me.id)
        .neq("id", listingId)
        .order("created_at", { ascending: false })
        .limit(4);

    if (error) throw error;

    const rows = (data ?? []).map((listing) => {
        const link = element("a", "ll-row");
        link.href = `listing_details.htm?id=${encodeURIComponent(listing.id)}`;

        const text = element("div");
        text.append(
            element("strong", "", listing.title || "Room"),
            element("span", "", listing.price != null ? `${money.format(listing.price)}/month` : "Price on request")
        );

        link.append(text, element("a", "", "View"));
        return link;
    });

    renderRows("similarListings", rows, "This is your only listing for now.");
}

/* ---------- Helpers ---------- */

function renderRows(id, rows, emptyText) {
    const container = $(id);
    if (!container) return;

    if (!rows.length) {
        container.replaceChildren(element("p", "ll-empty", emptyText));
        return;
    }

    container.replaceChildren(...rows);
}

function detailRow(label, value) {
    return element("li", "", "", null, [
        element("span", "", label),
        element("strong", "", value || "—"),
    ]);
}

function sortImages(list) {
    return [...list].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

function labelise(value) {
    if (!value) return "—";
    return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function element(tag, className = "", text = "", attributes = null, children = []) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    if (attributes) Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (children.length) node.append(...children);
    return node;
}

function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
}