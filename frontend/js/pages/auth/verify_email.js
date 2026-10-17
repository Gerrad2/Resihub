import { supabase } from "../../api.js";

const PENDING_EMAIL_KEY = "resihub:pendingEmail";
const RESEND_SECONDS = 120;
const VERIFY_URL = new URL("verify_email.htm", window.location.href).href;

const DESTINATIONS = {
    student: "../student/dashboard_student.htm",
    landlord: "../landlord/dashboard_landlord.htm",
    admin: "../admin/admin_dashboard.htm",
};

let cooldownTimer = null;
let redirectScheduled = false;

function readPendingEmail() {
    try {
        return (
            sessionStorage.getItem(PENDING_EMAIL_KEY) ||
            localStorage.getItem(PENDING_EMAIL_KEY) ||
            ""
        );
    } catch {
        return "";
    }
}

function clearPendingEmail() {
    try {
        sessionStorage.removeItem(PENDING_EMAIL_KEY);
        localStorage.removeItem(PENDING_EMAIL_KEY);
    } catch {
        /* storage unavailable */
    }
}

function maskEmail(email) {
    const [name, domain] = email.split("@");
    if (!domain) return email;
    return `${name.slice(0, 4)}****@${domain}`;
}

function formatTime(seconds) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
    const rest = String(seconds % 60).padStart(2, "0");
    return `${minutes}:${rest}`;
}

function startCooldown() {
    const button = document.getElementById("resendVerificationBtn");
    const countdown = document.getElementById("resendCountdown");
    const timer = document.getElementById("resendTimer");
    let remaining = RESEND_SECONDS;

    button.disabled = true;
    countdown.hidden = false;
    timer.textContent = formatTime(remaining);

    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
        remaining -= 1;
        timer.textContent = formatTime(remaining);
        if (remaining <= 0) {
            clearInterval(cooldownTimer);
            button.disabled = false;
            countdown.hidden = true;
        }
    }, 1000);
}

function showVerified() {
    document.getElementById("verifyHeading").textContent = "Email Verified";
    document.getElementById("verifyIntro").textContent =
        "Your email address has been confirmed. You can now sign in to your ResiHub account.";
    document.getElementById("resendVerificationBtn").hidden = true;
    document.getElementById("resendCountdown").hidden = true;
    clearPendingEmail();
}

async function continueAfterVerification(user) {
    if (redirectScheduled) return;

    const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (error) throw error;

    const role = profile?.role || user.user_metadata?.role;
    const destination = DESTINATIONS[role];

    if (!destination) return;

    redirectScheduled = true;

    document.getElementById("verifyIntro").textContent =
        "Your email address has been confirmed. Redirecting to your ResiHub account...";

    window.setTimeout(() => {
        window.location.replace(destination);
    }, 1000);
}

async function resend() {
    const email = readPendingEmail();
    const button = document.getElementById("resendVerificationBtn");

    if (!email) {
        window.alert("We could not find your email address. Please sign up again.");
        return;
    }

    button.disabled = true;
    const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: VERIFY_URL },
    });

    if (error) {
        button.disabled = false;
        window.alert("We could not resend the email. Please wait a minute and try again.");
        return;
    }

    document.getElementById("verificationSent").classList.remove("hidden");
    document.getElementById("verificationSent").hidden = false;
    startCooldown();
}

export async function init() {
    const email = readPendingEmail();
    const emailField = document.getElementById("verificationEmail");
    if (emailField && email) emailField.textContent = maskEmail(email);

    document.getElementById("resendVerificationBtn")?.addEventListener("click", resend);

    const handleVerifiedSession = async (session) => {
        const user = session?.user;
        if (!user?.email_confirmed_at) return;

        showVerified();
        await continueAfterVerification(user);
    };

    try {
        const { data } = await supabase.auth.getSession();
        await handleVerifiedSession(data?.session);
    } catch (error) {
        console.error("ResiHub could not check the verification status.", error);
    }

    supabase.auth.onAuthStateChange((_event, session) => {
        handleVerifiedSession(session).catch((error) => {
            console.error("ResiHub could not continue after verification.", error);
        });
    });
}
