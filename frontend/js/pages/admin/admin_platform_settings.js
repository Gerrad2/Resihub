import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN PLATFORM SETTINGS
   Site-wide values stored in platform_settings. Each section
   saves only its own fields. Sections without saved values yet
   are marked as coming soon.
========================================= */

/* Field id -> setting key, grouped by section */
const SECTIONS = {
    general: {
        platformName: "platform_name",
        supportEmail: "support_email",
        supportPhone: "support_phone",
        timezone: "timezone",
    },
    email: {
        emailSenderName: "email_sender_name",
        emailSenderAddress: "email_sender_address",
    },
};

const DEFAULTS = {
    platform_name: "ResiHub",
    support_email: "",
    support_phone: "",
    timezone: "Africa/Lagos",
    email_sender_name: "ResiHub",
    email_sender_address: "",
};

const state = {
    values: { ...DEFAULTS },
    section: "general",
};

function $(id) {
    return document.getElementById(id);
}

/* ---------- Data ---------- */

async function loadSettings() {
    const { data, error } = await supabase.rpc("admin_list_settings");
    if (error) throw error;

    (data ?? []).forEach((row) => {
        // jsonb values arrive as parsed JSON; keep strings as strings
        state.values[row.setting_key] = typeof row.setting_value === "string"
            ? row.setting_value
            : row.setting_value ?? "";
    });
}

function renderFields() {
    Object.values(SECTIONS).forEach((fields) => {
        Object.entries(fields).forEach(([fieldId, key]) => {
            const el = $(fieldId);
            if (el) el.value = state.values[key] ?? "";
        });
    });
}

/* ---------- Sections ---------- */

function showSection(name) {
    state.section = name;

    document.querySelectorAll("[data-section]").forEach((button) => {
        const active = button.dataset.section === name;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
    });

    document.querySelectorAll("[data-panel]").forEach((panel) => {
        panel.classList.toggle("hidden", panel.dataset.panel !== name);
    });

    const saveBar = $("settingsSaveBar");
    if (saveBar) saveBar.classList.toggle("hidden", !SECTIONS[name]);
}

/* ---------- Saving ---------- */

async function saveSection() {
    const fields = SECTIONS[state.section];
    if (!fields) return;

    const payload = {};
    for (const [fieldId, key] of Object.entries(fields)) {
        const value = ($(fieldId)?.value ?? "").trim();

        if (key === "platform_name" && !value) {
            showToast("The platform name cannot be empty.", { type: "error" });
            return;
        }
        if ((key === "support_email" || key === "email_sender_address") && value &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            showToast("Enter a valid email address.", { type: "error" });
            return;
        }
        payload[key] = value;
    }

    const button = $("saveSettingsBtn");
    if (button) button.disabled = true;

    const { error } = await supabase.rpc("admin_save_settings", { p_values: payload });

    if (button) button.disabled = false;

    if (error) {
        console.error("[admin_platform_settings] save failed:", error);
        showToast(error.message || "The settings could not be saved.", { type: "error" });
        return;
    }

    Object.assign(state.values, payload);
    showToast("Settings saved.", { type: "success" });
}

function resetSection() {
    const fields = SECTIONS[state.section];
    if (!fields) return;

    Object.entries(fields).forEach(([fieldId, key]) => {
        const el = $(fieldId);
        if (el) el.value = state.values[key] ?? "";
    });
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_platform_settings" });

    document.querySelectorAll("[data-section]").forEach((button) => {
        button.addEventListener("click", () => showSection(button.dataset.section));
    });

    $("saveSettingsBtn")?.addEventListener("click", saveSection);
    $("resetSettingsBtn")?.addEventListener("click", resetSection);

    showSection("general");

    loadSettings()
        .then(renderFields)
        .catch((error) => {
            console.error("[admin_platform_settings] could not load settings:", error);
            showToast("Platform settings could not be loaded.", { type: "error" });
        });
}