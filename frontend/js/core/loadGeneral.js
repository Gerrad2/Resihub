import { loadComponents } from "./components.js";
import { initHeaderAuth } from "./header-auth.js";

export async function loadGeneralLayout() {
    const result = await loadComponents([
        { file: "../components/public_header.htm", elementId: "header" },
        { file: "../components/public_footer.htm", elementId: "footer" },
    ]);

    await initHeaderAuth();
    return result;
}