import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN AUDIT TRAIL (design 3)
   The same records as activity logs, shown as a change history:
   who did what, to which module, and from which address.
   Filters: day, module and user.
========================================= */

const PAGE_SIZE = 10;

const ACTION_VERB = {
    create: "Created",
    update: "Modified",
    delete: "Deleted",
    login: "Signed in",
    logout: "Signed out",
    approve: "Approved",
    reject: "Rejected",
    suspend: "Suspended",
    restore: "Restored",
    export: "Exported",
};

const MODULE_LABEL = {
    listing: "Listings",
    booking: "Bookings",
    verification: "Verification",
    broadcast: "Broadcasts",
    settings: "Settings",
    admin_session: "Sessions",
};

const dateFormat = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});

const state = {
    logs: [],
    module: "",
    user: "",
    day: "",
    search: "",
    page: 1,
    visible: [],
};

function $(id) {
    return document.getElementById(id);
}

function moduleName(log) {
    return MODULE_LABEL[log.entity_type] ?? (log.entity_type || "—");
}

function eventText(log) {
    const verb = ACTION_VERB[log.action] ?? log.action;
    if (log.action === "login" || log.action === "logout") return verb;
    const subject = (log.entity_type || "").replace(/_/g, " ");
    return subject ? `${verb} ${subject}` : verb;
}

/* ---------- Data ---------- */

async function loadLogs() {
    const { data, error } = await supabase.rpc("admin_list_activity", { p_limit: 500 });
    if (error) throw error;
    state.logs = data ?? [];
}

function renderUserOptions() {
    const select = $("auditSeverity");
    if (!select) return;

    const names = [...new Set(state.logs.map((log) => log.user_name).filter(Boolean))].sort();
    const keep = select.value;

    select.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All Users";
    select.append(all);

    names.forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.append(option);
    });

    select.value = names.includes(keep) ? keep : "";
}

/* ---------- Filtering ---------- */

function filteredLogs() {
    return state.logs.filter((log) => {
        if (state.module && log.entity_type !== state.module) return false;
        if (state.user && log.user_name !== state.user) return false;

        if (state.day) {
            const day = new Date(log.created_at).toLocaleDateString("en-CA");
            if (day !== state.day) return false;
        }

        if (state.search) {
            const haystack = [log.user_name, eventText(log), moduleName(log), log.ip_address]
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

function createRow(log) {
    const row = document.createElement("tr");
    const ip = cell(log.ip_address || "—");
    ip.className = "audit-ip";

    row.append(
        cell(dateFormat.format(new Date(log.created_at))),
        cell(log.user_name || "System"),
        cell(eventText(log)),
        cell(moduleName(log)),
        ip
    );
    return row;
}

function renderTable() {
    const body = $("auditTrailTable");
    const empty = $("auditEmptyState");
    if (!body) return;

    const rows = filteredLogs();
    state.visible = rows;

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
    const nav = $("auditPagination");
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

/* ---------- Export ---------- */

function csvCell(value) {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function exportVisible() {
    const rows = state.visible;
    if (!rows.length) {
        showToast("There is nothing to export.", { type: "error" });
        return;
    }

    const header = ["Date & Time", "User", "Action", "Module", "IP Address"];
    const lines = rows.map((log) => [
        dateFormat.format(new Date(log.created_at)),
        log.user_name || "System",
        eventText(log),
        moduleName(log),
        log.ip_address || "",
    ].map(csvCell).join(","));

    const csv = [header.map(csvCell).join(","), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast(`Exported ${rows.length} entries.`, { type: "success" });
}

/* ---------- Events ---------- */

function bindEvents() {
    $("auditPagination")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");
        if (!button || button.disabled) return;
        state.page = Number(button.dataset.page);
        renderTable();
    });

    $("auditFilterForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        state.search = ($("auditSearch")?.value ?? "").trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("auditSearch")?.addEventListener("input", (event) => {
        state.search = event.target.value.trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("auditEvent")?.addEventListener("change", (event) => {
        state.module = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("auditSeverity")?.addEventListener("change", (event) => {
        state.user = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("auditDate")?.addEventListener("change", (event) => {
        state.day = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("exportAuditBtn")?.addEventListener("click", exportVisible);
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_audit_trail" });
    bindEvents();

    loadLogs()
        .then(() => {
            renderUserOptions();
            renderTable();
        })
        .catch((error) => {
            console.error("[admin_audit_trail] could not load the audit trail:", error);
            showToast("The audit trail could not be loaded.", { type: "error" });
        });
}