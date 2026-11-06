import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN ANALYTICS (design 2)
   Totals and daily activity for a chosen period, drawn as SVG charts.
   Revenue and occupancy need data that isn't in the database yet,
   so those cards are shown as coming soon.
========================================= */

const PERIOD_DAYS = { today: 1, week: 7, month: 30, year: 365, all: 365 };
const PERIOD_LABEL = {
    today: "Today",
    week: "Last 7 days",
    month: "Last 30 days",
    year: "Last 365 days",
    all: "Last 365 days",
};

const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 600;
const HEIGHT = 220;
const PAD = 30;

const numberFormat = new Intl.NumberFormat("en-NG");
const dayFormat = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short" });

const state = {
    period: "month",
    data: null,
};

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function svgEl(name, attributes = {}) {
    const el = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => el.setAttribute(key, String(value)));
    return el;
}

/* ---------- Data ---------- */

async function loadAnalytics() {
    $("analyticsLoading")?.classList.remove("hidden");

    const { data, error } = await supabase.rpc("admin_analytics_summary", {
        p_days: PERIOD_DAYS[state.period],
    });

    $("analyticsLoading")?.classList.add("hidden");

    if (error) throw error;

    state.data = data ?? { totals: {}, daily: [] };
    renderTotals();
    drawCharts();
}

function renderTotals() {
    const totals = state.data.totals ?? {};

    setText("analyticsUsers", numberFormat.format(totals.users ?? 0));
    setText("analyticsStudents", numberFormat.format(totals.students ?? 0));
    setText("analyticsLandlords", numberFormat.format(totals.landlords ?? 0));
    setText("analyticsListings", numberFormat.format(totals.listings ?? 0));
    setText("analyticsBookings", numberFormat.format(totals.bookings ?? 0));
    setText("analyticsActivity", numberFormat.format(totals.active_users ?? 0));
    setText("analyticsRevenue", "Coming soon");

    const daily = state.data.daily ?? [];
    const hasActivity = daily.some((day) => day.users || day.listings || day.bookings);
    $("analyticsEmpty")?.classList.toggle("hidden", hasActivity);
}

/* ---------- Charts ---------- */

function seriesFrom(key) {
    return (state.data.daily ?? []).map((day) => ({ day: day.day, value: Number(day[key] ?? 0) }));
}

function clearChart(container) {
    if (container) container.replaceChildren();
}

function axisLabels(points) {
    if (points.length === 0) return [];
    const first = points[0].day;
    const last = points[points.length - 1].day;
    return [
        { x: PAD, text: dayFormat.format(new Date(`${first}T00:00:00`)), anchor: "start" },
        { x: WIDTH - PAD, text: dayFormat.format(new Date(`${last}T00:00:00`)), anchor: "end" },
    ];
}

function drawGrid(svg, maxValue) {
    for (let i = 0; i <= 3; i += 1) {
        const y = PAD + ((HEIGHT - 2 * PAD) * i) / 3;
        svg.append(svgEl("line", { x1: PAD, x2: WIDTH - PAD, y1: y, y2: y, class: "chart-grid" }));

        const value = Math.round(maxValue - (maxValue * i) / 3);
        const label = svgEl("text", { x: PAD - 6, y: y + 4, class: "chart-axis", "text-anchor": "end" });
        label.textContent = numberFormat.format(value);
        svg.append(label);
    }
}

function drawAxisLabels(svg, points) {
    axisLabels(points).forEach((item) => {
        const text = svgEl("text", { x: item.x, y: HEIGHT - 8, class: "chart-axis", "text-anchor": item.anchor });
        text.textContent = item.text;
        svg.append(text);
    });
}

