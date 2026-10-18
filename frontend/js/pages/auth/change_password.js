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

let dashboardUrl = DASHBOARDS.student;

function showMessage(text, isError = true) {
    message.textContent = text;
    message.classList.toggle("is-success", !isError);
}

function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.classList.toggle("is-busy", busy);
}

async function init() {
    const { success, data: session } = await getCurrentSession();

    if (!success || !session?.user) {
        window.location.replace(LOGIN_PAGES.student);
        return;
    }

    const profile = await getProfile(session.user.id);
    const role = profile.success && profile.data?.role ? profile.data.role : "student";

    dashboardUrl = DASHBOARDS[role] ?? DASHBOARDS.student;
    backLink.href = dashboardUrl;
    cancelLink.href = dashboardUrl;

    form.addEventListener("submit", (event) =>
        onSubmit(event, session.user.email, role)
    );
}

async function onSubmit(event, email, role) {
    event.preventDefault();
    showMessage("");

    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmNewPassword").value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        return showMessage("Please fill in all three fields.");
    }

    if (newPassword.length < MIN_LENGTH) {
        return showMessage(`Your new password must be at least ${MIN_LENGTH} characters.`);
    }

    if (newPassword !== confirmPassword) {
        return showMessage("The new passwords don't match.");
    }

    if (newPassword === currentPassword) {
        return showMessage("Choose a password that's different from your current one.");
    }

    setBusy(true);

    try {
        // Confirm the current password before changing it
        const { error: verifyError } = await supabase.auth.signInWithPassword({
            email,
            password: currentPassword,
        });

        if (verifyError) {
            showMessage("Your current password is incorrect.");
            return;
        }

        const { error } = await supabase.auth.updateUser({ password: newPassword });

        if (error) {
            showMessage(error.message || "We couldn't update your password. Please try again.");
            return;
        }

        // Success: confirm, then go to the dashboard
        showMessage("Your password has been changed. Taking you to your dashboard...", false);
        form.reset();
        setBusy(false);

        setTimeout(() => {
            window.location.replace(DASHBOARDS[role] ?? DASHBOARDS.student);
        }, REDIRECT_DELAY_MS);
    } catch (err) {
        console.error("Change password failed:", err);
        showMessage("Something went wrong. Please try again.");
        setBusy(false);
    }
}

init();