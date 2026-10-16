
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
    auth: "./loadGeneral.js"
};

const methods = {
    admin: "loadAdminLayout",
    general: "loadGeneralLayout",
    landlord: "loadLandlordLayout",
    student: "loadStudentLayout",
    system: "loadGeneralLayout",
    auth: "loadGeneralLayout"
};

function area() {
    const segments = location.pathname
        .replace(/\\/g, "/")
        .toLowerCase()
        .split("/")
        .filter(Boolean);

    const folder = segments.at(-2);

    if (folder && loaders[folder]) {
        return folder;
    }

    // Root-level and unrecognized public pages use
    // the general/public layout.
    return "general";
}

async function loadLayout() {
    const appArea = area();

    const header = document.getElementById("header");
    const footer = document.getElementById("footer");

    if (!header && !footer) {
        console.warn(
            "[ResiHub] Header and footer containers are missing."
        );
        return false;
    }

    const modulePath = loaders[appArea];
    const methodName = methods[appArea];

    try {
        const module = await import(modulePath);
        const loadLayoutMethod = module[methodName];

        if (typeof loadLayoutMethod !== "function") {
            throw new Error(
                `Layout function "${methodName}" was not found.`
            );
        }

        const loaded = await loadLayoutMethod();

        if (!loaded) {
            console.error(
                `[ResiHub] Failed to load the ${appArea} layout.`
            );
            return false;
        }

        document.documentElement.dataset.appArea = appArea;
        return true;

    } catch (error) {
        console.error(
            `[ResiHub] Could not load the ${appArea} layout:`,
            error
        );
        return false;
    }
}
