import { initSystemPage } from "./system-pages.js";

export function init403() {
    initSystemPage();

    // Keep "Back to Home" as the main action, and make sure Go Back never leaves the site
    const back = document.querySelector('[data-action="back"]');
    if (back && history.length <= 1) {
        back.textContent = "";
        back.innerHTML = '<i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Go Back';
        back.setAttribute("aria-label", "Go back to the homepage");
    }
}