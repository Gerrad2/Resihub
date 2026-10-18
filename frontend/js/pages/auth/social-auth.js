import { supabase } from "../../core/api.js";

const ROLE_KEY = "resihub_pending_role";

const PROVIDER_NAMES = {
    google: "Google",
    apple: "Apple",
};

function redirectUrl() {
    return new URL("../general/index.htm", window.location.href).href;
}

function setBusy(button, busy) {
    button.disabled = busy;
    button.classList.toggle("is-busy", busy);
}

function showMessage(form, text) {
    const box = form ? form.querySelector(".form-message") : null;
    if (box) box.textContent = text;
}

async function startOAuth(button) {
    const provider = button.dataset.socialProvider;
    const role = button.dataset.authRole || "student";
    const form = button.closest("form");

    showMessage(form, "");
    setBusy(button, true);

    try {
        // Saved so the account can be given the right role after the provider redirects back
        localStorage.setItem(ROLE_KEY, role);

        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: { redirectTo: redirectUrl() },
        });

        if (error) throw error;
    } catch (err) {
        console.error(`${provider} sign-in failed:`, err);
        localStorage.removeItem(ROLE_KEY);
        showMessage(
            form,
            `We couldn't connect to ${PROVIDER_NAMES[provider] || "that provider"}. Please try again.`
        );
        setBusy(button, false);
    }
}

export function initSocialAuth() {
    document.querySelectorAll("[data-social-provider]").forEach((button) => {
        button.addEventListener("click", () => startOAuth(button));
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSocialAuth, { once: true });
} else {
    initSocialAuth();
}