import { supabase, getCurrentSession, getProfile } from "../../core/api.js";

const DASHBOARDS = {
    student: "../student/dashboard_student.htm",
    landlord: "../landlord/dashboard_landlord.htm",
};

const MIN_LENGTH = 8;

const form = document.getElementById("changePasswordForm");
const message = document.getElementById("changeMessage");
const submitBtn = document.getElementById("changeBtn");
const backLink = document.getElementById("backLink");
const cancelLink = document.getElementById("cancelLink");

function showMessage(text, isError = true) {
    message.textContent = text;
    message.style.color = isError ? "" : "var(--success)";
    message.style.background = isError ? "" : "rgba(127, 240, 192, 0.12)";
    message.style.borderColor = isError ? "" : "rgba(127, 240, 192, 0.35)";
}

function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.classList.toggle("is-busy", busy);
}

async function init() {
    const { success, data: session } = await getCurrentSession();

    if (!success || !session?.user) {
        window.location.replace("student_login.htm");
        return;
    }

    // Send Back and Cancel to the dashboard for this user's role
    const profile = await getProfile(session.user.id);
    const role = profile.success && profile.data?.role ? profile.data.role : "student";
    const dashboard = DASHBOARDS[role] ?? DASHBOARDS.student;
    backLink.href = dashboard;
    cancelLink.href = dashboard;

    form.addEventListener("submit", (event) => onSubmit(event, session.user.email));
}

function showMessage(text, isError = true) {
    message.textContent = text;
    message.classList.toggle("is-success", !isError);
}

async function onSubmit(event, email) {
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
        // Check the current password first
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

        form.reset();
        showMessage("Your password has been changed.", false);
    } catch (err) {
        console.error("Change password failed:", err);
        showMessage("Something went wrong. Please try again.");
    } finally {
        setBusy(false);
    }
}

init();