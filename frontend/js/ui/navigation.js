import { updateState } from "../state.js";

export function initNavigation() {
    const header = document.querySelector(".main-header");
    const toggle = header?.querySelector(".menu-toggle");
    const menu = header?.querySelector(".main-nav");
    if (!header || !toggle || !menu) return;

    const setOpen = (open) => {
        menu.classList.toggle("active", open);
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        updateState("ui.isNavigationOpen", open);
    };

    const profileButton = header.querySelector(".profile-btn[aria-controls]");
    const profileMenu = profileButton
        ? document.getElementById(profileButton.getAttribute("aria-controls"))
        : null;
    const setProfileOpen = (open) => {
        if (!profileMenu || !profileButton) return;
        profileMenu.classList.toggle("active", open);
        profileButton.setAttribute("aria-expanded", String(open));
    };
    toggle.addEventListener("click", () => setOpen(!menu.classList.contains("active")));
    profileButton?.addEventListener("click", () => {
        setProfileOpen(!profileMenu.classList.contains("active"));
    });
    menu.addEventListener("click", (event) => {
        if (event.target.closest("a")) {
            setOpen(false);
            setProfileOpen(false);
        }
    });
    document.addEventListener("click", (event) => {
        if (!header.contains(event.target)) {
            setOpen(false);
            setProfileOpen(false);
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && menu.classList.contains("active")) {
            setOpen(false);
            setProfileOpen(false);
            toggle.focus();
        }
    });
    const current = location.pathname.split("/").pop()?.toLowerCase();
    menu.querySelectorAll("a[href]").forEach((link) => {
        const page = link.getAttribute("href").split("/").pop()?.toLowerCase();
        const active = page === current;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
    });
    const scroll = () => header.classList.toggle("scrolled", window.scrollY > 12);
    scroll();
    window.addEventListener("scroll", scroll, { passive: true });
}
