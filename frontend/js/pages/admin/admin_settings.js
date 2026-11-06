import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN SETTINGS (design 15)
   App switches: platform status, security and notifications.
   Only the switches that changed are sent, so the activity log
   records each real change.
   Platform name and support details are edited on Platform Settings.
========================================= */

const SECTIONS = {
    general: {
        platformStatus: { key: "platform_status", type: "select" },
    },
    security: {
        twoFactor: { key: "two_factor_required", type: "toggle" },
        loginAlerts: { key: "login_alerts", type: "toggle" },
        sessionTimeout: { key: "session_timeout_enabled", type: "toggle" },
        forceStrongPasswords: { key: "force_strong_passwords", type: "toggle" },
    },
    notifications: {
        emailNotifications: { key: "email_notifications", type: "toggle" },
        smsNotifications: { key: "sms_notifications", type: "toggle" },
        pushNotifications: { key: "push_notifications", type: "toggle" },
        systemAnnouncements: { key: "system_announcements", type: "toggle" },
    },
};

const DEFAULTS = {
    platform_status: "active",
    two_factor_required: false,
    login_alerts: true,
    session_timeout_enabled: true,
    force_strong_passwords: true,
    email_notifications: true,
    sms_notifications: false,
    push_notifications: false,
    system_announcements: true,
};

const state = {
    values: { ...DEFAULTS },
    section: "general",
};

function $(id) {
    return document.getElementById(id);
}

function allFields() {
    return Object.values(SECTIONS).reduce((all, fields) => ({ ...all, ...fields }), {});
}

/* ---------- Data ---------- */

async function loadSettings() {
    const { data, error } = await supabase.rpc("admin_list_settings");
    if (error) throw error;

    (data ?? []).forEach((row) => {
        if (row.setting_key in DEFAULTS) {
            state.values[row.setting_key] = row.setting_value;
        }
    });
}

function renderFields() {
    Object.entries(allFields()).forEach(([fieldId, field]) => {
        const el = $(fieldId);
        if (!el) return;

        const value = state.values[field.key];
        if (field.type === "toggle") {
            el.checked = value === true;
        } else {
            el.value = value ?? "";
        }
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

function readField(fieldId, field) {
    const el = $(fieldId);
    if (!el) return undefined;
    return field.type === "toggle" ? el.checked : el.value;
}

/* ---------- Saving ---------- */

async function saveSection() {
    const fields = SECTIONS[state.section];
    if (!fields) return;

    const changes = {};
    for (const [fieldId, field] of Object.entries(fields)) {
        const value = readField(fieldId, field);
        if (value === undefined) continue;
        if (value !== state.values[field.key]) changes[field.key] = value;
    }

    if (Object.keys(changes).length === 0) {
        showToast("No changes to save.", { type: "success" });
        return;
    }

    const button = $("saveSettingsBtn");
    if (button) button.disabled = true;

    const { error } = await supabase.rpc("admin_save_settings", { p_values: changes });

    if (button) button.disabled = false;

    if (error) {
        console.error("[admin_settings] save failed:", error);
        showToast(error.message || "The settings could not be saved.", { type: "error" });
        return;
    }

    Object.assign(state.values, changes);
    showToast("Settings saved.", { type: "success" });
}

function resetSection() {
    const fields = SECTIONS[state.section];
    if (!fields) return;

    Object.entries(fields).forEach(([fieldId, field]) => {
        const el = $(fieldId);
        if (!el) return;
        const value = state.values[field.key];
        if (field.type === "toggle") el.checked = value === true;
        else el.value = value ?? "";
    });
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_settings" });

    document.querySelectorAll("[data-section]").forEach((button) => {
        button.addEventListener("click", () => showSection(button.dataset.section));
    });

    $("saveSettingsBtn")?.addEventListener("click", saveSection);
    $("resetSettingsBtn")?.addEventListener("click", resetSection);

    $("backupDatabaseBtn")?.addEventListener("click", () => {
        window.location.href = "admin_backup_restore.htm";
    });
    $("restoreDatabaseBtn")?.addEventListener("click", () => {
        window.location.href = "admin_backup_restore.htm";
    });

    showSection("general");

    loadSettings()
        .then(renderFields)
        .catch((error) => {
            console.error("[admin_settings] could not load settings:", error);
            showToast("Settings could not be loaded.", { type: "error" });
        });
}