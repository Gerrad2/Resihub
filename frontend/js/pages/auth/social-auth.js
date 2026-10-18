import { supabase, getProfile } from "../../core/api.js";

const PENDING_ROLE_KEY = "resihub_pending_role";
const ROLES = ["student", "landlord"];

// Adjust these paths to your actual dashboard files
const DASHBOARD_PAGES = {
    student: "../student/dashboard_student.htm",
    landlord: "../landlord/dashboard_landlord.htm",
};

const MESSAGES = {
    cancelled: "Sign-in was cancelled. You can try again whenever you're ready.",
    role_mismatch: "This account is registered with a different role. Please use the correct sign-in page.",
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
    if (box) box.textContent = text;
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

/* ---------- Step 1: user clicks a social button ---------- */

async function startOAuth(button) {
    const provider = button.dataset.socialProvider;
    const role = ROLES.includes(button.dataset.authRole)
        ? button.dataset.authRole
        : "student";

    showMessage("");
    setBusy(button, true);

    try {
        sessionStorage.setItem(PENDING_ROLE_KEY, role);

        // Send the user straight to their dashboard after the provider returns
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: { redirectTo: dashboardUrl(role) },
        });

        if (error) throw error;
    } catch (err) {
        console.error(`${provider} sign-in failed:`, err);
        sessionStorage.removeItem(PENDING_ROLE_KEY);
        showMessage(MESSAGES.provider_failed);
        setBusy(button, false);
    }
}

/* ---------- Step 2: user returns on the dashboard ---------- */

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

    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) return;

    sessionStorage.removeItem(PENDING_ROLE_KEY);
    const userId = session.user.id;

    try {
        const { success, data: profile, error } = await getProfile(userId);
        if (!success) throw error;

        if (profile) {
            // Existing account: it must match the page the user signed in from
            if (profile.role !== pendingRole) {
                await supabase.auth.signOut({ scope: "local" });
                redirectToLogin(profile.role, "role_mismatch");
            }
            // Matching role: already on the right dashboard, nothing more to do
            return;
        }

        // New account: create the profile with the chosen role
        const { error: insertError } = await supabase
            .from("profiles")
            .insert({ id: userId, role: pendingRole });

        if (insertError) throw insertError;
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