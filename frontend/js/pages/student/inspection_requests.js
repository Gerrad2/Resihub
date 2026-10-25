import { getCurrentUser, getStudentBookings } from "../../api.js";
import { formatDateTime, showError } from "../../student_utils.js";

const $ = (id) => document.getElementById(id);

const DEFAULT_ROOM = "../assets/images/placeholder-room.jpg";

const KIND = {
    upcoming: { label: "Upcoming", className: "ir-upcoming" },
    completed: { label: "Completed", className: "ir-completed" },
    overdue: { label: "Overdue", className: "ir-overdue" },
};

let inspections = [];
let activeFilter = "all";
let calendarMonth = startOfMonth(new Date());

export async function init() {
    bindEvents();
    renderCalendar();

    const userResult = await getCurrentUser();
    const user = userResult.success ? userResult.data : null;
    if (!user) return;

    const result = await getStudentBookings(user.id);

    if (!result.success) {
        showError("Your inspections could not be loaded.");
        return;
    }

    inspections = buildInspections(result.data ?? []);

    updateCounts();
    render();
    renderCalendar();
    renderNext();
}

function bindEvents() {
    document.querySelectorAll("[data-inspection-tab]").forEach((tab) => {
        tab.addEventListener("click", () => {
            activeFilter = tab.dataset.inspectionTab;

            document.querySelectorAll("[data-inspection-tab]").forEach((other) => {
                other.classList.toggle("active", other === tab);
            });

            render();
        });
    });

    $("calPrev")?.addEventListener("click", () => {
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
        renderCalendar();
    });

    $("calNext")?.addEventListener("click", () => {
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
        renderCalendar();
    });
}

/* Only bookings that have an inspection date, and are not rejected or cancelled */
function buildInspections(bookings) {
    const now = new Date();

    return bookings
        .filter((b) => b.inspection_date && b.status !== "rejected" && b.status !== "cancelled")
        .map((b) => {
            const when = new Date(b.inspection_date);
            const past = when < now;

            let kind;
            if (!past) {
                kind = "upcoming";
            } else if (b.status === "approved") {
                kind = "completed";
            } else {
                kind = "overdue";
            }

            return { ...b, when, kind };
        })
        .sort((a, b) => a.when - b.when);
}

function countKind(kind) {
    return inspections.filter((i) => i.kind === kind).length;
}

function updateCounts() {
    setText("inspectionAllCount", inspections.length);
    setText("inspectionUpcomingCount", countKind("upcoming"));
    setText("inspectionCompletedCount", countKind("completed"));
    setText("inspectionOverdueCount", countKind("overdue"));
}

function render() {
    const list = $("inspectionRequests");
    const items = activeFilter === "all" ? inspections : inspections.filter((i) => i.kind === activeFilter);

    list?.replaceChildren(...items.map((item) => createRow(item)));

    $("emptyInspection")?.classList.toggle("hidden", inspections.length > 0);
}

function createRow(item) {
    const listing = item.listings ?? {};
    const kind = KIND[item.kind];

    const row = document.createElement("article");
    row.className = "ir-row";

    const image = document.createElement("img");
    image.src = roomImage(listing);
    image.alt = listing.title || "Room photo";

    const info = document.createElement("div");
    info.className = "ir-info";

    const title = document.createElement("h3");
    title.textContent = listing.title || "Room";

    const room = document.createElement("p");
    room.textContent = listing.property_type || listing.universities?.name || "";

    const when = document.createElement("p");
    when.textContent = formatDateTime(item.inspection_date);

    info.append(title, room, when);

    const badge = document.createElement("span");
    const isPendingUpcoming = item.kind === "upcoming" && item.status === "pending";
    badge.className = `ir-status ${isPendingUpcoming ? "ir-pending" : kind.className}`;
    badge.textContent = isPendingUpcoming ? "Pending" : kind.label;

    const link = document.createElement("a");
    link.className = "ir-chevron";
    link.href = `../general/room_details.htm?id=${encodeURIComponent(item.listing_id)}`;
    link.setAttribute("aria-label", "View room");

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-chevron-right";
    icon.setAttribute("aria-hidden", "true");
    link.append(icon);

    row.append(image, info, badge, link);
    return row;
}

/* Next upcoming inspection card */
function renderNext() {
    const card = $("nextInspection");
    if (!card) return;

    const next = inspections.find((i) => i.kind === "upcoming");
    card.replaceChildren();

    const heading = document.createElement("h2");
    heading.textContent = "Next Inspection";
    card.append(heading);

    if (!next) {
        const empty = document.createElement("p");
        empty.textContent = "No upcoming inspection is scheduled.";
        card.append(empty);
        return;
    }

    const listing = next.listings ?? {};

    const body = document.createElement("div");
    body.className = "ir-next-body";

    const image = document.createElement("img");
    image.src = roomImage(listing);
    image.alt = listing.title || "Room photo";

    const title = document.createElement("h3");
    title.textContent = listing.title || "Room";

    const when = document.createElement("p");
    when.textContent = formatDateTime(next.inspection_date);

    const view = document.createElement("a");
    view.className = "ir-view";
    view.href = `../general/room_details.htm?id=${encodeURIComponent(next.listing_id)}`;
    view.textContent = "View Details";

    body.append(image, title, when, view);
    card.append(body);
}

/* Month calendar: marks the days that have an inspection */
function renderCalendar() {
    const grid = $("inspectionCalendar");
    if (!grid) return;

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();

    setText(
        "calTitle",
        calendarMonth.toLocaleDateString("en-NG", { month: "long", year: "numeric" })
    );

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    const inspectionDays = new Set(
        inspections
            .filter((i) => i.when.getFullYear() === year && i.when.getMonth() === month)
            .map((i) => i.when.getDate())
    );

    const cells = [];

    for (let i = 0; i < firstWeekday; i++) {
        const blank = document.createElement("span");
        blank.className = "ir-day";
        cells.push(blank);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement("span");
        cell.className = "ir-day";
        cell.textContent = day;

        if (inspectionDays.has(day)) cell.classList.add("has-inspection");

        if (
            today.getFullYear() === year &&
            today.getMonth() === month &&
            today.getDate() === day
        ) {
            cell.classList.add("is-today");
        }

        cells.push(cell);
    }

    grid.replaceChildren(...cells);
}

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
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