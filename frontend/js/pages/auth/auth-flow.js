
import { supabase } from "../../api.js";

/* =========================================
   RESIHUB AUTHENTICATION
========================================= */

const DESTINATIONS = {
    student: "../student/dashboard_student.htm",
    landlord: "../landlord/dashboard_landlord.htm",
    admin: "../admin/admin_dashboard.htm",
};

const EMAIL_REDIRECT_URL =
    "https://resihub-web-vnxe.onrender.com/auth/verify_email.htm";

/* =========================================
   GENERAL HELPERS
========================================= */

function getField(form, name) {
    return (
        form.querySelector(`[name="${name}"]`) ||
        form.querySelector(`#${CSS.escape(name)}`)
    );
}

function getValue(form, name) {
    return getField(form, name)?.value?.trim() ?? "";
}

function getPassword(form, name = "password") {
    return getField(form, name)?.value ?? "";
}

function showMessage(form, message, isError = false) {
    const output =
        form?.querySelector(
            ".form-message, #signupMessage, #resetMessage"
        ) ||
        document.querySelector(
            ".form-message, #signupMessage, #resetMessage"
        );

    if (output) {
        output.textContent = message;
        output.hidden = false;
        output.classList.toggle("error", isError);
        output.classList.toggle("success", !isError);
        output.setAttribute("role", isError ? "alert" : "status");
    } else {
        console[isError ? "error" : "log"](message);
    }
}

function setLoading(form, loading) {
    const button = form.querySelector(
        'button[type="submit"], input[type="submit"]'
    );

    if (!button) return;

    if (loading) {
        button.dataset.originalText =
            button.tagName === "INPUT"
                ? button.value
                : button.textContent;

        button.disabled = true;

        if (button.tagName === "INPUT") {
            button.value = "Please wait...";
        } else {
            button.textContent = "Please wait...";
        }
    } else {
        button.disabled = false;

        const original = button.dataset.originalText;

        if (original !== undefined) {
            if (button.tagName === "INPUT") {
                button.value = original;
            } else {
                button.textContent = original;
            }

            delete button.dataset.originalText;
        }
    }
}

function passwordIsStrong(password) {
    return (
        password.length >= 8 &&
        /[A-Za-z]/.test(password) &&
        /\d/.test(password)
    );
}

function getSupabaseError(error) {
    const message = error?.message || "Something went wrong.";

    if (/invalid login credentials/i.test(message)) {
        return "Incorrect email or password.";
    }

    if (/email not confirmed/i.test(message)) {
        return "Please verify your email before signing in.";
    }

    if (/user already registered/i.test(message)) {
        return "An account with this email already exists.";
    }

    return message;
}

/* =========================================
   PASSWORD VISIBILITY TOGGLES
========================================= */

function initPasswordToggles() {
    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
        if (button.dataset.toggleReady === "true") return;

        button.dataset.toggleReady = "true";
        button.type = "button";

        button.addEventListener("click", () => {
            const targetId = button.dataset.passwordToggle;
            const input = targetId
                ? document.getElementById(targetId)
                : null;

            if (!input) {
                console.warn(
                    `Password toggle could not find input #${targetId}`
                );
                return;
            }

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

            const icon = button.querySelector("i, svg");

            if (icon?.tagName.toLowerCase() === "i") {
                icon.classList.toggle("fa-eye", !showPassword);
                icon.classList.toggle("fa-eye-slash", showPassword);
            }
        });
    });
}

/* =========================================
   PASSWORD STRENGTH METER
========================================= */

