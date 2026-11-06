import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN SYSTEM CONFIGURATION (design 18)
   Read-only view of how the platform is running. Nothing on this
   page changes settings. Secret keys (payments, maps, email) are not
   shown or stored here. They belong in the hosting environment.
========================================= */

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function setStatus(id, ok, text) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("ok", ok);
    el.classList.toggle("bad", !ok);
}

/* ---------- Sections ---------- */

function showSection(name) {
    document.querySelectorAll("[data-section]").forEach((button) => {
        const active = button.dataset.section === name;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
    });

    document.querySelectorAll("[data-panel]").forEach((panel) => {
        panel.classList.toggle("hidden", panel.dataset.panel !== name);
    });
}

/* ---------- Server information (read from the running app) ---------- */

function renderServer() {
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";

    setText("environmentValue", isLocal ? "Development (local)" : "Production");
    setText("appUrlValue", window.location.origin);
    setText("supabaseUrlValue", supabase.supabaseUrl ?? "—");
    setText("browserValue", navigator.userAgent.split(") ").pop().slice(0, 80) || "—");
}

/* ---------- Live checks ---------- */

async function timed(run) {
    const start = performance.now();
    try {
        const result = await run();
        return { ok: !result?.error, ms: Math.round(performance.now() - start), result };
    } catch (error) {
        return { ok: false, ms: Math.round(performance.now() - start), result: { error } };
    }
}

async function renderChecks() {
    const [database, api] = await Promise.all([
        timed(() => supabase.rpc("admin_health_snapshot")),
        timed(() => supabase.auth.getSession()),
    ]);

    const latest = database.result?.data?.latest ?? {};
    const size = latest.db_size_mb !== undefined ? ` · ${latest.db_size_mb} MB` : "";
    setStatus("databaseStatus", database.ok, database.ok ? `Online · ${database.ms} ms${size}` : "Unavailable");
    setText("databaseConnections", latest.db_connections !== undefined ? String(latest.db_connections) : "—");

    setStatus("apiStatus", api.ok, api.ok ? `Online · ${api.ms} ms` : "Unavailable");
}

/* ---------- Maintenance (read from platform settings) ---------- */

async function renderPlatformStatus() {
    const { data, error } = await supabase.rpc("admin_list_settings");
    if (error) throw error;

    const row = (data ?? []).find((item) => item.setting_key === "platform_status");
    const value = typeof row?.setting_value === "string" ? row.setting_value : "active";
    const label = { active: "Active", maintenance: "Maintenance", offline: "Offline" }[value] ?? value;
    setText("maintenanceStatus", `Platform status: ${label}`);
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_system_configuration" });

    document.querySelectorAll("[data-section]").forEach((button) => {
        button.addEventListener("click", () => showSection(button.dataset.section));
    });

    showSection("server");
    renderServer();

    renderChecks().catch((error) => {
        console.error("[admin_system_configuration] could not run checks:", error);
        showToast("Live status could not be checked.", { type: "error" });
    });

    renderPlatformStatus().catch((error) => {
        console.error("[admin_system_configuration] could not load platform status:", error);
        setText("maintenanceStatus", "Platform status unavailable");
    });
}