import { getPublicProfile, supabase } from "../../api.js";
import { renderListingCards } from "../../listings.js";
import { showToast } from "../../ui/toast.js";
import { trustBadge, unverifiedNotice } from "../../core/verification.js";

const $ = (id) => document.getElementById(id);
const DEFAULT_AVATAR = "../assets/images/default-avatar.png";

export async function init() {
    const id = new URLSearchParams(location.search).get("id");

    if (!id) {
        showProblem("No landlord was selected.");
        return;
    }

    const [profileResult, listingResult] = await Promise.all([
        getPublicProfile(id),
        supabase
            .from("listings")
            .select("*, listing_images(image_url, display_order)")
            .eq("landlord_id", id)
            .eq("publication_status", "published")
            .eq("availability_status", "available")
            .order("created_at", { ascending: false })
            .limit(12),
    ]);

    if (!profileResult.success || !profileResult.data) {
        showProblem("This landlord profile could not be found.");
        return;
    }

    const profile = profileResult.data;
    const name = profile.business_name || profile.full_name || "ResiHub landlord";

    document.title = `${name} | ResiHub`;
    setText("landlordName", name);
    setText("landlordNote", "Landlord on ResiHub");
    $("landlordAvatar").src = profile.avatar_url || DEFAULT_AVATAR;
    $("landlordNote")?.replaceWith(trustBadge(profile.verification_status));

    const notice = unverifiedNotice(profile.verification_status);
    if (notice) $("landlordListings")?.before(notice);

    if (listingResult.error) {
        showToast("Rooms could not be loaded right now.", { type: "error" });
    }

    const listings = listingResult.error ? [] : listingResult.data ?? [];

    setText("listingCount", listings.length);
    renderListingCards($("landlordListings"), listings);
    $("noListings")?.classList.toggle("hidden", listings.length > 0);
}

function showProblem(message) {
    setText("landlordName", "Landlord");
    setText("landlordNote", message);
    setText("listingCount", 0);
    $("noListings")?.classList.add("hidden");
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}