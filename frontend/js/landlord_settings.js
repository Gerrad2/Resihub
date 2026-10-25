import { getCurrentUser, supabase } from "./api.js";
import { showError } from "./student_utils.js";
import { showToast } from "./ui/toast.js";

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
        .select("email_notifications, sms_notifications, marketing_emails, inspection_notifications, listing_visibility, preferences")
        .eq("id", me.id)
        .maybeSingle();

    if (error) {
        console.error("[landlord_settings] load failed:", error);
        showError("Your settings could not be loaded.");
        return;
    }

    existingPrefs = data?.preferences ?? {};
    fill(data ?? {});
}

function fill(profile) {
    setChecked("emailNotifications", profile.email_notifications ?? true);
    setChecked("smsNotifications", profile.sms_notifications ?? false);
    setChecked("marketingEmails", profile.marketing_emails ?? false);
    setChecked("inspectionNotifications", profile.inspection_notifications ?? true);
    setChecked("listingVisibility", profile.listing_visibility ?? true);

    setChecked("darkMode", (existingPrefs.theme ?? "dark") === "dark");
    setValue("language", existingPrefs.language ?? "en");
    setValue("timezone", existingPrefs.timezone ?? "Africa/Lagos");

    setChecked("prefBooking", existingPrefs.booking ?? true);
    setChecked("prefMessages", existingPrefs.messages ?? true);
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
        currency: "NGN",
        theme: $("darkMode").checked ? "dark" : "light",
        booking: $("prefBooking").checked,
        messages: $("prefMessages").checked,
        system: $("prefSystem").checked,
    };

    const { error } = await supabase
        .from("profiles")
        .update({
            email_notifications: $("emailNotifications").checked,
            sms_notifications: $("smsNotifications").checked,
            marketing_emails: $("marketingEmails").checked,
            inspection_notifications: $("inspectionNotifications").checked,
            listing_visibility: $("listingVisibility").checked,
            preferences,
        })
        .eq("id", me.id);

    button.disabled = false;

    if (error) {
        console.error("[landlord_settings] save failed:", error);
        showToast("Settings could not be saved. Please try again.", { type: "error" });
        return;
    }

    existingPrefs = preferences;
    showToast("Settings saved.", { type: "success" });
}

function setChecked(id, value) {
    const node = $(id);
    if (node) node.checked = Boolean(value);
}

function setValue(id, value) {
    const node = $(id);
    if (!node) return;
    if ([...node.options].some((option) => option.value === value)) {
        node.value = value;
    }
}