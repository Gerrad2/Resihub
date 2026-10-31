import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN BOOKINGS
   Read-only booking list for admin/admin_bookings.htm,
   matching the approved design (screen 5).
   Landlords approve and reject. Admins view here.
   Needs sql: "admins read all bookings".
========================================= */

const PAGE_SIZE = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/* Labels follow the design: approved shows as Confirmed. */
const STATUS_LABEL = {
    pending: "Pending",
    approved: "Confirmed",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
};

const shortDate = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" });

const state = {
    bookings: [],
    search: "",
    statusFilter: "",
    rangeDays: 0,
    page: 1,
    open: null,
};

function $(id) {
    return document.getElementById(id);
}

function statusOf(booking) {
    return (booking.status || "pending").toLowerCase();
}

/* Short, readable booking code shown in the ID column, e.g. BK-3F9A2C */
function bookingCode(booking) {
    return `BK-${booking.id.slice(0, 6).toUpperCase()}`;
}

/* ---------- Data ---------- */

async function loadBookings() {
    const { data, error } = await supabase
        .from("booking_requests")
        .select(
            "id, status, message, inspection_date, created_at, " +
            "student:student_id ( full_name ), " +
            "listing:listing_id ( title, area )"
        )
        .order("created_at", { ascending: false });

    if (error) throw error;
    state.bookings = data ?? [];
}

/* ---------- Filtering ---------- */

function filteredBookings() {
    const cutoff = state.rangeDays ? Date.now() - state.rangeDays * DAY_MS : null;

    return state.bookings.filter((booking) => {
        if (state.statusFilter && statusOf(booking) !== state.statusFilter) return false;

        if (cutoff && new Date(booking.created_at).getTime() < cutoff) return false;

        if (state.search) {
            const haystack = [
                bookingCode(booking),
                booking.listing?.title,
                booking.student?.full_name,
            ]
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

function statusCell(booking) {
    const td = document.createElement("td");
    const status = statusOf(booking);

    const badge = document.createElement("span");
    badge.className = `status-badge ${status}`;
    badge.textContent = STATUS_LABEL[status] ?? status;

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

function createRow(booking) {
    const row = document.createElement("tr");
    row.dataset.bookingId = booking.id;

    const actions = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "admin-actions";
    wrap.append(
        iconButton("fa-eye", "View booking", "view"),
        iconButton("fa-copy", "Copy booking ID", "copy")
    );
    actions.append(wrap);

    row.append(
        cell(bookingCode(booking)),
        cell(booking.listing?.title || "—"),
        cell(booking.student?.full_name || "Student"),
        cell(""),
        statusCell(booking),
        actions
    );
    return row;
}

function renderTable() {
    const body = $("bookingTableBody");
    if (!body) return;

    const rows = filteredBookings();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);

    const start = (state.page - 1) * PAGE_SIZE;
    body.replaceChildren(...rows.slice(start, start + PAGE_SIZE).map(createRow));

    $("noBookingsFound")?.classList.toggle("hidden", rows.length > 0);
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
    const nav = $("bookingPagination");
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

function detailRow(label, value) {
    const group = document.createElement("div");
    group.className = "form-group";

    const title = document.createElement("label");
    title.textContent = label;

    const text = document.createElement("p");
    text.textContent = value || "—";

    group.append(title, text);
    return group;
}

function openDetails(booking) {
    state.open = booking.id;

    $("bookingDetails").replaceChildren(
        detailRow("Booking", bookingCode(booking)),
        detailRow("Status", STATUS_LABEL[statusOf(booking)] ?? statusOf(booking)),
        detailRow("Student", booking.student?.full_name),
        detailRow("Property", booking.listing?.title),
        detailRow("Area", booking.listing?.area),
        detailRow("Requested", booking.created_at ? shortDate.format(new Date(booking.created_at)) : "—"),
        detailRow("Inspection date", booking.inspection_date ? shortDate.format(new Date(booking.inspection_date)) : "—"),
        detailRow("Message", booking.message)
    );

    $("bookingModal").classList.remove("hidden");
}

function closeDetails() {
    $("bookingModal")?.classList.add("hidden");
    state.open = null;
}

async function copyBookingCode(booking) {
    try {
        await navigator.clipboard.writeText(bookingCode(booking));
        showToast(`Copied ${bookingCode(booking)}.`, { type: "success" });
    } catch (error) {
        console.error("[admin_bookings] copy failed:", error);
        showToast("The booking ID could not be copied.", { type: "error" });
    }
}

/* ---------- Events ---------- */

function bindEvents() {
    $("bookingTableBody")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;

        const bookingId = button.closest("tr")?.dataset.bookingId;
        const booking = state.bookings.find((item) => item.id === bookingId);
        if (!booking) return;

        if (button.dataset.action === "view") openDetails(booking);
        if (button.dataset.action === "copy") copyBookingCode(booking);
    });

    $("bookingPagination")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");
        if (!button || button.disabled) return;

        state.page = Number(button.dataset.page);
        renderTable();
    });

    $("bookingFilterForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        state.search = ($("bookingSearch")?.value ?? "").trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("bookingSearch")?.addEventListener("input", (event) => {
        state.search = event.target.value.trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("bookingStatus")?.addEventListener("change", (event) => {
        state.statusFilter = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("bookingDateRange")?.addEventListener("change", (event) => {
        state.rangeDays = Number(event.target.value) || 0;
        state.page = 1;
        renderTable();
    });

    $("closeBookingModal")?.addEventListener("click", closeDetails);

    $("bookingModal")?.addEventListener("click", (event) => {
        if (event.target === $("bookingModal")) closeDetails();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && state.open) closeDetails();
    });
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_bookings" });

    // Admins view bookings only. Landlords approve and reject.
    $("approveBooking")?.remove();
    $("rejectBooking")?.remove();

    bindEvents();

    loadBookings()
        .then(() => renderTable())
        .catch((error) => {
            console.error("[admin_bookings] could not load bookings:", error);
            showToast("Bookings could not be loaded.", { type: "error" });
        });
}