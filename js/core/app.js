import { initAccessibility } from "../ui/accessibility.js";
import { initAnimations } from "../ui/animations.js";
import { initModal } from "../ui/modal.js";
import { initNavigation } from "../ui/navigation.js";
import { initTheme } from "../ui/theme.js";
import { initPage } from "./page.js";

const loaders = {
    admin: "./loadAdmin.js",
    general: "./loadGeneral.js",
    landlord: "./loadLandlord.js",
    student: "./loadStudent.js",
    system: "./loadGeneral.js",
};

function area() {
    const folder = location.pathname.replace(/\\/g, "/").split("/").filter(Boolean).at(-2);
    return loaders[folder] ? folder : "auth";
}

async function loadLayout() {
    const appArea = area();
    if (!document.getElementById("header") || !loaders[appArea]) return;
    const module = await import(loaders[appArea]);
    const methods = { admin: "loadAdminLayout", general: "loadGeneralLayout", landlord: "loadLandlordLayout", student: "loadStudentLayout", system: "loadGeneralLayout" };
    await module[methods[appArea]]?.();
    document.documentElement.dataset.appArea = appArea;
}

const pageModules = {
    "room_details.htm": "../room_details.js",
    "create_listing.htm": "../create_listing.js",
    "dashboard_landlord.htm": "../dashboard_landlord.js",
    "edit_listing.htm": "../editing_listing.js",
    "edit_landlord_profile.htm": "../landlord_Profile_edit.js",
    "landlord_messages.htm": "../landlord_messages.js",
    "landlord_notifications.htm": "../landlord_notifications.js",
    "landlord_profile.htm": "../landlord_profile.js",
    "landlord_settings.htm": "../landlord_settings.js",
    "listing_details.htm": "../listing_details.js",
    "my_listing.htm": "../my_listing.js",
    "notification.htm": "../notifications.js",
};

async function loadFeatureModule() {
    const page = location.pathname.split("/").pop()?.toLowerCase();
    const modulePath = pageModules[page];
    if (!modulePath) return;

    try {
        await import(modulePath);
    } catch (error) {
        console.error(`ResiHub could not load behavior for ${page}.`, error);
    }
}

async function loadPageModule() {
    const appArea = area();
    const page = location.pathname.split("/").pop()?.replace(/\.htm$/i, "");
    if (!page) return;

    try {
        const module = await import(`../pages/${appArea}/${page}.js`);
        module.init?.();
    } catch (error) {
        console.error(`ResiHub could not load the page module for ${page}.`, error);
    }
}

async function boot() {
    initTheme();
    initAccessibility();
    try { await loadLayout(); } catch (error) { console.error("ResiHub layout failed to load.", error); }
    initNavigation();
    initModal();
    initAnimations();
    initPage();
    await loadPageModule();
    await loadFeatureModule();
    document.dispatchEvent(new CustomEvent("resihub:app-ready"));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
