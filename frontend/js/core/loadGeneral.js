import { loadComponents } from "./components.js";

export async function loadGeneralLayout() {
    return loadComponents([
        {
            file: "../components/public_header.htm",
            elementId: "header",
        },

        {
            file: "../components/public_footer.htm",
            elementId: "footer",
        },
    ]);
}
