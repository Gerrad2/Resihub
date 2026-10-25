import { getCurrentUser, getProfile, getFavorites, getStudentBookings, supabase } from "../../api.js";
import { showError } from "../../student_utils.js";

const $ = (id) => document.getElementById(id);
const DEFAULT_AVATAR = "../assets/images/default-avatar.png";

export async function init() {
    const userResult = await getCurrentUser();
    const user = userResult.success ? userResult.data : null;

    if (!user) {
        showError("Please sign in to view your profile.");
        return;
    }

    const [profileResult, favoritesResult, bookingsResult, reviewCount] = await Promise.all([
        getProfile(user.id),
        getFavorites(user.id),
        getStudentBookings(user.id),
        countReviews(user.id),
    ]);

    if (!profileResult.success || !profileResult.data) {
        showError("Your profile could not be loaded.");
        return;
    }

    renderProfile(profileResult.data, user);

    setText("savedCount", favoritesResult.success ? favoritesResult.data.length : "—");
    setText(
        "activeBookingCount",
        bookingsResult.success ? bookingsResult.data.filter((b) => b.status === "approved").length : "—"
    );
    setText("reviewCount", reviewCount ?? "—");
}

function renderProfile(profile, user) {
    const avatar = profile.avatar_url || DEFAULT_AVATAR;
    $("studentAvatar")?.setAttribute("src", avatar);

    setText("studentName", profile.full_name || "Student");
    setText("studentUniversity", profile.university || "University not set");

    setText("fullName", orDash(profile.full_name));
    setText("email", user.email || "—");
    setText("emailStatus", user.email_confirmed_at ? "Verified" : "Not verified");
    setText("phone", orDash(profile.phone));
    setText("phoneStatus", profile.phone ? "Added" : "Not added");
    setText("gender", orDash(profile.gender));
    setText("dateOfBirth", formatDate(profile.date_of_birth));
    setText("state", orDash(profile.state));
    setText("memberSince", memberYear(profile.created_at || user.created_at));

    setText("university", orDash(profile.university));
    setText("faculty", orDash(profile.faculty));
    setText("department", orDash(profile.department));
    setText("level", profile.level ? `${profile.level} Level` : "—");
    setText("matricNumber", orDash(profile.matric_number));

    setText("emergencyName", orDash(profile.emergency_name));
    setText("emergencyRelationship", orDash(profile.emergency_relationship));
    setText("emergencyPhone", orDash(profile.emergency_phone));
}

/* Reviews this student has written. Returns null if the query fails. */
async function countReviews(userId) {
    const { count, error } = await supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("student_id", userId);

    return error ? null : count ?? 0;
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
    const el = $(id);
    if (el) el.textContent = value;
}