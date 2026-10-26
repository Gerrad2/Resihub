import { supabase } from "../../api.js";

/* =========================================
   ADMIN LOGIN (auth/admin_login.htm)
   Only accounts with role = "admin" and
   account_status != "suspended" may enter.
========================================= */

const ADMIN_DASHBOARD = "../admin/admin_dashboard.htm";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MESSAGES = {
    missing: "Enter your email address and password.",
    invalidEmail: "Enter a valid email address.",
    badCredentials: "Incorrect email or password.",
    notConfirmed: "Please verify your email before signing in.",
    notAdmin: "This account does not have administrator access.",
    suspended: "This account has been suspended. Please contact support.",
    noProfile: "Your profile could not be found. Please contact support.",
    profileError: "We couldn't load your profile. Please try again.",
    generic: "Something went wrong. Please try again.",
};

class AdminLoginError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = "AdminLoginError";
        this.cause = cause;
    }
}

let isSubmitting = false;

function $(id) {
    return document.getElementById(id);
}

function setMessage(text, isError = true) {
    const box = $("adminMessage");
    if (!box) return;

    box.textContent = text;
    box.hidden = !text;
    box.classList.toggle("error", isError);
    box.classList.toggle("success", !isError);
    box.setAttribute("role", isError ? "alert" : "status");
}

function setSubmitting(button, submitting) {
    if (!button) return;

    isSubmitting = submitting;
    button.disabled = submitting;

    if (submitting) {
        button.dataset.originalHtml = button.innerHTML;
        button.textContent = "Signing in...";
    } else if (button.dataset.originalHtml !== undefined) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
    }
}

function friendlyAuthError(error) {
    const text = error?.message ?? "";

    if (/invalid login credentials/i.test(text)) return MESSAGES.badCredentials;
    if (/email not confirmed/i.test(text)) return MESSAGES.notConfirmed;

    return MESSAGES.generic;
}

async function endSession() {
    try {
        await supabase.auth.signOut({ scope: "local" });
    } catch (error) {
        console.error("Could not end the session:", error);
    }
}

async function fetchAdminProfile(userId) {
    const { data, error } = await supabase
        .from("profiles")
        .select("role, account_status")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
        throw new AdminLoginError(MESSAGES.profileError, error);
    }

    return data;
}

/* If an admin is already signed in, skip the form. */
async function redirectIfAdminSession() {
    try {
        const { data } = await supabase.auth.getSession();
        const user = data?.session?.user;

        if (!user) return;

        const profile = await fetchAdminProfile(user.id).catch(() => null);

        if (profile?.role === "admin" && profile.account_status !== "suspended") {
            window.location.replace(ADMIN_DASHBOARD);
        }
    } catch (error) {
        console.warn("Could not check the existing session:", error);
    }
}

async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) return;

    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const email = $("adminEmail").value.trim().toLowerCase();
    const password = $("AdminPassword").value;

    if (!email || !password) {
        setMessage(MESSAGES.missing);
        return;
    }

    if (!EMAIL_PATTERN.test(email)) {
        setMessage(MESSAGES.invalidEmail);
        $("adminEmail").focus();
        return;
    }

    setMessage("");
    setSubmitting(submitButton, true);

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;

        const user = data?.user;

        if (!user || !data.session) {
            throw new AdminLoginError(MESSAGES.generic);
        }

        let profile;

        try {
            profile = await fetchAdminProfile(user.id);
        } catch (profileError) {
            await endSession();
            throw profileError;
        }

        if (!profile) {
            await endSession();
            throw new AdminLoginError(MESSAGES.noProfile);
        }

        if ((profile.account_status ?? "active") === "suspended") {
            await endSession();
            throw new AdminLoginError(MESSAGES.suspended);
        }

        if (profile.role !== "admin") {
            await endSession();
            throw new AdminLoginError(MESSAGES.notAdmin);
        }

        window.location.replace(ADMIN_DASHBOARD);
    } catch (error) {
        console.error("Admin login failed:", error);

        setMessage(
            error instanceof AdminLoginError
                ? error.message
                : friendlyAuthError(error)
        );

        $("AdminPassword").focus();
    } finally {
        setSubmitting(submitButton, false);
    }
}

function initPasswordToggle() {
    const button = document.querySelector("[data-password-toggle]");
    const input = button ? $(button.dataset.passwordToggle) : null;

    if (!button || !input) return;

    button.addEventListener("click", () => {
        const showing = input.type === "password";

        input.type = showing ? "text" : "password";
        button.setAttribute("aria-label", showing ? "Hide password" : "Show password");
        button.setAttribute("aria-pressed", String(showing));

        const icon = button.querySelector("i");

        if (icon) {
            icon.classList.toggle("fa-eye", !showing);
            icon.classList.toggle("fa-eye-slash", showing);
        }
    });
}

export function initAdminLogin() {
    const form = $("adminLoginForm");

    if (!form || form.dataset.ready === "true") return;

    form.dataset.ready = "true";
    form.addEventListener("submit", handleSubmit);
    form.addEventListener("input", () => setMessage(""));

    initPasswordToggle();
    redirectIfAdminSession();
}