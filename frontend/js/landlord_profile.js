import { getCurrentUser, getProfile, supabase } from "./api.js";
import { showError } from "./student_utils.js";
import { trustBadge } from "./core/verification.js";

const $ = (id) => document.getElementById(id);
const DEFAULT_AVATAR = "../assets/images/default-avatar.png";

export async function init() {
    const userResult = await getCurrentUser();
    const user = userResult.success ? userResult.data : null;

    if (!user) {
        showError("Please sign in to view your profile.");
        return;
    }

    const [profileResult, stats] = await Promise.all([
        getProfile(user.id),
        loadStats(user.id),
    ]);

    if (!profileResult.success || !profileResult.data) {
        showError("Your profile could not be loaded.");
        return;
    }

    renderProfile(profileResult.data, user);
    const { data: details } = await supabase
        .from("verification_details")
        .select("nin")
        .eq("landlord_id", user.id)
        .maybeSingle();

    const masked = details?.nin ? `***********${details.nin.slice(-3)}` : "Not added";
    const ninNode = document.getElementById("ninDisplay");
    if (ninNode) ninNode.textContent = masked;
    renderStats(stats);
}

function renderProfile(profile, user) {
    $("landlordAvatar")?.setAttribute("src", profile.avatar_url || DEFAULT_AVATAR);

    setText("landlordName", profile.business_name || profile.full_name || "Landlord");
    setText("businessNameDisplay", profile.full_name ? `Managed by ${profile.full_name}` : "Landlord on ResiHub");

    // A CAC number on file marks the landlord as registered
    const badgeText = {
        verified: "Verified Landlord",
        pending: "Verification pending",
        rejected: "Verification not approved",
    }[profile.verification_status] ?? "Landlord";

    const badge = $("verifiedBadge");
    if (badge) badge.replaceWith(trustBadge(profile.verification_status));
    setText("businessName", orDash(profile.business_name));
    setText("businessDescription", orDash(profile.business_description));
    setText("cacNumber", orDash(profile.cac_number));

    setText("fullName", orDash(profile.full_name));
    setText("email", user.email || "—");
    setText("emailStatus", user.email_confirmed_at ? "Verified" : "Not verified");
    setText("phone", orDash(profile.phone));
    setText("phoneStatus", profile.phone ? "Added" : "Not added");
    setText("gender", orDash(profile.gender));
    setText("dateOfBirth", formatDate(profile.date_of_birth));
    setText("state", orDash(profile.state));
    setText("memberSince", memberYear(profile.created_at || user.created_at));
}

/* Listings, bookings and average review rating for this landlord */
async function loadStats(userId) {
    const [listings, bookings, reviews] = await Promise.all([
        supabase
            .from("listings")
            .select("id", { count: "exact", head: true })
            .eq("landlord_id", userId),

        supabase
            .from("booking_requests")
            .select("id", { count: "exact", head: true })
            .eq("landlord_id", userId),

        supabase
            .from("reviews")
            .select("rating, listings!inner(landlord_id)")
            .eq("listings.landlord_id", userId),
    ]);

    const ratings = reviews.data ?? [];
    const average = ratings.length
        ? ratings.reduce((sum, row) => sum + row.rating, 0) / ratings.length
        : null;

    return {
        listings: listings.error ? null : listings.count ?? 0,
        bookings: bookings.error ? null : bookings.count ?? 0,
        rating: average,
    };
}

function renderStats(stats) {
    setText("profileListings", stats.listings ?? "—");
    setText("profileBookings", stats.bookings ?? "—");
    setText("profileRating", stats.rating != null ? stats.rating.toFixed(1) : "—");
}

function orDash(value) {
    return value && String(value).trim() ? value : "—";
}

function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

function memberYear(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : String(date.getFullYear());
}

function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
}