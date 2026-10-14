// js/landlord_notifications.js
// NOTE: If your HTML currently uses ../js/notifications.js,
// either rename this file to notifications.js or change the HTML script path.

import {
    getCurrentUser,
    getNotifications,
    markNotificationRead,
    supabase
} from "./core/api.js";

import { showToast } from "./ui/toast.js";

let currentUser = null;
let notifications = [];

const list = document.getElementById("notificationList");
const empty = document.getElementById("emptyNotifications");
const markAll = document.getElementById("markAllReadBtn");

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return new Intl.DateTimeFormat("en-NG", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}

async function init() {
    const result = await getCurrentUser();

    if (!result.success || !result.data) {
        window.location.href = "../auth/landlord_login.htm";
        return;
    }

    currentUser = result.data;

    await load();

    markAll?.addEventListener(
        "click",
        markAllAsRead
    );
}

async function load() {
    const result =
        await getNotifications(currentUser.id);

    if (!result.success) {
        showToast("Unable to load notifications.", {
            type: "error"
        });
        return;
    }

    notifications = result.data;

    render();
}

function render() {
    if (!list) return;

    if (!notifications.length) {
        list.innerHTML = "";
        empty?.classList.remove("hidden");
        return;
    }

    empty?.classList.add("hidden");

    list.innerHTML = notifications.map(notification => `
        <article
            class="notification-item ${notification.is_read ? "read" : "unread"}"
            data-id="${notification.id}"
        >
            <div class="notification-icon">
                <i class="fa-solid fa-bell"></i>
            </div>

            <div class="notification-content">
                <h3>${escapeHtml(notification.title)}</h3>
                <p>${escapeHtml(notification.message)}</p>
                <small>${formatDate(notification.created_at)}</small>
            </div>

            ${!notification.is_read
            ? `
                        <button
                            type="button"
                            class="notification-read-btn"
                            data-read="${notification.id}"
                        >
                            Mark read
                        </button>
                    `
            : ""
        }
        </article>
    `).join("");

    list.querySelectorAll("[data-read]").forEach(button => {
        button.addEventListener("click", async () => {
            const result =
                await markNotificationRead(button.dataset.read);

            if (!result.success) {
                showToast("Could not mark notification as read.", {
                    type: "error"
                });
                return;
            }

            await load();
        });
    });
}

async function markAllAsRead() {
    if (!currentUser) return;

    markAll.disabled = true;

    const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", currentUser.id)
        .eq("is_read", false);

    markAll.disabled = false;

    if (error) {
        showToast("Unable to mark notifications as read.", {
            type: "error"
        });
        return;
    }

    showToast("All notifications marked as read.", {
        type: "success"
    });

    await load();
}

init();