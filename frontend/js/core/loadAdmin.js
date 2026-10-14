import { loadComponents } from "./components.js";


/**
 * Load the admin application layout.
 */
export async function loadAdminLayout() {
    return loadComponents([
        {
            file: "../components/admin_header.htm",
            elementId: "header",
        },

        {
            file: "../components/admin_footer.htm",
            elementId: "footer",
        },
    ]);
}