function drawLine(container, points, color) {
    clearChart(container);
    if (!container) return;

    const svg = svgEl("svg", { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: "chart-svg", role: "img" });
    const maxValue = Math.max(1, ...points.map((point) => point.value));
    drawGrid(svg, maxValue);

    if (points.length > 0) {
        const xFor = (index) =>
            points.length === 1 ? WIDTH / 2 : PAD + ((WIDTH - 2 * PAD) * index) / (points.length - 1);
        const yFor = (value) => HEIGHT - PAD - ((HEIGHT - 2 * PAD) * value) / maxValue;

        const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index)},${yFor(point.value)}`).join(" ");
        const base = HEIGHT - PAD;
        const area = `${line} L${xFor(points.length - 1)},${base} L${xFor(0)},${base} Z`;

        svg.append(svgEl("path", { d: area, fill: color, "fill-opacity": ".15" }));
        svg.append(svgEl("path", { d: line, fill: "none", stroke: color, "stroke-width": "2.5", "stroke-linejoin": "round" }));

        points.forEach((point, index) => {
            svg.append(svgEl("circle", { cx: xFor(index), cy: yFor(point.value), r: "3", fill: color }));
        });
    }

    drawAxisLabels(svg, points);
    container.append(svg);
}

function drawBars(container, points, color) {
    clearChart(container);
    if (!container) return;

    const svg = svgEl("svg", { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: "chart-svg", role: "img" });
    const maxValue = Math.max(1, ...points.map((point) => point.value));
    drawGrid(svg, maxValue);

    if (points.length > 0) {
        const slot = (WIDTH - 2 * PAD) / points.length;
        const barWidth = Math.max(2, slot * 0.7);

        points.forEach((point, index) => {
            const height = ((HEIGHT - 2 * PAD) * point.value) / maxValue;
            svg.append(
                svgEl("rect", {
                    x: PAD + slot * index + (slot - barWidth) / 2,
                    y: HEIGHT - PAD - height,
                    width: barWidth,
                    height: Math.max(height, point.value > 0 ? 2 : 0),
                    rx: "2",
                    fill: color,
                })
            );
        });
    }

    drawAxisLabels(svg, points);
    container.append(svg);
}

function drawCharts() {
    if (!state.data) return;
    drawLine($("userGrowthChart"), seriesFrom("users"), "#3FD0FF");
    drawLine($("listingGrowthChart"), seriesFrom("listings"), "#5BA0FF");
    drawBars($("bookingChart"), seriesFrom("bookings"), "#2F7BFF");
}

/* ---------- Export ---------- */

function csvCell(value) {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function exportAnalytics() {
    if (!state.data) return;

    const totals = state.data.totals ?? {};
    const header = ["Date", "New users", "New listings", "Bookings"].map(csvCell).join(",");
    const rows = (state.data.daily ?? []).map((day) =>
        [day.day, day.users, day.listings, day.bookings].map(csvCell).join(",")
    );
    const summary = [
        ["Total users", totals.users],
        ["Students", totals.students],
        ["Landlords", totals.landlords],
        ["Published listings", totals.listings],
        ["Bookings in period", totals.bookings],
        ["Active users (30 days)", totals.active_users],
    ].map(([label, value]) => [label, value ?? 0].map(csvCell).join(","));

    const csv = [
        ["Measure", "Value"].map(csvCell).join(","),
        ...summary,
        "",
        header,
        ...rows,
    ].join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `analytics-${state.period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast(`Exported ${PERIOD_LABEL[state.period]}.`, { type: "success" });
}

/* ---------- Events and entry point ---------- */

function bindEvents() {
    $("analyticsFilterForm")?.addEventListener("submit", (event) => event.preventDefault());

    $("analyticsPeriod")?.addEventListener("change", (event) => {
        state.period = event.target.value;
        loadAnalytics().catch(showLoadError);
    });

    $("exportAnalyticsBtn")?.addEventListener("click", exportAnalytics);

    let resizeTimer = null;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(drawCharts, 150);
    });
}

function showLoadError(error) {
    console.error("[admin_analytics] could not load analytics:", error);
    $("analyticsLoading")?.classList.add("hidden");
    showToast(error.message || "Analytics could not be loaded.", { type: "error" });
}

export function init() {
    initPageModule({ area: "admin", page: "admin_analytics" });
    state.period = $("analyticsPeriod")?.value || "month";
    bindEvents();
    loadAnalytics().catch(showLoadError);
}