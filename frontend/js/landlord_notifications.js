import { getCurrentUser, supabase } from "./api.js";
import { showToast } from "./ui/toast.js";

const $ = (id) => document.getElementById(id);

const TYPE = {
    booking: { icon: "fa-calendar-check", className: "n-booking" },
    message: { icon: "fa-comment-dots", className: "n-message" },
    inspection: { icon: "fa-calendar-day", className: "n-inspection" },
    review: { icon: "fa-star", className: "n-review" },
    system: { icon: "fa-gear", className: "n-system" },
    broadcast: { icon: "fa-bullhorn", className: "n-system" },
    account: { icon: "fa-user", className: "n-system" },
};

let notifications = [];

export async function init() {
    const userResult = await getCurrentUser();

    if (!userResult.success || !userResult.data) {
        console.error("[landlord_notifications] No signed-in user.", userResult.error);
        showToast("Please sign in to see your notifications.", { type: "error" });
        render();
        return;
    }

    const user = userResult.data;

    const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, type, link_url, is_read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

    if (error) {
        console.error("[landlord_notifications] Could not load notifications:", error);
        showToast(`Notifications could not be loaded: ${error.message}`, { type: "error" });
    }

    notifications = error ? [] : data ?? [];
    render();

    $("markAllReadBtn")?.addEventListener("click", markAllRead);
}

function render() {
    const list = $("notificationList");
    if (list) {
        list.replaceChildren(...notifications.map((n) => createItem(n)));
    }

    $("emptyNotifications")?.classList.toggle("hidden", notifications.length > 0);
    $("markAllReadBtn")?.classList.toggle(
        "hidden",
        !notifications.some((n) => !n.is_read)
    );

    updateBadge();
}

function createItem(notification) {
    const type = TYPE[notification.type] ?? TYPE.system;
    const link = safeLink(notification.link_url);

    const item = document.createElement(link ? "a" : "div");
    item.className = `n-item${notification.is_read ? "" : " unread"}`;
    if (link) item.href = link;

    const icon = document.createElement("span");
    icon.className = `n-icon ${type.className}`;

    const glyph = document.createElement("i");
    glyph.className = `fa-solid ${type.icon}`;
    glyph.setAttribute("aria-hidden", "true");
    icon.append(glyph);

    const text = document.createElement("div");
    text.className = "n-text";

    const title = document.createElement("strong");
    title.textContent = notification.title;

    const body = document.createElement("p");
    body.textContent = notification.body ?? "";

    text.append(title, body);

    const time = document.createElement("span");
    time.className = "n-time";
    time.textContent = timeAgo(notification.created_at);

    const chevron = document.createElement("i");
    chevron.className = "fa-solid fa-chevron-right n-chevron";
    chevron.setAttribute("aria-hidden", "true");

    item.append(icon, text, time, chevron);
    item.addEventListener("click", () => openNotification(notification));

    return item;
}

async function markRead(id) {
    const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id);

    if (error) {
        console.error("[landlord_notifications] Could not mark as read:", error);
        return false;
    }
    return true;
}

async function openNotification(notification) {
    if (!notification.is_read) {
        if (await markRead(notification.id)) {
            notification.is_read = true;
        }
    }

    const link = safeLink(notification.link_url);
    if (link) {
        window.location.href = link;
        return;
    }

    render();
}

async function markAllRead() {
    const unread = notifications.filter((n) => !n.is_read);
    if (!unread.length) return;

    const button = $("markAllReadBtn");
    button.disabled = true;

    const results = await Promise.all(unread.map((n) => markRead(n.id)));

    results.forEach((ok, index) => {
        if (ok) unread[index].is_read = true;
    });

    button.disabled = false;

    if (results.includes(false)) {
        showToast("Some notifications could not be marked as read.", { type: "error" });
    }

    render();
}

function updateBadge() {
    const badge = $("notificationBadge");
    if (!badge) return;

    const count = notifications.filter((n) => !n.is_read).length;
    badge.textContent = count;
    badge.classList.toggle("hidden", count === 0);
}

/* Only allow links to other ResiHub pages */
function safeLink(link) {
    if (!link) return null;
    return link.startsWith("../") ? link : null;
}

function timeAgo(value) {
    const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}