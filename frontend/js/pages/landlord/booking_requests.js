import { getCurrentUser, updateBookingStatus, supabase } from "../../api.js";
import { showError } from "../../student_utils.js";
import { showToast } from "../../ui/toast.js";

const $ = (id) => document.getElementById(id);

const DEFAULT_AVATAR = "../assets/images/default-avatar.png";

const STATUS = {
    pending: { label: "Pending", className: "lb-pending" },
    approved: { label: "Confirmed", className: "lb-confirmed" },
    completed: { label: "Completed", className: "lb-completed" },
    rejected: { label: "Rejected", className: "lb-cancelled" },
    cancelled: { label: "Cancelled", className: "lb-cancelled" },
};

const CONFIRM = {
    approved: "Approve this booking? The student will be notified and you will be able to message each other.",
    rejected: "Reject this booking? The student will be notified.",
    completed: "Mark this stay as completed? The student will then be able to review the room.",
};

let me = null;
let bookings = [];

export async function init() {
    bindEvents();

    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;

    if (!me) {
        showError("Please sign in to manage your bookings.");
        return;
    }

    await loadBookings();
}

function bindEvents() {
    $("bookingSearch")?.addEventListener("input", render);
    $("bookingStatus")?.addEventListener("change", render);
    $("bookingProperty")?.addEventListener("change", render);
}

async function loadBookings() {
    const { data, error } = await supabase
        .from("booking_requests")
        .select(`
            id,
            status,
            created_at,
            inspection_date,
            student_id,
            listing_id,
            listings(id, title, area, price, listing_images(image_url, display_order)),
            student:profiles!booking_requests_student_id_fkey(full_name, avatar_url)
        `)
        .eq("landlord_id", me.id)
        .order("created_at", { ascending: false });

    if (error) {
        showError("Your bookings could not be loaded.");
        return;
    }

    bookings = data ?? [];

    populatePropertyFilter();
    render();
}

/* One entry per room that has bookings */
function populatePropertyFilter() {
    const select = $("bookingProperty");
    if (!select) return;

    const rooms = new Map();
    for (const booking of bookings) {
        if (booking.listing_id && !rooms.has(booking.listing_id)) {
            rooms.set(booking.listing_id, booking.listings?.title || "Room");
        }
    }

    select.replaceChildren(
        new Option("All properties", ""),
        ...[...rooms.entries()].map(([id, title]) => new Option(title, id))
    );
}

function visibleBookings() {
    const status = $("bookingStatus")?.value ?? "";
    const property = $("bookingProperty")?.value ?? "";
    const query = ($("bookingSearch")?.value ?? "").trim().toLowerCase();

    return bookings.filter((booking) => {
        const listing = booking.listings ?? {};
        const text = [booking.student?.full_name, listing.title, listing.area]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        const matchesStatus = !status || booking.status === status;
        const matchesProperty = !property || booking.listing_id === property;
        const matchesQuery = !query || text.includes(query);

        return matchesStatus && matchesProperty && matchesQuery;
    });
}

function render() {
    const items = visibleBookings();
    const rows = $("bookingRows");

    if (rows) {
        if (items.length) {
            rows.replaceChildren(...items.map((booking) => createRow(booking)));
        } else {
            rows.replaceChildren(noMatchRow());
        }
    }

    const table = document.querySelector(".lb-table-card");
    const hasAny = bookings.length > 0;

    table?.classList.toggle("hidden", !hasAny);
    $("emptyBookings")?.classList.toggle("hidden", hasAny);

    renderStats();
    renderRecent();
}

