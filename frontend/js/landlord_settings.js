// js/landlord_settings.js

import {
    getCurrentUser
} from "./core/api.js";

import {
    initTheme
} from "./ui/theme.js";

import {
    showToast
} from "./ui/toast.js";


/*
 * ResiHub Landlord Settings
 *
 * These settings are currently stored locally.
 * Authentication is handled through Supabase.
 */


const STORAGE_PREFIX = "resihub:landlord-settings";


/*
 * DOM Elements
 */

const form = document.getElementById("settingsForm");

const emailNotifications =
    document.getElementById("marketingEmails");

const smsNotifications =
    document.getElementById("inspectionNotifications");

const darkMode =
    document.getElementById("listingVisibility");

const saveButton =
    document.getElementById("saveSettingsBtn");


let currentUser = null;


/*
 * Build user-specific storage key
 */

function getStorageKey(userId) {
    return `${STORAGE_PREFIX}:${userId}`;
}


/*
 * Load Settings
 */

function loadSettings(userId) {
    try {
        const stored =
            localStorage.getItem(
                getStorageKey(userId)
            );

        if (!stored) {
            return {
                emailNotifications: true,
                smsNotifications: true,
                darkMode: false
            };
        }

        return {
            emailNotifications: true,
            smsNotifications: true,
            darkMode: false,
            ...JSON.parse(stored)
        };

    } catch (error) {

        console.error(
            "[ResiHub Settings] Unable to load settings:",
            error
        );

        return {
            emailNotifications: true,
            smsNotifications: true,
            darkMode: false
        };
    }
}


/*
 * Save Settings
 */

function saveSettings(userId, settings) {
    localStorage.setItem(
        getStorageKey(userId),
        JSON.stringify(settings)
    );
}


/*
 * Apply Settings to UI
 */

function applySettings(settings) {

    if (emailNotifications) {
        emailNotifications.checked =
            settings.emailNotifications;
    }

    if (smsNotifications) {
        smsNotifications.checked =
            settings.smsNotifications;
    }

    if (darkMode) {
        darkMode.checked =
            settings.darkMode;
    }

    /*
     * Sync Dark Mode with the existing
     * ResiHub theme system.
     */

    if (darkMode) {

        const theme =
            settings.darkMode
                ? "dark"
                : "azure";

        try {
            initTheme(theme);
        } catch (error) {
            console.warn(
                "[ResiHub Settings] Theme could not be applied:",
                error
            );
        }
    }
}


/*
 * Handle Form Submission
 */

async function handleSubmit(event) {

    event.preventDefault();

    if (!currentUser) {
        return;
    }

    const settings = {

        emailNotifications:
            emailNotifications?.checked ?? true,

        smsNotifications:
            smsNotifications?.checked ?? true,

        darkMode:
            darkMode?.checked ?? false
    };


    saveSettings(
        currentUser.id,
        settings
    );


    /*
     * Apply theme immediately.
     */

    if (darkMode) {

        try {

            const theme =
                darkMode.checked
                    ? "dark"
                    : "azure";

            initTheme(theme);

        } catch (error) {

            console.warn(
                "[ResiHub Settings] Theme update failed:",
                error
            );
        }
    }


    /*
     * Button feedback
     */

    if (saveButton) {

        const originalHTML =
            saveButton.innerHTML;

        saveButton.disabled = true;

        saveButton.innerHTML =
            '<i class="fa-solid fa-check"></i> Saved';

        setTimeout(() => {

            saveButton.disabled = false;

            saveButton.innerHTML =
                originalHTML;

        }, 1500);
    }


    showToast(
        "Settings saved successfully.",
        {
            type: "success"
        }
    );
}


/*
 * Initialize
 */

async function init() {

    if (!form) {
        console.warn(
            "[ResiHub Settings] Settings form not found."
        );

        return;
    }


    /*
     * Get authenticated user
     */

    const result =
        await getCurrentUser();


    if (
        !result.success ||
        !result.data
    ) {

        window.location.href =
            "../auth/landlord_login.htm";

        return;
    }


    currentUser =
        result.data;


    /*
     * Load saved preferences
     */

    const settings =
        loadSettings(
            currentUser.id
        );


    /*
     * Apply saved preferences
     */

    applySettings(settings);


    /*
     * Form submission
     */

    form.addEventListener(
        "submit",
        handleSubmit
    );
}


/*
 * Start
 */

init();