function initPasswordStrengthMeter() {
    document
        .querySelectorAll(
            'form[id$="SignupForm"], form[data-auth-type="signup"]'
        )
        .forEach((form) => {
            const passwordInput = getField(form, "password");

            if (!passwordInput || form.dataset.strengthReady === "true") {
                return;
            }

            form.dataset.strengthReady = "true";

            const meter = document.createElement("div");
            meter.className = "password-strength";
            meter.setAttribute("aria-live", "polite");

            const label = document.createElement("small");
            label.className = "password-strength-label";
            label.textContent = "Password strength: not entered";

            const track = document.createElement("div");
            track.className = "password-strength-track";

            const bar = document.createElement("div");
            bar.className = "password-strength-bar";

            track.appendChild(bar);
            meter.append(label, track);

            const wrapper =
                passwordInput.closest(".password-wrapper") ||
                passwordInput.closest(".auth-field") ||
                passwordInput.parentElement;

            wrapper.insertAdjacentElement("afterend", meter);

            passwordInput.addEventListener("input", () => {
                const password = passwordInput.value;
                let score = 0;

                if (password.length >= 8) score++;
                if (/[a-z]/.test(password)) score++;
                if (/[A-Z]/.test(password)) score++;
                if (/\d/.test(password)) score++;
                if (/[^A-Za-z0-9]/.test(password)) score++;

                const levels = [
                    "Not entered",
                    "Very weak",
                    "Weak",
                    "Fair",
                    "Strong",
                    "Very strong",
                ];

                label.textContent = password
                    ? `Password strength: ${levels[score]}`
                    : "Password strength: not entered";

                bar.style.width = `${score * 20}%`;
                bar.dataset.strength = String(score);
            });
        });
}

/* =========================================
   SIGN UP
========================================= */

async function signUp(form, role) {
    const email = getValue(form, "email").toLowerCase();
    const password = getPassword(form, "password");
    const confirmPassword = getPassword(form, "confirmPassword");

    if (!email || !password) {
        showMessage(form, "Please enter your email and password.", true);
        return;
    }

    if (!passwordIsStrong(password)) {
        showMessage(
            form,
            "Use at least 8 characters, including a letter and a number.",
            true
        );
        return;
    }

    if (password !== confirmPassword) {
        showMessage(form, "Your passwords do not match.", true);
        return;
    }

    const profile = {
        role,
        full_name: getValue(form, "fullName"),
        phone: getValue(form, "phone"),
        gender: getValue(form, "gender"),
        date_of_birth: getValue(form, "dateOfBirth"),
        university: getValue(form, "university"),
        department: getValue(form, "department"),
        matric_number: getValue(form, "matricNumber"),
        level: getValue(form, "level"),
        state: getValue(form, "state"),
        property_address: getValue(form, "propertyAddress"),
        business_name: getValue(form, "businessName"),
        cac_number: getValue(form, "cacNumber"),
    };

    // Remove empty values so optional fields are not sent unnecessarily.
    Object.keys(profile).forEach((key) => {
        if (profile[key] === "") {
            delete profile[key];
        }
    });

    // Keep the role, but do not allow an empty role.
    profile.role = role;

    setLoading(form, true);

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: EMAIL_REDIRECT_URL,
                data: profile,
            },
        });

        if (error) throw error;

        if (!data.user) {
            throw new Error("The account could not be created. Please try again.");
        }

        /*
         * If email confirmation is disabled, Supabase may return a session.
         * Only then can this browser safely attempt an authenticated profile
         * insert, provided your profiles table RLS policy allows it.
         *
         * If confirmation is enabled, create the profile using a trusted
         * database trigger on auth.users. See the note below the code.
         */
        if (data.session) {
            const { error: profileError } = await supabase
                .from("profiles")
                .upsert(
                    {
                        id: data.user.id,
                        ...profile,
                    },
                    { onConflict: "id" }
                );

            if (profileError) {
                console.error("Profile save failed:", profileError);
                showMessage(
                    form,
                    "Your account was created, but your profile could not be saved. Please contact support.",
                    true
                );
                return;
            }

            showMessage(
                form,
                "Account created successfully. You can now sign in."
            );
        } else {
            showMessage(
                form,
                "Account created. Check your email to verify your address before signing in."
            );
        }

        form.reset();

        const meter = form.querySelector(".password-strength");
        if (meter) meter.remove();

        form.dataset.strengthReady = "";
        initPasswordStrengthMeter();
    } catch (error) {
        console.error("Signup error:", error);
        showMessage(form, getSupabaseError(error), true);
    } finally {
        setLoading(form, false);
    }
}