function createRow(booking) {
    const listing = booking.listings ?? {};
    const status = STATUS[booking.status] ?? { label: booking.status, className: "lb-pending" };

    const row = document.createElement("tr");

    // Student
    const studentCell = document.createElement("td");
    const person = document.createElement("div");
    person.className = "lb-person";

    const avatar = document.createElement("img");
    avatar.src = booking.student?.avatar_url || DEFAULT_AVATAR;
    avatar.alt = "";

    const name = document.createElement("strong");
    name.textContent = booking.student?.full_name || "Student";

    person.append(avatar, name);
    studentCell.append(person);

    // Property
    const propertyCell = document.createElement("td");
    const property = document.createElement("div");
    property.className = "lb-property";

    const title = document.createElement("strong");
    title.textContent = listing.title || "Room";

    const area = document.createElement("span");
    area.textContent = listing.area || "";

    property.append(title, area);
    propertyCell.append(property);

    // Date
    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(booking.created_at);

    // Status
    const statusCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `lb-status ${status.className}`;
    badge.textContent = status.label;
    statusCell.append(badge);

    // Actions
    const actionCell = document.createElement("td");
    actionCell.append(actionsFor(booking));

    row.append(studentCell, propertyCell, dateCell, statusCell, actionCell);
    return row;
}

function actionsFor(booking) {
    const box = document.createElement("div");
    box.className = "lb-actions";

    if (booking.status === "pending") {
        box.append(
            actionButton("Approve", "lb-btn lb-approve", () => changeStatus(booking, "approved", box)),
            actionButton("Reject", "lb-btn lb-reject", () => changeStatus(booking, "rejected", box))
        );
    } else if (booking.status === "approved") {
        box.append(
            actionButton("Mark completed", "lb-btn lb-complete", () => changeStatus(booking, "completed", box))
        );
    } else {
        const none = document.createElement("span");
        none.className = "lb-none";
        none.textContent = "No action";
        box.append(none);
    }

    return box;
}

function actionButton(label, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

async function changeStatus(booking, nextStatus, box) {
    if (!confirm(CONFIRM[nextStatus])) return;

    const buttons = box.querySelectorAll("button");
    buttons.forEach((button) => (button.disabled = true));

    const result = await updateBookingStatus(booking.id, nextStatus);

    if (!result.success) {
        buttons.forEach((button) => (button.disabled = false));
        showToast("Could not update this booking. Please try again.", { type: "error" });
        return;
    }

    booking.status = nextStatus;

    const messages = {
        approved: "Booking approved.",
        rejected: "Booking rejected.",
        completed: "Stay marked as completed.",
    };
    showToast(messages[nextStatus], { type: "success" });

    render();
}

function noMatchRow() {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "lb-none";
    cell.textContent = "No bookings match these filters.";
    row.append(cell);
    return row;
}

/* Donut and legend: confirmed includes completed, cancelled includes rejected */
function renderStats() {
    const total = bookings.length;
    const confirmed = countStatus(["approved", "completed"]);
    const pending = countStatus(["pending"]);
    const cancelled = countStatus(["rejected", "cancelled"]);

    setText("statTotal", total);
    setText("statConfirmed", confirmed);
    setText("statPending", pending);
    setText("statCancelled", cancelled);

    const donut = $("bookingDonut");
    if (!donut) return;

    if (!total) {
        donut.style.background = "conic-gradient(rgba(92, 150, 255, .2) 0 100%)";
        return;
    }

    const confirmedEnd = (confirmed / total) * 100;
    const pendingEnd = confirmedEnd + (pending / total) * 100;

    donut.style.background =
        `conic-gradient(#22C55E 0 ${confirmedEnd}%, #F59E0B ${confirmedEnd}% ${pendingEnd}%, #EF4444 ${pendingEnd}% 100%)`;
}

function renderRecent() {
    const list = $("recentBookings");
    if (!list) return;

    const recent = bookings.slice(0, 4).map((booking) => {
        const item = document.createElement("div");
        item.className = "lb-recent-item";

        const avatar = document.createElement("img");
        avatar.src = booking.student?.avatar_url || DEFAULT_AVATAR;
        avatar.alt = "";

        const text = document.createElement("div");
        text.style.minWidth = "0";

        const name = document.createElement("strong");
        name.textContent = booking.student?.full_name || "Student";

        const room = document.createElement("span");
        room.textContent = booking.listings?.title || "Room";

        text.append(name, room);
        item.append(avatar, text);
        return item;
    });

    list.replaceChildren(...recent);

    if (!recent.length) {
        const empty = document.createElement("p");
        empty.className = "lb-none";
        empty.textContent = "No bookings yet.";
        list.append(empty);
    }
}

function countStatus(statuses) {
    return bookings.filter((booking) => statuses.includes(booking.status)).length;
}

function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}