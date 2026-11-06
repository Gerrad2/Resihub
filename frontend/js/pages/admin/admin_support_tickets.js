import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN SUPPORT TICKETS
   Track and resolve user support requests. Admins read a
   ticket's conversation, reply, take it, and change its status
   and priority. Users are notified of replies and resolution.
========================================= */

const PAGE_SIZE = 10;

const STATUS_LABEL = {
    open: "Open",
    in_progress: "In progress",
    awaiting_user: "Awaiting reply",
    resolved: "Resolved",
    closed: "Closed",
};

const STATUS_CLASS = {
    open: "pending",
    in_progress: "pending",
    awaiting_user: "pending",
    resolved: "active",
    closed: "active",
};

const PRIORITY_LABEL = {
    urgent: "Urgent",
    high: "High",
    medium: "Medium",
    low: "Low",
};

const PRIORITY_CLASS = {
    urgent: "suspended",
    high: "suspended",
    medium: "pending",
    low: "active",
};

const ROLE_LABEL = {
    student: "Student",
    landlord: "Landlord",
    admin: "Admin",
    super_admin: "Super admin",
};

const shortDate = new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

const state = {
    tickets: [],
    search: "",
    status: "",
    priority: "",
    category: "",
    page: 1,
    open: null,
    thread: [],
};

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function ticketCode(ticket) {
    return `TK-${ticket.ticket_id.slice(0, 6).toUpperCase()}`;
}

/* ---------- Data ---------- */

async function loadTickets() {
    const { data, error } = await supabase.rpc("admin_list_tickets");
    if (error) throw error;
    state.tickets = data ?? [];
}

function renderStats() {
    const count = (statuses) => state.tickets.filter((ticket) => statuses.includes(ticket.status)).length;

    setText("totalTickets", state.tickets.length);
    setText("openTickets", count(["open"]));
    setText("pendingTickets", count(["in_progress", "awaiting_user"]));
    setText("resolvedTickets", count(["resolved", "closed"]));
}

/* ---------- Filtering ---------- */

