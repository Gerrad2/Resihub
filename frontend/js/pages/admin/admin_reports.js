import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN REPORTS (design 13)
   Generate a report for a date range, preview it, and download it as CSV.
   Each report is one database call, so every figure comes from the live data.
========================================= */

const REPORT_TITLES = {
    summary: "Platform Summary",
    users: "User Report",
    listings: "Listing Report",
    bookings: "Booking Report",
};

const state = {
    report: null,
    rows: [],
    from: null,
    to: null,
    generated: 0,
};

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

/* Local dates (yyyy-mm-dd) to the start and end of that day */
function rangeFromInputs() {
    const fromValue = $("reportFrom")?.value;
    const toValue = $("reportTo")?.value;

    if (!fromValue || !toValue) {
        showToast("Choose a start and end date.", { type: "error" });
        return null;
    }

    const from = new Date(`${fromValue}T00:00:00`);
    const to = new Date(`${toValue}T23:59:59.999`);

    if (from > to) {
        showToast("The start date must be before the end date.", { type: "error" });
        return null;
    }

    return { from: from.toISOString(), to: to.toISOString(), label: `${fromValue} to ${toValue}` };
}

/* ---------- Generate and preview ---------- */

async function generate(report) {
    const range = rangeFromInputs();
    if (!range) return;

    const button = document.querySelector(`[data-report="${report}"]`);
    if (button) button.disabled = true;

    const { data, error } = await supabase.rpc("admin_report_rows", {
        p_report: report,
        p_from: range.from,
        p_to: range.to,
    });

    if (button) button.disabled = false;

    if (error) {
        console.error("[admin_reports] could not generate report:", error);
        showToast(error.message || "The report could not be generated.", { type: "error" });
        return;
    }

    state.report = report;
    state.rows = data ?? [];
    state.from = range.from;
    state.to = range.to;
    state.generated += 1;
    setText("totalReports", state.generated);

    renderPreview(range.label);
    $("exportReportBtn").disabled = state.rows.length === 0;
}

function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
}

function renderPreview(rangeLabel) {
    setText("reportInformation", `${REPORT_TITLES[state.report]}: ${rangeLabel}`);

    const body = $("reportDetails");
    if (!body) return;

    body.replaceChildren(
        ...state.rows.map((row) => {
            const tr = document.createElement("tr");
            tr.append(cell(row.section), cell(row.label), cell(row.value));
            return tr;
        })
    );

    $("reportPreview")?.classList.remove("hidden");
}

/* ---------- Export ---------- */

function csvCell(value) {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function exportReport() {
    if (!state.rows.length) {
        showToast("Generate a report first.", { type: "error" });
        return;
    }

    const lines = [
        ["Section", "Measure", "Value"].map(csvCell).join(","),
        ...state.rows.map((row) => [row.section, row.label, row.value].map(csvCell).join(",")),
    ];

    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const day = new Date().toISOString().slice(0, 10);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.report}-report-${day}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast("Report downloaded.", { type: "success" });
}

/* ---------- Setup ---------- */

function setDefaultRange() {
    const today = new Date();
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const iso = (date) => date.toLocaleDateString("en-CA");

    if ($("reportTo")) $("reportTo").value = iso(today);
    if ($("reportFrom")) $("reportFrom").value = iso(monthAgo);
}

function bindEvents() {
    $("reportsGrid")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-report]");
        if (!button || button.disabled) return;
        generate(button.dataset.report);
    });

    $("reportFilterForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        if (state.report) generate(state.report);
    });

    $("exportReportBtn")?.addEventListener("click", exportReport);
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_reports" });
    setDefaultRange();
    bindEvents();
    setText("totalReports", 0);
    $("exportReportBtn").disabled = true;
}