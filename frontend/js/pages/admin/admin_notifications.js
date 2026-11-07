import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";
import { watchTables } from "../../core/realtime.js";


/* =========================================
   ADMIN NOTIFICATIONS
   The signed-in admin's own notifications (design 10).
   Read state is changed with mark_notifications_read.
========================================= */

const PAGE_SIZE = 10;

const TYPE_LABEL = {
    booking: "Booking",
    message: "Message",
    review: "Review",
    account: "Account",
};

const shortDate = new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

const state = {
    items: [],
    userId: null,
    tab: "all",
    status: "",
    search: "",
    page: 1,
};

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

/* ---------- Data ---------- */

async function loadNotifications() {
    const { data: userData } = await supabase.auth.getUser();
    state.userId = userData?.user?.id ?? null;
    if (!state.userId) throw new Error("Not signed in");

    const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, type, link_url, is_read, created_at")
        .eq("user_id", state.userId)
        .order("created_at", { ascending: false })
        .limit(300);

    if (error) throw error;
    state.items = data ?? [];
}

function renderHeader() {
    const unread = state.items.filter((item) => !item.is_read).length;
    setText("totalNotifications", `${state.items.length} notifications`);
    setText("unreadCount", unread);

    const markAll = $("markAllReadBtn");
    if (markAll) markAll.disabled = unread === 0;
}

/* ---------- Filtering ---------- */

function filteredItems() {
    return state.items.filter((item) => {
        if (state.tab === "unread" && item.is_read) return false;
        if (state.tab !== "all" && state.tab !== "unread" && item.type !== state.tab) return false;

        if (state.status === "unread" && item.is_read) return false;
        if (state.status === "read" && !item.is_read) return false;

        if (state.search) {
            const haystack = [item.title, item.body].filter(Boolean).join(" ").toLowerCase();
            if (!haystack.includes(state.search)) return false;
        }
        return true;
    });
}

/* ---------- Table ---------- */

function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
}

function titleCell(item) {
    const td = document.createElement("td");
    const title = document.createElement("strong");
    title.textContent = item.title || "Notification";
    const body = document.createElement("span");
    body.className = "admin-notif-body";
    body.textContent = item.body || "";
    td.append(title, body);
    return td;
}

function typeCell(item) {
    const td = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `status-badge notif-type notif-type-${item.type || "account"}`;
    badge.textContent = TYPE_LABEL[item.type] ?? "General";
    td.append(badge);
    return td;
}

function statusCell(item) {
    const td = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `status-badge ${item.is_read ? "active" : "pending"}`;
    badge.textContent = item.is_read ? "Read" : "Unread";
    td.append(badge);
    return td;
}

function iconButton(icon, label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-btn";
    button.dataset.action = action;
    button.setAttribute("aria-label", label);
    button.title = label;

    const glyph = document.createElement("i");
    glyph.className = `fa-solid ${icon}`;
    button.append(glyph);
    return button;
}

function actionsCell(item) {
    const td = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "admin-actions";

    if (item.link_url) {
        wrap.append(iconButton("fa-arrow-up-right-from-square", "Open", "open"));
    }
    if (!item.is_read) {
        wrap.append(iconButton("fa-check", "Mark as read", "read"));
    }

    td.append(wrap);
    return td;
}

function createRow(item) {
    const row = document.createElement("tr");
    row.dataset.notificationId = item.id;
    if (!item.is_read) row.classList.add("notif-unread");

    const date = item.created_at ? shortDate.format(new Date(item.created_at)) : "—";

    row.append(titleCell(item), typeCell(item), cell(date), statusCell(item), actionsCell(item));
    return row;
}

function renderTable() {
    const body = $("notificationHistory");
    const empty = $("noNotificationsFound");
    if (!body) return;

    const rows = filteredItems();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);

    const start = (state.page - 1) * PAGE_SIZE;
    body.replaceChildren(...rows.slice(start, start + PAGE_SIZE).map(createRow));

    if (empty) empty.classList.toggle("hidden", rows.length > 0);
    renderPagination(pages);
}

function pageButton(label, page, { active = false, disabled = false } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `page-btn${active ? " active" : ""}`;
    button.dataset.page = String(page);
    button.textContent = label;
    button.disabled = disabled;
    return button;
}

function renderPagination(pages) {
    const nav = $("notificationPagination");
    if (!nav) return;

    if (pages <= 1) {
        nav.replaceChildren();
        return;
    }

    const items = [pageButton("‹", state.page - 1, { disabled: state.page === 1 })];
    for (let page = 1; page <= pages; page += 1) {
        items.push(pageButton(String(page), page, { active: page === state.page }));
    }
    items.push(pageButton("›", state.page + 1, { disabled: state.page === pages }));
    nav.replaceChildren(...items);
}

/* ---------- Actions ---------- */

async function markRead(ids) {
    const { error } = await supabase.rpc("mark_notifications_read", { p_ids: ids });
    if (error) {
        showToast(error.message || "Could not mark as read.", { type: "error" });
        return false;
    }
    return true;
}

async function markOneRead(item) {
    if (item.is_read) return true;
    const ok = await markRead([item.id]);
    if (ok) item.is_read = true;
    return ok;
}

async function markAllRead() {
    const ok = await markRead(null);
    if (!ok) return;
    state.items.forEach((item) => (item.is_read = true));
    renderHeader();
    renderTable();
    showToast("All notifications marked as read.", { type: "success" });
}

async function openItem(item) {
    await markOneRead(item);
    renderHeader();
    if (item.link_url) window.location.href = item.link_url;
    else renderTable();
}

/* ---------- Events ---------- */

function bindEvents() {
    $("notificationHistory")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;

        const item = state.items.find((entry) => entry.id === button.closest("tr")?.dataset.notificationId);
        if (!item) return;

        if (button.dataset.action === "open") openItem(item);
        if (button.dataset.action === "read") {
            markOneRead(item).then((ok) => {
                if (ok) {
                    renderHeader();
                    renderTable();
                }
            });
        }
    });

    document.querySelectorAll("[data-filter]").forEach((tab) => {
        tab.addEventListener("click", () => {
            state.tab = tab.dataset.filter;
            state.page = 1;
            document.querySelectorAll("[data-filter]").forEach((other) => {
                other.classList.toggle("active", other === tab);
            });
            renderTable();
        });
    });

    $("markAllReadBtn")?.addEventListener("click", markAllRead);

    $("notificationSearchForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        state.search = ($("notificationSearch")?.value ?? "").trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("notificationSearch")?.addEventListener("input", (event) => {
        state.search = event.target.value.trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("notificationStatus")?.addEventListener("change", (event) => {
        state.status = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("notificationPagination")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");
        if (!button || button.disabled) return;
        state.page = Number(button.dataset.page);
        renderTable();
    });
}

/* ---------- Live updates ---------- */

function startLiveNotifications() {
    watchTables("admin-notifications", [{ table: "notifications" }], refreshNotifications);
}

async function refreshNotifications() {
    await loadNotifications();
    renderHeader();
    renderTable();
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_notifications" });
    bindEvents();

    loadNotifications()
        .then(() => {
            renderHeader();
            renderTable();
        })
        .catch((error) => {
            console.error("[admin_notifications] could not load notifications:", error);
            showToast("Notifications could not be loaded.", { type: "error" });
        });
    startLiveNotifications();
}