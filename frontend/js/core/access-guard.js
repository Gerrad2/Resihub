import { getCurrentUser, supabase } from "../api.js";
import { showSystemPage } from "./error-redirect.js";

/* Set to false to switch the verification gate off, for example during launch */
const REQUIRE_VERIFICATION = false;

const LOGIN_PAGES = {
    student: "../auth/student_login.htm",
    landlord: "../auth/landlord_login.htm",
    admin: "../auth/admin_login.htm",
};

const VERIFY_PAGE = "../landlord/verify_account.htm";

/* Pages a landlord can open before they are verified */
const UNVERIFIED_LANDLORD_PAGES = [
    "verify_account.htm",
    "landlord_profile.htm",
    "edit_landlord_profile.htm",
    "landlord_settings.htm",
    "support.htm",
];

/* Checks the signed-in person before a portal page is shown.
   requiredRole is "student", "landlord" or "admin". */
export async function guardPage(requiredRole) {
    const userResult = await getCurrentUser();

    if (!userResult.success || !userResult.data) {
        location.href = LOGIN_PAGES[requiredRole] ?? "../auth/student_login.htm";
        return null;
    }

    const user = userResult.data;

    // Read the whole row, so a missing optional column cannot break the check
    const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

    if (error || !profile) {
        console.error("[access] profile could not be read:", error);
        showSystemPage("500", "profile-unreadable");
        return null;
    }

    if ((profile.account_status ?? "active") === "suspended") {
        showSystemPage("account_suspended", "suspended");
        return null;
    }

    if (profile.role !== requiredRole) {
        showSystemPage("access_denied", "wrong-role");
        return null;
    }

    // Landlords must be verified before using the portal, except the pages listed above.
    // If the verification column is missing, the gate is skipped rather than locking everyone out.
    if (
        requiredRole === "landlord" &&
        REQUIRE_VERIFICATION &&
        profile.verification_status !== undefined &&
        profile.verification_status !== "verified"
    ) {
        const page = location.pathname.split("/").pop();
        if (!UNVERIFIED_LANDLORD_PAGES.includes(page)) {
            location.href = VERIFY_PAGE;
            return null;
        }
    }

    return { user, profile };
}

/* For actions that should show a message on the page instead of leaving it */
export function isPermissionError(error) {
    return error?.code === "42501";
}