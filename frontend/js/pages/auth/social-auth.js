import { supabase } from "../../core/api.js";

/* =========================================
   SOCIAL SIGN-IN (Google and Apple)
   Used by student and landlord login and
   signup pages. Admin has no social sign-in.
========================================= */

const PENDING_ROLE_KEY = "resihub_pending_role";
const ROLES = ["student", "landlord"];

const DASHBOARD_PAGES = {
    student: "../student/dashboard_student.htm",
    landlord: "../landlord/dashboard_landlord.htm",
};

const MESSAGES = {
    cancelled: "Sign-in was cancelled. You can try again whenever you're ready.",
    role_mismatch: "This account is registered with a different role. Please use the correct sign-in page.",
    landlord_claim_failed: "We couldn't switch this account to a landlord account. Please sign up with email instead.",
    setup_failed: "We couldn't finish setting up your account. Please try again.",
    provider_failed: "We couldn't connect to that provider. Please try again.",
};

/* ---------- Helpers ---------- */

function dashboardUrl(role) {
    return new URL(DASHBOARD_PAGES[role], window.location.href).href;
}

function loginPageFor(role) {
    return new URL(`../auth/${role}_login.htm`, window.location.href).href;
}

function showMessage(text) {
    const box = document.querySelector(".form-message");

    if (box) {
        box.textContent = text;
        box.hidden = !text;
        box.setAttribute("role", "alert");
    }
}

function setBusy(button, busy) {
    button.disabled = busy;
    button.classList.toggle("is-busy", busy);
}

function redirectToLogin(role, reason) {
    const url = new URL(loginPageFor(role));
    url.searchParams.set("social_error", reason);
    window.location.replace(url.href);
}

/* ---------- Step 1: the user clicks a social button ---------- */

async function startOAuth(button) {
    const provider = button.dataset.socialProvider;
    const role = ROLES.includes(button.dataset.authRole)
        ? button.dataset.authRole
        : "student";

    showMessage("");
    setBusy(button, true);

    try {
        sessionStorage.setItem(PENDING_ROLE_KEY, role);

        // Return to this same page so the role check runs here.
        const returnUrl = new URL(window.location.pathname, window.location.origin).href;

        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: { redirectTo: returnUrl },
        });

        if (error) throw error;
    } catch (err) {
        console.error(`${provider} sign-in failed:`, err);
        sessionStorage.removeItem(PENDING_ROLE_KEY);
        showMessage(MESSAGES.provider_failed);
        setBusy(button, false);
    }
}

/* ---------- Step 2: the user comes back to this page ---------- */

async function completeSocialSignIn() {
    const url = new URL(window.location.href);
    const providerError = url.searchParams.get("error");
    const pageError = url.searchParams.get("social_error");

    if (providerError || pageError) {
        ["error", "error_code", "error_description", "social_error"].forEach((key) =>
            url.searchParams.delete(key)
        );
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }

    if (pageError) {
        showMessage(MESSAGES[pageError] || MESSAGES.setup_failed);
        return;
    }

    if (providerError) {
        sessionStorage.removeItem(PENDING_ROLE_KEY);
        showMessage(MESSAGES.cancelled);
        return;
    }

    const pendingRole = sessionStorage.getItem(PENDING_ROLE_KEY);

    if (!pendingRole) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    sessionStorage.removeItem(PENDING_ROLE_KEY);

    if (!user) return;

    try {
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

        if (profileError) throw profileError;

        // The database creates a profile for every new account, so this is a real failure.
        if (!profile) throw new Error("Profile was not created for this account.");

        let role = profile.role;

        // A brand-new social account starts as a student. Switch it once if the page is landlord.
        if (role === "student" && pendingRole === "landlord") {
            const { error: claimError } = await supabase.rpc("resihub_claim_landlord_role");

            if (claimError) {
                console.error("Landlord claim failed:", claimError);
                await supabase.auth.signOut({ scope: "local" });
                redirectToLogin(pendingRole, "landlord_claim_failed");
                return;
            }

            role = "landlord";
        }

        if (role !== pendingRole) {
            await supabase.auth.signOut({ scope: "local" });
            redirectToLogin(pendingRole, "role_mismatch");
            return;
        }

        window.location.replace(dashboardUrl(role));
    } catch (err) {
        console.error("Social sign-in profile setup failed:", err);
        await supabase.auth.signOut({ scope: "local" });
        redirectToLogin(pendingRole, "setup_failed");
    }
}

/* ---------- Boot ---------- */

export function bindSocialButtons() {
    document.querySelectorAll("[data-social-provider]").forEach((button) => {
        button.addEventListener("click", () => startOAuth(button));
    });
}

function boot() {
    bindSocialButtons();
    completeSocialSignIn();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
    boot();
}