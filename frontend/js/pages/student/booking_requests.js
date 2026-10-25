import { getCurrentUser, getStudentBookings } from "../../api.js";
import { formatDateTime, showError } from "../../student_utils.js";

const $ = (id) => document.getElementById(id);

const DEFAULT_ROOM = "../assets/images/placeholder-room.jpg";

const STATUS = {
    pending: { label: "Pending", className: "status-pending" },
    approved: { label: "Approved", className: "status-approved" },
    rejected: { label: "Rejected", className: "status-rejected" },
    cancelled: { label: "Cancelled", className: "status-rejected" },
};

let bookings = [];

export async function init() {
    bindEvents();

    const userResult = await getCurrentUser();
    const user = userResult.success ? userResult.data : null;
    if (!user) return;

    const result = await getStudentBookings(user.id);

    if (!result.success) {
        showError("Your booking requests could not be loaded.");
        return;
    }

    bookings = result.data ?? [];
    updateCounts();
    render();
}

function bindEvents() {
    $("bookingSearch")?.addEventListener("input", render);
    $("bookingStatus")?.addEventListener("change", render);
    $("bookingFilterForm")?.addEventListener("submit", (event) => event.preventDefault());

    document.querySelectorAll("[data-booking-tab]").forEach((tab) => {
        tab.addEventListener("click", () => {
            $("bookingStatus").value = tab.dataset.bookingTab;

            document.querySelectorAll("[data-booking-tab]").forEach((other) => {
                other.classList.toggle("active", other === tab);
            });

            render();
        });
    });
}

function countByStatus(status) {
    return status ? bookings.filter((b) => b.status === status).length : bookings.length;
}

function updateCounts() {
    setText("allCount", countByStatus(""));
    setText("pendingCount", countByStatus("pending"));
    setText("approvedCount", countByStatus("approved"));
    setText("rejectedCount", countByStatus("rejected"));
}

function visibleBookings() {
    const status = $("bookingStatus").value;
    const query = $("bookingSearch").value.trim().toLowerCase();

    return bookings.filter((booking) => {
        const listing = booking.listings ?? {};
        const text = [listing.title, listing.area, listing.property_type, listing.universities?.name]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        const matchesStatus = !status || booking.status === status;
        const matchesQuery = !query || text.includes(query);

        return matchesStatus && matchesQuery;
    });
}

function render() {
    const items = visibleBookings();
    const container = $("bookingRequests");

    container.replaceChildren();

    if (items.length) {
        container.append(buildTable(items));
    }

    $("emptyBookings")?.classList.toggle("hidden", items.length > 0);
}

function buildTable(items) {
    const table = document.createElement("table");
    table.className = "booking-table";

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");

    ["Property", "Room", "Date Requested", "Status", "Actions"].forEach((label) => {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = label;
        headRow.append(th);
    });

    head.append(headRow);

    const body = document.createElement("tbody");
    body.append(...items.map((booking) => createRow(booking)));

    table.append(head, body);
    return table;
}

function createRow(booking) {
    const listing = booking.listings ?? {};
    const status = STATUS[booking.status] ?? { label: booking.status, className: "status-pending" };

    const row = document.createElement("tr");

    // Property: photo, title and university
    const property = document.createElement("td");
    const cell = document.createElement("div");
    cell.className = "property-cell";

    const image = document.createElement("img");
    image.src = roomImage(listing);
    image.alt = listing.title || "Room photo";

    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = listing.title || "Room";
    const place = document.createElement("span");
    place.textContent = listing.universities?.name || listing.area || "";

    text.append(title, place);
    cell.append(image, text);
    property.append(cell);

    // Status badge
    const statusCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `booking-status ${status.className}`;
    badge.textContent = status.label;
    statusCell.append(badge);

    // Action: open the room
    const actions = document.createElement("td");
    const view = document.createElement("a");
    view.className = "booking-view";
    view.href = `../general/room_details.htm?id=${encodeURIComponent(booking.listing_id)}`;
    view.textContent = "View";
    actions.append(view);

    row.append(
        property,
        textCell(listing.property_type || "—"),
        textCell(formatDateTime(booking.created_at)),
        statusCell,
        actions
    );

    return row;
}

function textCell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
}

function roomImage(listing) {
    const images = [...(listing.listing_images ?? [])].sort(
        (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );
    return images[0]?.image_url || DEFAULT_ROOM;
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}