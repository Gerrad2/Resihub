import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN BACKUP AND RESTORE (design 4)
   Shows the backup history recorded in backup_records, and exports
   users, listings and bookings as CSV. Every export is logged by the
   database. Full backups and restores are managed by Supabase, not
   from this page.
========================================= */

const dateFormat = new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});

const STATUS_CLASS = {
    completed: "active",
    failed: "suspended",
    running: "pending",
    pending: "pending",
};

const state = {
    history: [],
};

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value <= 0) return "0 MB";
    if (value >= 1073741824) return `${(value / 1073741824).toFixed(2)} GB`;
    return `${(value / 1048576).toFixed(1)} MB`;
}

function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
}

/* ---------- History ---------- */

async function loadHistory() {
    const { data, error } = await supabase.rpc("admin_backup_history");
    if (error) throw error;
    state.history = data ?? [];
    renderSummary();
    renderHistory();
}

function renderSummary() {
    const completed = state.history.filter((item) => item.status === "completed");
    const latest = completed[0] ?? null;

    setText(
        "lastBackupTime",
        latest ? dateFormat.format(new Date(latest.completed_at ?? latest.created_at)) : "No backups recorded yet"
    );
    setText("lastBackupType", latest ? `${latest.backup_type} backup` : "—");

    setText("backupCount", String(state.history.length));
    const total = state.history.reduce((sum, item) => sum + Number(item.size_bytes || 0), 0);
    setText("backupStorage", formatBytes(total));

    setText("autoBackupStatus", "Managed by Supabase");
    setText("backupFrequency", "Set by your Supabase plan");
    setText("retentionPeriod", "Set by your Supabase plan");
}

function statusCell(item) {
    const td = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `status-badge ${STATUS_CLASS[item.status] ?? "pending"}`;
    badge.textContent = item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : "Unknown";
    td.append(badge);
    return td;
}

function renderHistory() {
    const body = $("backupHistoryTable");
    const empty = $("backupHistoryEmpty");
    if (!body) return;

    const rows = state.history.slice(0, 20).map((item) => {
        const row = document.createElement("tr");
        row.append(
            cell(dateFormat.format(new Date(item.created_at))),
            cell(item.backup_type || "—"),
            statusCell(item),
            cell(item.size_bytes ? formatBytes(item.size_bytes) : "—"),
            cell(item.initiated_by_name || "System"),
            cell(item.has_file ? "Available" : "None")
        );
        return row;
    });

    body.replaceChildren(...rows);
    if (empty) empty.classList.toggle("hidden", state.history.length > 0);
}

/* ---------- Export ---------- */

function csvCell(value) {
    if (value === null || value === undefined) return '""';
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

async function exportSelected() {
    const table = $("exportTable")?.value;
    if (!table) return;

    const button = $("exportBackupBtn");
    if (button) button.disabled = true;

    const { data, error } = await supabase.rpc("admin_export_table", { p_table: table });

    if (button) button.disabled = false;

    if (error) {
        console.error("[admin_backup_restore] export failed:", error);
        showToast(error.message || "The export could not be created.", { type: "error" });
        return;
    }

    const rows = data ?? [];
    if (rows.length === 0) {
        showToast("There are no rows to export.", { type: "error" });
        return;
    }

    const headers = Object.keys(rows[0]);
    const lines = [
        headers.map(csvCell).join(","),
        ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
    ];

    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${table}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast(`Exported ${rows.length} rows.`, { type: "success" });
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_backup_restore" });

    $("exportBackupBtn")?.addEventListener("click", exportSelected);

    loadHistory().catch((error) => {
        console.error("[admin_backup_restore] could not load backups:", error);
        showToast("Backup history could not be loaded.", { type: "error" });
    });
}