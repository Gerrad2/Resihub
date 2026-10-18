import { supabase, getCurrentSession, getProfile } from "../../core/api.js";

const DASHBOARDS = {
    student: "../student/dashboard_student.htm",
    landlord: "../landlord/dashboard_landlord.htm",
};

const LOGIN_PAGES = {
    student: "../auth/student_login.htm",
    landlord: "../auth/landlord_login.htm",
};

const MIN_LENGTH = 8;
const REDIRECT_DELAY_MS = 1500;

const form = document.getElementById("changePasswordForm");
const message = document.getElementById("changeMessage");
const submitBtn = document.getElementById("changeBtn");
const backLink = document.getElementById("backLink");
const cancelLink = document.getElementById("cancelLink");
const currentField = document.getElementById("currentPassword").closest(".auth-field");
const currentInput = document.getElementById("currentPassword");

let mode = "change"; // "change" or "set"

function showMessage(text, isError = true) {
    message.textContent = text;
    message.classList.toggle("is-success", !isError);
}

function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.classList.toggle("is-busy", busy);
}

/* A user has a password only if the email provider is linked to their account.
   Google-only and Apple-only accounts have no password yet. */
function hasPassword(user) {
    const providers = user.app_metadata?.providers ?? [user.app_metadata?.provider];
    return providers.includes("email");
}

function useSetPasswordMode() {
    mode = "set";
    currentField.hidden = true;
    currentInput.required = false;

    document.querySelector(".auth-aside h1").innerHTML = "Set Your<br>Password";
    document.querySelector(".auth-lead").textContent =
        "Your account signs in with Google. Add a password to also sign in with your email address.";
    document.querySelector(".auth-form-title").textContent = "Set a password";
    document.querySelector(".auth-form-copy").textContent =
        "Choose a password you'll use to sign in with your email.";
    submitBtn.innerHTML = '<i class="fa-solid fa-lock" aria-hidden="true"></i> Set Password';
}

async function init() {
    const { success, data: session } = await getCurrentSession();

    if (!success || !session?.user) {
        window.location.replace(LOGIN_PAGES.student);
        return;
    }

    const user = session.user;
    const profile = await getProfile(user.id);
    const role = profile.success && profile.data?.role ? profile.data.role : "student";

    backLink.href = DASHBOARDS[role] ?? DASHBOARDS.student;
    cancelLink.href = DASHBOARDS[role] ?? DASHBOARDS.student;

    if (!hasPassword(user)) {
        useSetPasswordMode();
    }

    form.addEventListener("submit", (event) => onSubmit(event, user, role));
}

async function onSubmit(event, user, role) {
    event.preventDefault();
    showMessage("");

    const currentPassword = currentInput.value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmNewPassword").value;

    if (mode === "change" && !currentPassword) {
        return showMessage("Please enter your current password.");
    }

    if (!newPassword || !confirmPassword) {
        return showMessage("Please fill in the new password fields.");
    }

    if (newPassword.length < MIN_LENGTH) {
        return showMessage(`Your new password must be at least ${MIN_LENGTH} characters.`);
    }

    if (newPassword !== confirmPassword) {
        return showMessage("The new passwords don't match.");
    }

    if (mode === "change" && newPassword === currentPassword) {
        return showMessage("Choose a password that's different from your current one.");
    }

    setBusy(true);

    try {
        // Only accounts that already have a password need to prove it first
        if (mode === "change") {
            const { error: verifyError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: currentPassword,
            });

            if (verifyError) {
                console.error("Current password check failed:", verifyError);
                showMessage(
                    verifyError.message === "Invalid login credentials"
                        ? "Your current password is incorrect."
                        : `We couldn't verify your password: ${verifyError.message}`
                );
                return;
            }
        }

        const { error } = await supabase.auth.updateUser({ password: newPassword });

        if (error) {
            console.error("Password update failed:", error);
            showMessage(error.message || "We couldn't save your password. Please try again.");
            return;
        }

        showMessage(
            mode === "set"
                ? "Password saved. Taking you to your dashboard..."
                : "Your password has been changed. Taking you to your dashboard...",
            false
        );
        form.reset();

        setTimeout(() => {
            window.location.replace(DASHBOARDS[role] ?? DASHBOARDS.student);
        }, REDIRECT_DELAY_MS);
    } catch (err) {
        console.error("Password save failed:", err);
        showMessage("Something went wrong. Please try again.");
    } finally {
        setBusy(false);
    }
}

init();