import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN BROADCAST MESSAGES
   Send now, or schedule for a later time. Scheduled messages
   are delivered by a job once their time arrives. Scheduled
   messages that have not been sent can be cancelled.
========================================= */

const AUDIENCE_LABEL = {
    all: "All Users",
    students: "Students",
    landlords: "Landlords",
    administrators: "Administrators",
};

const ROLE_LABEL = {
    student: "Students",
    landlord: "Landlords",
    admin: "Administrators",
    super_admin: "Administrators",
};

const shortDate = new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

const state = {
    broadcasts: [],
};

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function audienceLabel(broadcast) {
    if (broadcast.label) return broadcast.label;
    return broadcast.target_role ? (ROLE_LABEL[broadcast.target_role] ?? broadcast.target_role) : "All Users";
}

function sentList() {
    return state.broadcasts.filter((broadcast) => broadcast.sent_at);
}

function scheduledList() {
    return state.broadcasts.filter((broadcast) => !broadcast.sent_at);
}

/* ---------- Data ---------- */

async function loadBroadcasts() {
    const { data, error } = await supabase.rpc("admin_list_broadcasts");
    if (error) throw error;
    state.broadcasts = data ?? [];
}

function renderStats() {
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const sent = sentList();

    setText("messagesSent", sent.length);
    setText(
        "totalRecipients",
        sent.reduce((sum, broadcast) => sum + Number(broadcast.recipients || 0), 0)
    );
    setText(
        "activeAnnouncements",
        sent.filter((broadcast) => new Date(broadcast.sent_at).getTime() >= monthAgo).length
    );
    setText("scheduledMessages", scheduledList().length);
}

/* ---------- History table ---------- */

function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
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

function statusCell(broadcast) {
    const td = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = broadcast.sent_at ? "status-badge active" : "status-badge pending";
    badge.textContent = broadcast.sent_at ? "Sent" : "Scheduled";
    td.append(badge);
    return td;
}

function dateText(broadcast) {
    if (broadcast.sent_at) return shortDate.format(new Date(broadcast.sent_at));
    if (broadcast.scheduled_for) return `For ${shortDate.format(new Date(broadcast.scheduled_for))}`;
    return "—";
}

function createRow(broadcast) {
    const row = document.createElement("tr");
    row.dataset.broadcastId = broadcast.id;

    const title = document.createElement("td");
    const strong = document.createElement("strong");
    strong.textContent = broadcast.title || "Message";
    title.append(strong);

    const actions = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "admin-actions";
    wrap.append(iconButton("fa-eye", "View message", "view"));
    if (!broadcast.sent_at) {
        wrap.append(iconButton("fa-calendar-xmark", "Cancel scheduled message", "cancel"));
    }
    actions.append(wrap);

    row.append(title, cell(audienceLabel(broadcast)), cell(dateText(broadcast)), statusCell(broadcast), actions);
    return row;
}

function renderHistory() {
    const body = $("broadcastHistory");
    const empty = $("noBroadcastsFound");
    if (!body) return;

    body.replaceChildren(...state.broadcasts.slice(0, 20).map(createRow));
    if (empty) empty.classList.toggle("hidden", state.broadcasts.length > 0);
}

/* ---------- Preview ---------- */

function showPreview(message) {
    setText("broadcastPreviewTitle", message.title);
    setText("broadcastPreviewAudience", audienceLabel(message));
    setText("broadcastPreviewBody", message.body);
    $("broadcastPreview")?.classList.remove("hidden");
}

function hidePreview() {
    $("broadcastPreview")?.classList.add("hidden");
}

function previewFromForm() {
    const title = $("broadcastTitle")?.value.trim() ?? "";
    const body = $("broadcastMessage")?.value.trim() ?? "";
    const audience = $("broadcastAudience")?.value ?? "all";

    if (!title || !body) {
        showToast("Add a title and a message to preview.", { type: "error" });
        return;
    }

    showPreview({ title, body, label: AUDIENCE_LABEL[audience] });
}

/* ---------- Sending ---------- */

async function sendBroadcast(schedule) {
    const title = $("broadcastTitle")?.value.trim() ?? "";
    const body = $("broadcastMessage")?.value.trim() ?? "";
    const audience = $("broadcastAudience")?.value ?? "all";

    if (!title || !body) {
        showToast("A title and a message are required.", { type: "error" });
        return;
    }

    let sendAt = null;
    let when = null;

    if (schedule) {
        const raw = $("broadcastSendAt")?.value ?? "";
        if (!raw) {
            showToast("Choose a date and time to schedule the message.", { type: "error" });
            return;
        }
        when = new Date(raw);
        if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now() + 60 * 1000) {
            showToast("Choose a time at least a minute from now.", { type: "error" });
            return;
        }
        sendAt = when.toISOString();
    }

    const question = schedule
        ? `Schedule "${title}" for ${shortDate.format(when)} to ${AUDIENCE_LABEL[audience]}?`
        : `Send "${title}" to ${AUDIENCE_LABEL[audience]} now? This cannot be undone.`;
    if (!confirm(question)) return;

    const buttons = [$("sendBroadcastBtn"), $("scheduleBroadcastBtn")].filter(Boolean);
    buttons.forEach((button) => (button.disabled = true));

    const { data, error } = await supabase.rpc("send_broadcast", {
        p_title: title,
        p_body: body,
        p_audience: audience,
        p_send_at: sendAt,
    });

    buttons.forEach((button) => (button.disabled = false));

    if (error) {
        console.error("[admin_broadcast_messages] send failed:", error);
        showToast(error.message || "The message could not be saved.", { type: "error" });
        return;
    }

    showToast(
        schedule ? "Message scheduled." : `Message sent to ${data ?? 0} people.`,
        { type: "success" }
    );
    $("broadcastForm")?.reset();
    hidePreview();
    await refresh();
}

async function cancelScheduled(broadcast, button) {
    if (!confirm(`Cancel the scheduled message "${broadcast.title}"? It will not be sent.`)) return;

    button.disabled = true;
    const { error } = await supabase.rpc("cancel_scheduled_broadcast", { p_id: broadcast.id });

    if (error) {
        button.disabled = false;
        showToast(error.message || "The scheduled message could not be cancelled.", { type: "error" });
        return;
    }

    showToast("Scheduled message cancelled.", { type: "success" });
    await refresh();
}

/* ---------- Refresh ---------- */

async function refresh() {
    await loadBroadcasts();
    renderStats();
    renderHistory();
}

/* ---------- Events ---------- */

function bindEvents() {
    $("broadcastForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        sendBroadcast(false);
    });

    $("scheduleBroadcastBtn")?.addEventListener("click", () => sendBroadcast(true));

    $("previewBroadcastBtn")?.addEventListener("click", previewFromForm);

    $("closeBroadcastPreview")?.addEventListener("click", hidePreview);

    $("newBroadcastBtn")?.addEventListener("click", () => {
        $("broadcastTitle")?.focus();
        $("broadcastForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    $("broadcastHistory")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;

        const id = button.closest("tr")?.dataset.broadcastId;
        const broadcast = state.broadcasts.find((item) => item.id === id);
        if (!broadcast) return;

        if (button.dataset.action === "view") showPreview(broadcast);
        if (button.dataset.action === "cancel") cancelScheduled(broadcast, button);
    });
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_broadcast_messages" });
    bindEvents();

    refresh().catch((error) => {
        console.error("[admin_broadcast_messages] could not load broadcasts:", error);
        showToast("Broadcast history could not be loaded.", { type: "error" });
    });
}