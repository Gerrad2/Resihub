import { loadComponents } from "./components.js";

export async function loadLandlordLayout() {
    return loadComponents([
        {
            file: "../components/landlord_header.htm",
            elementId: "header",
        },

        {
            file: "../components/landlord_footer.htm",
            elementId: "footer",
        },
    ]);
}
