import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN ACTIVITY LOGS
   Read-only record of what administrators and the system did.
   Filters by administrator, activity and day. Each row can be
   opened for its details. The visible rows can be exported.
========================================= */

const PAGE_SIZE = 10;

const ACTION_LABEL = {
    create: "Created",
    update: "Updated",
    delete: "Deleted",
    login: "Logged in",
    logout: "Logged out",
    approve: "Approved",
    reject: "Rejected",
    suspend: "Suspended",
    restore: "Restored",
    export: "Exported",
};

const ACTIONS = new Set(Object.keys(ACTION_LABEL));

const timeFormat = new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

const state = {
    logs: [],
    admin: "",
    activity: "",
    day: "",
    search: "",
    page: 1,
    visible: [],
};

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function titleCase(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

/* ---------- Data ---------- */

async function loadLogs() {
    const { data, error } = await supabase.rpc("admin_list_activity", { p_limit: 500 });
    if (error) throw error;
    state.logs = data ?? [];
}

async function loadStats() {
    const { data, error } = await supabase.rpc("admin_activity_stats");
    if (error) throw error;

    const row = (data ?? [])[0] ?? {};
    setText("totalActivities", row.total_count ?? 0);
    setText("exportsToday", row.exports_today ?? 0);
    setText("activeAdmins", row.active_admins ?? 0);
    setText("securityEvents", row.security_events ?? 0);
}

function renderAdminOptions() {
    const select = $("activityAdmin");
    if (!select) return;

    const names = [...new Set(state.logs.map((log) => log.user_name).filter(Boolean))].sort();
    const keep = select.value;

    select.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All Administrators";
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

/* The activity dropdown holds either an action (login, logout, ...) or a module (listing, student, ...). */
function matchesActivity(log, value) {
    if (!value) return true;
    if (ACTIONS.has(value)) return log.action === value;
    return (log.entity_type ?? "") === value;
}

function filteredLogs() {
    return state.logs.filter((log) => {
        if (state.admin && log.user_name !== state.admin) return false;
        if (!matchesActivity(log, state.activity)) return false;

        if (state.day) {
            const day = new Date(log.created_at).toLocaleDateString("en-CA");
            if (day !== state.day) return false;
        }

        if (state.search) {
            const haystack = [log.user_name, log.action, log.entity_type, log.ip_address]
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

function activityCell(log) {
    const td = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "status-badge pending";
    badge.textContent = ACTION_LABEL[log.action] ?? titleCase(log.action);
    td.append(badge);
    return td;
}

function detailsCell(log) {
    const td = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-outline activity-details-btn";
    button.dataset.action = "details";
    button.textContent = "View";
    td.append(button);
    return td;
}

const rowTimeFormat = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});

function detailsText(log) {
    const meta = log.metadata ?? {};
    return meta.title || meta.name || titleCase(log.entity_type || "") || "—";
}

function createRow(log) {
    const row = document.createElement("tr");
    row.dataset.logId = String(log.log_id);

    const ip = cell(log.ip_address || "—");
    ip.className = "activity-ip";

    row.append(
        cell(rowTimeFormat.format(new Date(log.created_at))),
        cell(log.user_name || "System"),
        cell(ACTION_LABEL[log.action] ?? titleCase(log.action)),
        cell(detailsText(log)),
        ip
    );
    return row;
}

function renderTable() {
    const body = $("activityLogsTable");
    const empty = $("noActivityLogs");
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
    const nav = $("activityPagination");
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

/* ---------- Details ---------- */

function openDetails(log) {
    const content = $("activityDetailsContent");
    if (!content) return;

    const lines = [
        ["Time", timeFormat.format(new Date(log.created_at))],
        ["Administrator", log.user_name || "System"],
        ["Role", log.user_role || "—"],
        ["Activity", ACTION_LABEL[log.action] ?? log.action],
        ["Module", titleCase(log.entity_type || "") || "—"],
        ["Record ID", log.entity_id || "—"],
        ["IP address", log.ip_address || "—"],
        ["Device", log.user_agent || "—"],
    ];

    const list = document.createElement("dl");
    list.className = "activity-details-list";
    lines.forEach(([label, value]) => {
        const term = document.createElement("dt");
        term.textContent = label;
        const detail = document.createElement("dd");
        detail.textContent = value;
        list.append(term, detail);
    });

    const metadata = document.createElement("pre");
    metadata.className = "activity-metadata";
    metadata.textContent = JSON.stringify(log.metadata ?? {}, null, 2);

    content.replaceChildren(list, metadata);
    $("activityDetailsModal")?.classList.remove("hidden");
}

function closeDetails() {
    $("activityDetailsModal")?.classList.add("hidden");
}

/* ---------- Export ---------- */

function csvCell(value) {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function exportVisible() {
    const rows = state.visible;
    if (!rows.length) {
        showToast("There are no activities to export.", { type: "error" });
        return;
    }

    const header = ["Time", "Administrator", "Activity", "Module", "IP address", "Details"];
    const lines = rows.map((log) => [
        timeFormat.format(new Date(log.created_at)),
        log.user_name || "System",
        ACTION_LABEL[log.action] ?? log.action,
        log.entity_type || "",
        log.ip_address || "",
        JSON.stringify(log.metadata ?? {}),
    ].map(csvCell).join(","));

    const csv = [header.map(csvCell).join(","), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast(`Exported ${rows.length} activities.`, { type: "success" });
}

/* ---------- Events ---------- */

function bindEvents() {
    $("activityLogsTable")?.addEventListener("click", (event) => {
        const row = event.target.closest("tr");
        if (!row) return;

        const log = state.logs.find((item) => String(item.log_id) === row.dataset.logId);
        if (log) openDetails(log);
    });

    $("activityPagination")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");
        if (!button || button.disabled) return;
        state.page = Number(button.dataset.page);
        renderTable();
    });

    $("activityFilterForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        state.search = ($("activitySearch")?.value ?? "").trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("activitySearch")?.addEventListener("input", (event) => {
        state.search = event.target.value.trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("activityAdmin")?.addEventListener("change", (event) => {
        state.admin = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("activityType")?.addEventListener("change", (event) => {
        state.activity = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("activityDate")?.addEventListener("change", (event) => {
        state.day = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("exportLogsBtn")?.addEventListener("click", exportVisible);

    $("closeActivityModal")?.addEventListener("click", closeDetails);

    $("activityDetailsModal")?.addEventListener("click", (event) => {
        if (event.target === $("activityDetailsModal")) closeDetails();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeDetails();
    });
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_activity_logs" });
    bindEvents();

    $("activityLoading")?.classList.remove("hidden");

    Promise.all([loadLogs(), loadStats()])
        .then(() => {
            renderAdminOptions();
            renderTable();
        })
        .catch((error) => {
            console.error("[admin_activity_logs] could not load activity:", error);
            showToast("Activity logs could not be loaded.", { type: "error" });
        })
        .finally(() => {
            $("activityLoading")?.classList.add("hidden");
        });
}