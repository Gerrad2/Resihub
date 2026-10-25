import { signOut } from "../api.js";

/* Shared script for every system page.
   Fills in the reference code and the requested address, and handles the buttons. */
export function initSystemPage() {
    const params = new URLSearchParams(location.search);

    setAll("[data-reference]", params.get("ref") || makeReference());

    const from = params.get("from");
    setAll("[data-from]", from ? decodeURIComponent(from) : "Not available");

    const expected = params.get("expected");
    if (expected) {
        setAll("[data-expected]", expected);
    }

    document.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", () => runAction(button.dataset.action));
    });
}

async function runAction(action) {
    if (action === "back") {
        if (history.length > 1) {
            history.back();
        } else {
            location.href = "../general/index.htm";
        }
        return;
    }

    if (action === "reload") {
        location.reload();
        return;
    }

    if (action === "signout") {
        try {
            await signOut();
        } catch (error) {
            console.error("[system] sign out failed:", error);
        }
        location.href = "../auth/student_login.htm";
    }
}

function setAll(selector, text) {
    document.querySelectorAll(selector).forEach((node) => {
        node.textContent = text;
    });
}

function makeReference() {
    return Math.random().toString(36).slice(2, 10).toUpperCase();
}