/* =========================================
   SIGN IN
========================================= */

async function signIn(form, expectedRole) {
    const email = getValue(form, "email").toLowerCase();
    const password = getPassword(form, "password");

    if (!email || !password) {
        showMessage(form, "Enter your email and password.", true);
        return;
    }

    setLoading(form, true);

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;

        const user = data.user;
        const session = data.session;

        if (!user || !session) {
            throw new Error("Sign-in did not return a valid session.");
        }

        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

        if (profileError) {
            console.error("Profile lookup failed:", profileError);
            throw new Error("Unable to load your profile. Please try again.");
        }

        if (!profile) {
            await supabase.auth.signOut();
            throw new Error(
                "Your profile has not been created yet. Please contact support."
            );
        }

        if (profile.role !== expectedRole) {
            await supabase.auth.signOut();
            throw new Error(
                `This account is not registered as a ${expectedRole}. Please use the correct login page.`
            );
        }

        const destination = DESTINATIONS[profile.role];

        if (!destination) {
            await supabase.auth.signOut();
            throw new Error("Your account has an invalid role.");
        }

        window.location.assign(destination);
    } catch (error) {
        console.error("Login error:", error);
        showMessage(form, getSupabaseError(error), true);
    } finally {
        setLoading(form, false);
    }
}

/* =========================================
   FORGOT PASSWORD
========================================= */

async function requestPasswordReset(form) {
    const email = getValue(form, "email").toLowerCase();

    if (!email) {
        showMessage(form, "Enter your email address.", true);
        return;
    }

    const resetUrl = new URL(
        "reset_password.htm",
        window.location.href
    ).href;

    setLoading(form, true);

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: resetUrl,
        });

        if (error) throw error;

        showMessage(
            form,
            "If an account exists for that email, a password reset link will be sent."
        );
    } catch (error) {
        console.error("Password reset request error:", error);
        showMessage(form, getSupabaseError(error), true);
    } finally {
        setLoading(form, false);
    }
}

/* =========================================
   SET NEW PASSWORD
========================================= */

async function updatePassword(form) {
    const password = getPassword(form, "password");
    const confirmPassword = getPassword(form, "confirmPassword");

    if (!passwordIsStrong(password)) {
        showMessage(
            form,
            "Use at least 8 characters, including a letter and a number.",
            true
        );
        return;
    }

    if (password !== confirmPassword) {
        showMessage(form, "Your passwords do not match.", true);
        return;
    }

    setLoading(form, true);

    try {
        const { error } = await supabase.auth.updateUser({ password });

        if (error) throw error;

        showMessage(
            form,
            "Password updated successfully. You can now sign in with your new password."
        );

        form.reset();
    } catch (error) {
        console.error("Password update error:", error);
        showMessage(
            form,
            "Unable to update your password. Open the reset link from your email again and retry."
            + ` (${getSupabaseError(error)})`,
            true
        );
    } finally {
        setLoading(form, false);
    }
}

/* =========================================
   CONNECT FORM HANDLERS
========================================= */

function attachSubmit(formId, handler) {
    const form = document.getElementById(formId);

    if (!form || form.dataset.authReady === "true") return;

    form.dataset.authReady = "true";

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await handler(form);
    });
}

export function initAuthPage() {
    initPasswordToggles();
    initPasswordStrengthMeter();

    attachSubmit("studentSignupForm", (form) =>
        signUp(form, "student")
    );

    attachSubmit("landlordSignupForm", (form) =>
        signUp(form, "landlord")
    );

    attachSubmit("studentLoginForm", (form) =>
        signIn(form, "student")
    );

    attachSubmit("landlordLoginForm", (form) =>
        signIn(form, "landlord")
    );

    attachSubmit("adminLoginForm", (form) =>
        signIn(form, "admin")
    );

    attachSubmit("forgotPasswordForm", requestPasswordReset);
    attachSubmit("resetPasswordForm", updatePassword);
}

/* Initialize this module when the page is ready. */
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuthPage, {
        once: true,
    });
} else {
    initAuthPage();
}