function filteredTickets() {
    return state.tickets.filter((ticket) => {
        if (state.status && ticket.status !== state.status) return false;
        if (state.priority && ticket.priority !== state.priority) return false;
        if (state.category && (ticket.category ?? "").toLowerCase() !== state.category) return false;

        if (state.search) {
            const haystack = [ticket.subject, ticket.user_name, ticket.user_email, ticketCode(ticket)]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
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

function badgeCell(text, className) {
    const td = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `status-badge ${className}`;
    badge.textContent = text;
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

function createRow(ticket) {
    const row = document.createElement("tr");
    row.dataset.ticketId = ticket.ticket_id;

    const subject = document.createElement("td");
    const strong = document.createElement("strong");
    strong.textContent = ticket.subject || "Support request";
    subject.append(strong);

    const actions = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "admin-actions";
    wrap.append(iconButton("fa-eye", "Open ticket", "open"));
    actions.append(wrap);

    row.append(
        cell(ticketCode(ticket)),
        subject,
        cell(`${ticket.user_name || "User"}${ticket.user_role ? ` (${ROLE_LABEL[ticket.user_role] ?? ticket.user_role})` : ""}`),
        badgeCell(PRIORITY_LABEL[ticket.priority] ?? ticket.priority, PRIORITY_CLASS[ticket.priority] ?? "pending"),
        badgeCell(STATUS_LABEL[ticket.status] ?? ticket.status, STATUS_CLASS[ticket.status] ?? "pending"),
        cell(ticket.created_at ? shortDate.format(new Date(ticket.created_at)) : "—"),
        actions
    );
    return row;
}

function renderTable() {
    const body = $("supportTicketsTable");
    const empty = $("noTicketsFound");
    if (!body) return;

    const rows = filteredTickets();
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
    const nav = $("ticketPagination");
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

/* ---------- Ticket panel ---------- */

function buildPanel() {
    if ($("supportTicketPanel")) return;

    const modal = document.createElement("div");
    modal.id = "supportTicketPanel";
    modal.className = "modal hidden";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
        <div class="modal-content support-panel-content">
            <div class="modal-header">
                <h2 class="modal-title" id="supportPanelTitle">Ticket</h2>
                <button type="button" class="modal-close" id="supportPanelClose" aria-label="Close">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
            </div>
            <div class="modal-body support-panel-body">
                <div id="supportPanelMeta" class="support-meta"></div>
                <div id="supportPanelThread" class="support-thread" aria-live="polite"></div>
                <div class="support-controls">
                    <label>Status
                        <select id="supportPanelStatus" class="liquid-input">
                            <option value="open">Open</option>
                            <option value="in_progress">In progress</option>
                            <option value="awaiting_user">Awaiting reply</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                        </select>
                    </label>
                    <label>Priority
                        <select id="supportPanelPriority" class="liquid-input">
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </label>
                </div>
                <form id="supportReplyForm" class="support-reply">
                    <textarea id="supportReplyBody" class="liquid-input" placeholder="Write a reply to the user..." maxlength="4000" required></textarea>
                    <div class="support-actions">
                        <button type="button" id="supportTakeBtn" class="btn btn-outline">Take ticket</button>
                        <button type="button" id="supportSaveBtn" class="btn btn-outline">Save status</button>
                        <button type="submit" id="supportReplyBtn" class="btn btn-primary">Send reply</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.append(modal);

    $("supportPanelClose").addEventListener("click", closePanel);
    modal.addEventListener("click", (event) => {
        if (event.target === modal) closePanel();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && state.open) closePanel();
    });
    $("supportReplyForm").addEventListener("submit", sendReply);
    $("supportTakeBtn").addEventListener("click", takeTicket);
    $("supportSaveBtn").addEventListener("click", saveStatus);
}

function closePanel() {
    $("supportTicketPanel")?.classList.add("hidden");
    state.open = null;
    state.thread = [];
}

function currentTicket() {
    return state.tickets.find((ticket) => ticket.ticket_id === state.open);
}

function metaRow(label, value) {
    const row = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    row.append(strong, document.createTextNode(value || "—"));
    return row;
}

function renderPanel() {
    const ticket = currentTicket();
    if (!ticket) return;

    setText("supportPanelTitle", `${ticketCode(ticket)}: ${ticket.subject || "Support request"}`);

    const meta = $("supportPanelMeta");
    meta.replaceChildren(
        metaRow("User", `${ticket.user_name || "User"}${ticket.user_role ? ` (${ROLE_LABEL[ticket.user_role] ?? ticket.user_role})` : ""}`),
        metaRow("Email", ticket.user_email),
        metaRow("Category", ticket.category),
        metaRow("Assigned to", ticket.assigned_name || "Not taken yet"),
        metaRow("Opened", ticket.created_at ? shortDate.format(new Date(ticket.created_at)) : "—")
    );

    const thread = $("supportPanelThread");
    const original = document.createElement("div");
    original.className = "support-message user";
    const originalMeta = document.createElement("span");
    originalMeta.className = "support-message-meta";
    originalMeta.textContent = `${ticket.user_name || "User"} · ${ticket.created_at ? shortDate.format(new Date(ticket.created_at)) : ""}`;
    const originalBody = document.createElement("p");
    originalBody.textContent = ticket.description || "";
    original.append(originalMeta, originalBody);

    const replies = state.thread.map((reply) => {
        const item = document.createElement("div");
        item.className = `support-message ${reply.is_staff ? "staff" : "user"}`;
        const itemMeta = document.createElement("span");
        itemMeta.className = "support-message-meta";
        itemMeta.textContent = `${reply.author_name || "User"}${reply.is_staff ? " (ResiHub)" : ""} · ${shortDate.format(new Date(reply.created_at))}`;
        const itemBody = document.createElement("p");
        itemBody.textContent = reply.body;
        item.append(itemMeta, itemBody);
        return item;
    });

    thread.replaceChildren(original, ...replies);

    $("supportPanelStatus").value = ticket.status;
    $("supportPanelPriority").value = ticket.priority;
}

async function openTicket(ticket) {
    buildPanel();
    state.open = ticket.ticket_id;
    state.thread = [];
    renderPanel();
    $("supportTicketPanel").classList.remove("hidden");

    const { data, error } = await supabase.rpc("admin_ticket_thread", { p_ticket_id: ticket.ticket_id });
    if (error) {
        console.error("[admin_support_tickets] could not load thread:", error);
        showToast("This conversation could not be loaded.", { type: "error" });
        return;
    }
    if (state.open !== ticket.ticket_id) return;
    state.thread = data ?? [];
    renderPanel();
}

async function takeTicket() {
    const ticket = currentTicket();
    if (!ticket) return;

    const { error } = await supabase.rpc("admin_take_ticket", { p_ticket_id: ticket.ticket_id });
    if (error) {
        showToast(error.message || "The ticket could not be taken.", { type: "error" });
        return;
    }

    showToast("You are now handling this ticket.", { type: "success" });
    await refresh();
    renderPanel();
}

async function saveStatus() {
    const ticket = currentTicket();
    if (!ticket) return;

    const status = $("supportPanelStatus").value;
    const priority = $("supportPanelPriority").value;

    const { error } = await supabase.rpc("admin_update_ticket", {
        p_ticket_id: ticket.ticket_id,
        p_status: status,
        p_priority: priority,
    });

    if (error) {
        showToast(error.message || "The ticket could not be updated.", { type: "error" });
        return;
    }

    showToast("Ticket updated.", { type: "success" });
    await refresh();
    renderPanel();
}

async function sendReply(event) {
    event.preventDefault();

    const ticket = currentTicket();
    const body = $("supportReplyBody").value.trim();
    if (!ticket || !body) {
        showToast("Write a reply before sending.", { type: "error" });
        return;
    }

    const status = $("supportPanelStatus").value;
    const button = $("supportReplyBtn");
    button.disabled = true;

    const { error } = await supabase.rpc("admin_reply_ticket", {
        p_ticket_id: ticket.ticket_id,
        p_body: body,
        p_status: status,
    });

    button.disabled = false;

    if (error) {
        showToast(error.message || "The reply could not be sent.", { type: "error" });
        return;
    }

    $("supportReplyBody").value = "";
    showToast("Reply sent. The user has been notified.", { type: "success" });
    await refresh();
    await openTicket(ticket);
}

/* ---------- Refresh and events ---------- */

async function refresh() {
    await loadTickets();
    renderStats();
    renderTable();
}

function bindEvents() {
    $("supportTicketsTable")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action='open']");
        if (!button) return;

        const id = button.closest("tr")?.dataset.ticketId;
        const ticket = state.tickets.find((item) => item.ticket_id === id);
        if (ticket) openTicket(ticket);
    });

    $("ticketPagination")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");
        if (!button || button.disabled) return;
        state.page = Number(button.dataset.page);
        renderTable();
    });

    $("ticketFilterForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        state.search = ($("ticketSearch")?.value ?? "").trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("ticketSearch")?.addEventListener("input", (event) => {
        state.search = event.target.value.trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("ticketStatus")?.addEventListener("change", (event) => {
        state.status = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("ticketPriority")?.addEventListener("change", (event) => {
        state.priority = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("ticketCategory")?.addEventListener("change", (event) => {
        state.category = event.target.value;
        state.page = 1;
        renderTable();
    });
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_support_tickets" });
    bindEvents();

    refresh().catch((error) => {
        console.error("[admin_support_tickets] could not load tickets:", error);
        showToast("Support tickets could not be loaded.", { type: "error" });
    });
}