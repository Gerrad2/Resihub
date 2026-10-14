import { setReducedMotion } from "../state.js";

export function initAccessibility() {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
        document.documentElement.dataset.reducedMotion = String(query.matches);
        setReducedMotion(query.matches);
    };
    sync();
    query.addEventListener?.("change", sync);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Tab") document.body.classList.add("keyboard-navigation");
    });
    document.addEventListener("pointerdown", () => document.body.classList.remove("keyboard-navigation"));
}
