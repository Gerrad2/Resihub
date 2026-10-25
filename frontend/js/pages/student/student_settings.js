import { getCurrentUser, supabase } from "../../api.js";
import { showError } from "../../student_utils.js";
import { showToast } from "../../ui/toast.js";

const $ = (id) => document.getElementById(id);

let me = null;
let existingPrefs = {};

export async function init() {
    $("settingsForm")?.addEventListener("submit", save);

    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;

    if (!me) {
        showError("Please sign in to manage your settings.");
        return;
    }

    const { data, error } = await supabase
        .from("profiles")
        .select("email_notifications, sms_notifications, preferences")
        .eq("id", me.id)
        .maybeSingle();

    if (error) {
        showError("Your settings could not be loaded.");
        return;
    }

    existingPrefs = data?.preferences ?? {};
    fill(data ?? {});
}

function fill(profile) {
    setChecked("emailNotifications", profile.email_notifications ?? true);
    setChecked("smsNotifications", profile.sms_notifications ?? false);

    setChecked("darkMode", (existingPrefs.theme ?? "dark") === "dark");
    setValue("language", existingPrefs.language ?? "en");
    setValue("timezone", existingPrefs.timezone ?? "Africa/Lagos");

    setChecked("prefBooking", existingPrefs.booking ?? true);
    setChecked("prefMessages", existingPrefs.messages ?? true);
    setChecked("prefPromotions", existingPrefs.promotions ?? false);
    setChecked("prefSystem", existingPrefs.system ?? true);
}

async function save(event) {
    event.preventDefault();

    if (!me) return;

    const button = $("saveSettingsBtn");
    button.disabled = true;

    const preferences = {
        ...existingPrefs,
        language: $("language").value,
        timezone: $("timezone").value,
        theme: $("darkMode").checked ? "dark" : "light",
        booking: $("prefBooking").checked,
        messages: $("prefMessages").checked,
        promotions: $("prefPromotions").checked,
        system: $("prefSystem").checked,
    };

    const { error } = await supabase
        .from("profiles")
        .update({
            email_notifications: $("emailNotifications").checked,
            sms_notifications: $("smsNotifications").checked,
            preferences,
        })
        .eq("id", me.id);

    button.disabled = false;

    if (error) {
        showToast("Settings could not be saved. Please try again.", { type: "error" });
        return;
    }

    existingPrefs = preferences;
    showToast("Settings saved.", { type: "success" });
}

function setChecked(id, value) {
    const el = $(id);
    if (el) el.checked = Boolean(value);
}

function setValue(id, value) {
    const el = $(id);
    if (!el) return;
    if ([...el.options].some((option) => option.value === value)) {
        el.value = value;
    }
}