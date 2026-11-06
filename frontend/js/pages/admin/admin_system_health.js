import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN SYSTEM HEALTH (design 19)
   Live checks run each time the page loads and every minute:
   database, API, storage and the server. Figures come from the
   recorded snapshots. Anything the database cannot measure is
   shown as "Not collected", never as a guessed value.
========================================= */

const REFRESH_MS = 60 * 1000;
const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 600;
const HEIGHT = 180;
const PAD = 24;

const timeFormat = new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit" });

const state = { timer: null };

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

/* Runs a request and records how long it took */
async function timed(run) {
    const start = performance.now();
    try {
        const result = await run();
        return { ok: !result?.error, ms: Math.round(performance.now() - start), result };
    } catch (error) {
        return { ok: false, ms: Math.round(performance.now() - start), result: { error } };
    }
}

/* ---------- Live checks ---------- */

async function runChecks() {
    const [database, api, storage] = await Promise.all([
        timed(() => supabase.rpc("admin_health_snapshot")),
        timed(() => supabase.auth.getSession()),
        timed(() => supabase.storage.listBuckets()),
    ]);

    const server = { ok: navigator.onLine, ms: 0 };
    return { database, api, storage, server };
}

function renderChecks(checks) {
    const { database, api, storage, server } = checks;

    setStatus("serverStatus", server.ok, server.ok ? "Online" : "Offline");

    const dbSnapshot = database.result?.data ?? {};
    const latest = dbSnapshot.latest ?? {};
    const dbSize = latest.db_size_mb !== undefined ? ` · ${latest.db_size_mb} MB` : "";
    setStatus(
        "databaseHealth",
        database.ok,
        database.ok ? `Online · ${database.ms} ms${dbSize}` : "Unavailable"
    );

    setStatus("apiStatus", api.ok, api.ok ? `Online · ${api.ms} ms` : "Unavailable");
    setStatus("storageStatus", storage.ok, storage.ok ? `Online · ${storage.ms} ms` : "Unavailable");

    setText("systemUptime", `Last checked ${timeFormat.format(new Date())}`);

    renderAlerts(checks);
    return { latest, series: dbSnapshot.connections_24h ?? [] };
}

function renderAlerts(checks) {
    const list = $("systemAlerts");
    if (!list) return;

    const problems = [];
    if (!checks.server.ok) problems.push("The browser is offline.");
    if (!checks.database.ok) problems.push("The database did not respond.");
    if (!checks.api.ok) problems.push("The API did not respond.");
    if (!checks.storage.ok) problems.push("Storage did not respond.");

    const messages = problems.length ? problems : ["All checks passed."];
    const items = messages.map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
    });

    list.replaceChildren(...items);
}

/* ---------- Figures from snapshots ---------- */

function renderFigures(latest) {
    setText("activeUsers", latest.active_users_24h !== undefined ? String(latest.active_users_24h) : "—");

    const notCollected = "Not collected";
    setText("cpuUsage", notCollected);
    setText("memoryUsage", notCollected);
    setText("storageUsage", notCollected);
    setText("networkTraffic", notCollected);
}

/* ---------- Connection chart ---------- */

function svgEl(name, attributes = {}) {
    const el = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => el.setAttribute(key, String(value)));
    return el;
}

function drawConnections(series) {
    const container = $("systemHealthChart");
    if (!container) return;
    container.replaceChildren();

    const svg = svgEl("svg", { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: "health-chart-svg", role: "img" });
    const points = series.map((item) => ({ t: new Date(item.t).getTime(), v: Number(item.v) }));

    if (points.length === 0) {
        const text = svgEl("text", { x: WIDTH / 2, y: HEIGHT / 2, class: "health-chart-axis", "text-anchor": "middle" });
        text.textContent = "No history yet. Snapshots are recorded every 5 minutes.";
        svg.append(text);
        container.append(svg);
        return;
    }

    const maxV = Math.max(1, ...points.map((point) => point.v));
    const minT = points[0].t;
    const maxT = points[points.length - 1].t;
    const xFor = (t) => (maxT === minT ? WIDTH / 2 : PAD + ((WIDTH - 2 * PAD) * (t - minT)) / (maxT - minT));
    const yFor = (v) => HEIGHT - PAD - ((HEIGHT - 2 * PAD) * v) / maxV;

    const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(point.t)},${yFor(point.v)}`).join(" ");
    svg.append(svgEl("path", { d: line, fill: "none", stroke: "#3FD0FF", "stroke-width": "2.5", "stroke-linejoin": "round" }));

    const first = svgEl("text", { x: PAD, y: HEIGHT - 6, class: "health-chart-axis" });
    first.textContent = timeFormat.format(new Date(minT));
    const last = svgEl("text", { x: WIDTH - PAD, y: HEIGHT - 6, class: "health-chart-axis", "text-anchor": "end" });
    last.textContent = timeFormat.format(new Date(maxT));
    svg.append(first, last);

    container.append(svg);
}

/* ---------- Refresh ---------- */

async function refresh() {
    const checks = await runChecks();
    const { latest, series } = renderChecks(checks);
    renderFigures(latest);
    drawConnections(series);
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_system_health" });

    refresh().catch((error) => {
        console.error("[admin_system_health] could not run checks:", error);
        showToast("System health could not be checked.", { type: "error" });
    });

    state.timer = setInterval(() => {
        refresh().catch((error) => console.error("[admin_system_health] refresh failed:", error));
    }, REFRESH_MS);
}