import { getTheme, saveTheme } from "../storage.js";
import { updateState } from "../state.js";

const themes = new Set(["azure", "midnight", "emerald", "sunset", "lavender"]);

export function applyTheme(theme, persist = true) {
    const selected = themes.has(theme) ? theme : "azure";
    document.documentElement.dataset.theme = selected;
    updateState("theme", selected);
    if (persist) saveTheme(selected);
}

export function initTheme() {
    applyTheme(getTheme());
    document.addEventListener("change", (event) => {
        const control = event.target.closest("[data-theme-select]");
        if (control) applyTheme(control.value);
    });
}
