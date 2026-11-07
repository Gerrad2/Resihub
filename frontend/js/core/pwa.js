const INSTALL_KEY = "resihub:install-dismissed";

export function initPwa() {
    addHeadTags();
    registerServiceWorker();
    setupInstallPrompt();
}

function addHeadTags() {
    addLink("manifest", new URL("../../manifest.webmanifest", import.meta.url).href);
    addLink("apple-touch-icon", new URL("../../assets/images/icon-192.png", import.meta.url).href);
    addMeta("theme-color", "#0b1d4d");
    addMeta("apple-mobile-web-app-capable", "yes");
    addMeta("apple-mobile-web-app-title", "ResiHub");
}

function addLink(rel, href) {
    if (document.querySelector(`link[rel="${rel}"]`)) return;

    const link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    document.head.append(link);
}

function addMeta(name, content) {
    if (document.querySelector(`meta[name="${name}"]`)) return;

    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    document.head.append(meta);
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    const host = location.hostname;
    const secure = location.protocol === "https:" || host === "localhost" || host === "127.0.0.1";
    if (!secure) return;

    navigator.serviceWorker
        .register(new URL("../../sw.js", import.meta.url).href)
        .catch((error) => console.warn("[pwa] service worker not registered:", error));
}

function isInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function setupInstallPrompt() {
    if (isInstalled() || localStorage.getItem(INSTALL_KEY)) return;

    let deferredPrompt = null;

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredPrompt = event;

        showBanner("Install ResiHub on your phone for quick access.", async () => {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            removeBanner();
        });
    });

    window.addEventListener("appinstalled", removeBanner);

    if (isIos()) {
        showBanner("To install ResiHub, tap Share, then Add to Home Screen.", null);
    }
}

function showBanner(message, onInstall) {
    if (document.querySelector(".pwa-install")) return;

    const box = document.createElement("div");
    box.className = "pwa-install";
    box.setAttribute("role", "dialog");

    const text = document.createElement("p");
    text.textContent = message;
    box.append(text);

    if (onInstall) {
        const install = document.createElement("button");
        install.type = "button";
        install.className = "pwa-install-btn";
        install.textContent = "Install";
        install.addEventListener("click", onInstall);
        box.append(install);
    }

    const later = document.createElement("button");
    later.type = "button";
    later.className = "pwa-install-later";
    later.textContent = "Not now";
    later.addEventListener("click", () => {
        localStorage.setItem(INSTALL_KEY, "1");
        removeBanner();
    });
    box.append(later);

    document.body.append(box);
}

function removeBanner() {
    document.querySelector(".pwa-install")?.remove();
}