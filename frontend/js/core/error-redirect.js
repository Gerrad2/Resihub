const LAST_REDIRECT_KEY = "resihub:system-redirect-at";
const COOLDOWN_MS = 15000;

// Harmless browser messages that should not send people to an error page
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i];

export function initErrorRedirect() {
    window.addEventListener("error", (event) => {
        const message = event.message || "";
        if (IGNORED.some((pattern) => pattern.test(message))) return;

        console.error("[system] runtime error:", event.error || message);
        showSystemPage("500", "runtime-error");
    });

    window.addEventListener("unhandledrejection", (event) => {
        const message = String(event.reason?.message ?? event.reason ?? "");
        if (IGNORED.some((pattern) => pattern.test(message))) return;

        console.error("[system] unhandled promise rejection:", event.reason);
        showSystemPage("500", "unhandled-promise");
    });
}

/* Send the person to a system page, e.g. showSystemPage("403", "no-permission") */
export function showSystemPage(page, reason = "") {
    // Never redirect from a system page, so a broken error page cannot loop
    if (location.pathname.includes("/system/")) return;

    // Only redirect once per cooldown period
    const last = Number(sessionStorage.getItem(LAST_REDIRECT_KEY) || 0);
    if (Date.now() - last < COOLDOWN_MS) return;
    sessionStorage.setItem(LAST_REDIRECT_KEY, String(Date.now()));

    const from = encodeURIComponent(location.pathname + location.search);
    location.href = `${systemBase()}system/${page}.htm?from=${from}&reason=${encodeURIComponent(reason)}`;
}

function systemBase() {
    const marker = "/frontend/";
    const index = location.pathname.indexOf(marker);
    return index >= 0 ? location.pathname.slice(0, index + marker.length) : "/";
}