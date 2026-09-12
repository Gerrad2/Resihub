import { supabase } from "../../api.js";

const destinations = {
    student: "../student/dashboard_student.htm",
    landlord: "../landlord/dashboard_landlord.htm",
    admin: "../admin/admin_dashboard.htm",
};

function message(form, text, isError = false) {
    const target = form.querySelector(".form-message, #signupMessage, #resetMessage");
    if (target) {
        target.textContent = text;
        target.classList.toggle("error", isError);
        target.classList.toggle("success", !isError);
    } else {
        window.alert(text);
    }
}

function passwordIsStrong(password) {
    return typeof password === "string" && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

async function signUp(form, role) {
    const data = new FormData(form);
    const password = String(data.get("password") || "");
    const confirmPassword = String(data.get("confirmPassword") || "");
    const email = String(data.get("email") || "").trim().toLowerCase();
    if (!email || !passwordIsStrong(password)) {
        message(form, "Use an email address and a password with at least 8 characters, including a letter and number.", true);
        return;
    }
    if (password !== confirmPassword) {
        message(form, "The passwords do not match.", true);
        return;
    }
    const profile = {
        role,
        full_name: String(data.get("fullName") || "").trim(),
        phone: String(data.get("phone") || "").trim(),
        gender: String(data.get("gender") || "").trim() || null,
        date_of_birth: String(data.get("dateOfBirth") || "").trim() || null,
        university: String(data.get("university") || "").trim() || null,
        department: String(data.get("department") || "").trim() || null,
        matric_number: String(data.get("matricNumber") || "").trim() || null,
        level: String(data.get("level") || "").trim() || null,
        state: String(data.get("state") || "").trim() || null,
        address: String(data.get("propertyAddress") || "").trim() || null,
        business_name: String(data.get("businessName") || "").trim() || null,
        cac_number: String(data.get("cacNumber") || "").trim() || null,
    };
    const { data: result, error } = await supabase.auth.signUp({ email, password, options: { data: profile } });
    if (error) {
        message(form, error.message, true);
        return;
    }
    if (result.user && result.session) await supabase.from("profiles").upsert({ id: result.user.id, ...profile });
    message(form, "Check your email to confirm your account, then sign in.");
    form.reset();
}

async function signIn(form, expectedRole) {
    const data = new FormData(form);
    const email = String(data.get("email") || form.querySelector("input[type=email]")?.value || "").trim().toLowerCase();
    const password = String(data.get("password") || form.querySelector("input[type=password]")?.value || "");
    const { data: session, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !session.user) {
        message(form, "Email or password is incorrect.", true);
        return;
    }
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
    if (profileError || !profile || profile.role !== expectedRole) {
        await supabase.auth.signOut();
        message(form, "This account does not have access to this sign-in page.", true);
        return;
    }
    window.location.assign(destinations[profile.role]);
}

function initForgotPassword(form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: new URL("reset_password.htm", window.location.href).href });
        message(form, error ? "We could not start the password reset. Please try again." : "If that address is registered, a reset link has been sent.", Boolean(error));
    });
}

function initResetPassword(form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = String(new FormData(form).get("password") || "");
        if (!passwordIsStrong(password)) {
            message(form, "Use at least 8 characters, including a letter and number.", true);
            return;
        }
        const { error } = await supabase.auth.updateUser({ password });
        message(form, error ? "Your password could not be updated." : "Password updated. You can now sign in.", Boolean(error));
        if (!error) form.reset();
    });
}

export function initAuthPage() {
    const pairs = [
        ["studentSignupForm", "student", signUp], ["landlordSignupForm", "landlord", signUp],
        ["studentLoginForm", "student", signIn], ["landlordLoginForm", "landlord", signIn], ["adminLoginForm", "admin", signIn],
    ];
    pairs.forEach(([id, role, handler]) => {
        const form = document.getElementById(id);
        form?.addEventListener("submit", (event) => { event.preventDefault(); handler(form, role); });
    });
    const forgot = document.getElementById("forgotPasswordForm");
    const reset = document.getElementById("resetPasswordForm");
    if (forgot) initForgotPassword(forgot);
    if (reset) initResetPassword(reset);
}
