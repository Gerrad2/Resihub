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
    const { data: result, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: profile,
            emailRedirectTo: "https://resihub-web-vnxe.onrender.com/auth/verify_email.htm",
        },
    });
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
    initPasswordToggles();
    initPasswordStrengthMeter();
    const pairs = [
        ["studentSignupForm", "student", signUp],
        ["landlordSignupForm", "landlord", signUp],
        ["studentLoginForm", "student", signIn],
        ["landlordLoginForm", "landlord", signIn],
        ["adminLoginForm", "admin", signIn],
    ];

    pairs.forEach(([id, role, handler]) => {
        const form = document.getElementById(id);

        form?.addEventListener("submit", (event) => {
            event.preventDefault();
            handler(form, role);
        });
    });

    const forgot = document.getElementById("forgotPasswordForm");
    const reset = document.getElementById("resetPasswordForm");

    if (forgot) initForgotPassword(forgot);
    if (reset) initResetPassword(reset);
}


/* ==========================================
   ResiHub Auth UI Enhancements
   Safe additions to the existing auth-flow.js
   ========================================== */

function initPasswordToggles() {
    document.querySelectorAll("[data-password-toggle]").forEach(button => {
        if (button.dataset.authToggleReady === "true") return;
        button.dataset.authToggleReady = "true";

        button.addEventListener("click", () => {
            const input = document.getElementById(
                button.dataset.passwordToggle
            );

            if (!input) return;

            const show = input.type === "password";
            input.type = show ? "text" : "password";

            button.setAttribute("aria-pressed", String(show));
            button.setAttribute(
                "aria-label",
                show ? "Hide password" : "Show password"
            );

            const icon = button.querySelector("i");

            if (icon) {
                icon.classList.toggle("fa-eye", !show);
                icon.classList.toggle("fa-eye-slash", show);
            }
        });
    });
}

function initPasswordStrengthMeter() {
    const password = document.getElementById("password");

    if (!password) return;

    const form = password.closest("form");

    if (!form || !/SignupForm/i.test(form.id)) return;

    const field = password.closest(".auth-field, .form-group");

    if (!field || field.querySelector(".auth-strength-meter")) return;

    const meter = document.createElement("div");
    meter.className = "auth-strength-meter";

    const bar = document.createElement("div");
    bar.className = "auth-strength-bar";

    const label = document.createElement("small");
    label.className = "auth-strength-label";
    label.textContent = "Password strength";

    meter.append(bar, label);
    password.insertAdjacentElement("afterend", meter);

    password.addEventListener("input", () => {
        const value = password.value;

        let score = 0;

        if (value.length >= 8) score++;
        if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
        if (/\d/.test(value)) score++;
        if (/[^A-Za-z0-9]/.test(value)) score++;

        const levels = [
            ["Enter a password", "0%", ""],
            ["Weak", "25%", "#ff647c"],
            ["Fair", "50%", "#ffbf47"],
            ["Good", "75%", "#38bdf8"],
            ["Strong", "100%", "#38e6a5"]
        ];

        const result = value
            ? levels[Math.max(1, score)]
            : levels[0];

        label.textContent = result[0];
        bar.style.width = result[1];
        bar.style.background = result[2];
    });
}
document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        if (!input) return;
        input.type = input.type === "password" ? "text" : "password";
        button.setAttribute("aria-pressed", String(input.type === "text"));
    });
});

function initPasswordToggles() {
    document.querySelectorAll("[data-password-toggle]").forEach(button => {
        if (button.dataset.authToggleReady === "true") return;
        button.dataset.authToggleReady = "true";

        button.addEventListener("click", () => {
            const input = document.getElementById(
                button.dataset.passwordToggle
            );

            if (!input) return;

            const showPassword = input.type === "password";

            input.type = showPassword ? "text" : "password";

            button.setAttribute(
                "aria-label",
                showPassword ? "Hide password" : "Show password"
            );

            button.setAttribute(
                "aria-pressed",
                String(showPassword)
            );

            const icon = button.querySelector("i");

            if (icon) {
                icon.classList.toggle("fa-eye", !showPassword);
                icon.classList.toggle("fa-eye-slash", showPassword);
            }
        });
    });
}
