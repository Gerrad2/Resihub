import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";
import { watchTables } from "../../core/realtime.js";

/* =========================================
   ADMIN STUDENTS
   Student table for admin/admin_students.htm.
   Emails come from admin_student_emails(), which
   only returns rows to an administrator.
   Read-only for now: suspending needs an
   account_status column and an admin function.
========================================= */

const PAGE_SIZE = 10;

const STATUS_LABEL = {
    active: "Active",
    suspended: "Suspended",
    pending: "Pending",
};

const shortDate = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" });

const state = {
    students: [],
    emails: new Map(),
    search: "",
    statusFilter: "",
    courseFilter: "",
    page: 1,
    open: null,
};

function $(id) {
    return document.getElementById(id);
}

function statusOf(student) {
    return (student.account_status || "active").toLowerCase();
}

function courseOf(student) {
    return student.department || student.faculty || "";
}

/* ---------- Data ---------- */

async function loadStudents() {
    // Whole row, like the access guard, so a missing optional column cannot break the page.
    const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "student")
        .order("created_at", { ascending: false });

    if (error) throw error;
    state.students = data ?? [];
}

async function loadEmails() {
    const { data, error } = await supabase.rpc("admin_student_emails");
    if (error) throw error;

    state.emails = new Map((data ?? []).map((row) => [row.id, row.email]));
}

function renderCourseOptions() {
    const select = $("studentCourse");
    if (!select) return;

    const courses = [...new Set(state.students.map(courseOf).filter(Boolean))].sort();
    const keep = select.value;

    select.replaceChildren();

    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All Courses";
    select.append(all);

    courses.forEach((course) => {
        const option = document.createElement("option");
        option.value = course;
        option.textContent = course;
        select.append(option);
    });

    select.value = courses.includes(keep) ? keep : "";
}

/* ---------- Filtering and paging ---------- */

function filteredStudents() {
    return state.students.filter((student) => {
        if (state.statusFilter && statusOf(student) !== state.statusFilter) return false;
        if (state.courseFilter && courseOf(student) !== state.courseFilter) return false;

        if (state.search) {
            const haystack = [
                student.full_name,
                state.emails.get(student.id),
                courseOf(student),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            if (!haystack.includes(state.search)) return false;
        }
        return true;
    });
}

function pageCount(total) {
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/* ---------- Table ---------- */

function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
}

function statusCell(student) {
    const td = document.createElement("td");
    const status = statusOf(student);

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

function createRow(student) {
    const row = document.createElement("tr");
    row.dataset.studentId = student.id;

    const actions = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "admin-actions";
    wrap.append(iconButton("fa-eye", "View student details", "view"));
    actions.append(wrap);

    row.append(
        cell(student.full_name || "Student"),
        cell(state.emails.get(student.id) || "—"),
        cell(courseOf(student) || "—"),
        statusCell(student),
        actions
    );
    return row;
}

function renderTable() {
    const body = $("studentTableBody");
    const empty = $("noStudentsFound");
    if (!body) return;

    const rows = filteredStudents();
    const pages = pageCount(rows.length);
    state.page = Math.min(state.page, pages);

    const start = (state.page - 1) * PAGE_SIZE;
    const visible = rows.slice(start, start + PAGE_SIZE);

    body.replaceChildren(...visible.map(createRow));

    if (empty) empty.classList.toggle("hidden", rows.length > 0);

    const end = start + visible.length;
    const count = $("studentCount");
    if (count) {
        count.textContent = rows.length
            ? `Showing ${start + 1}–${end} of ${rows.length} students`
            : "";
    }

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
    const nav = $("studentPagination");
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

/* ---------- Details panel ---------- */

function buildPanel() {
    if ($("studentDetailsModal")) return;

    const modal = document.createElement("div");
    modal.id = "studentDetailsModal";
    modal.className = "modal hidden";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title" id="studentPanelTitle">Student details</h2>
                <button type="button" class="modal-close" id="studentPanelClose" aria-label="Close">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="modal-body" id="studentPanelBody"></div>
        </div>
    `;
    document.body.append(modal);

    $("studentPanelClose").addEventListener("click", closePanel);
    modal.addEventListener("click", (event) => {
        if (event.target === modal) closePanel();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && state.open) closePanel();
    });
}

function closePanel() {
    $("studentDetailsModal")?.classList.add("hidden");
    state.open = null;
}

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

function openPanel(student) {
    buildPanel();
    state.open = student.id;

    $("studentPanelTitle").textContent = student.full_name || "Student details";

    $("studentPanelBody").replaceChildren(
        detailRow("Email", state.emails.get(student.id)),
        detailRow("Status", STATUS_LABEL[statusOf(student)] ?? statusOf(student)),
        detailRow("University", student.university),
        detailRow("Faculty", student.faculty),
        detailRow("Course", courseOf(student)),
        detailRow("Matric number", student.matric_number),
        detailRow("Level", student.level),
        detailRow("State", student.state),
        detailRow("Phone", student.phone),
        detailRow("Joined", student.created_at ? shortDate.format(new Date(student.created_at)) : "—")
    );

    $("studentDetailsModal").classList.remove("hidden");
}

/* ---------- Events ---------- */

function bindEvents() {
    $("studentTableBody")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action='view']");
        if (!button) return;

        const studentId = button.closest("tr")?.dataset.studentId;
        const student = state.students.find((item) => item.id === studentId);
        if (student) openPanel(student);
    });

    $("studentPagination")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");
        if (!button || button.disabled) return;

        state.page = Number(button.dataset.page);
        renderTable();
    });

    $("studentFilterForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        state.search = ($("studentSearch")?.value ?? "").trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("studentSearch")?.addEventListener("input", (event) => {
        state.search = event.target.value.trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("studentStatus")?.addEventListener("change", (event) => {
        state.statusFilter = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("studentCourse")?.addEventListener("change", (event) => {
        state.courseFilter = event.target.value;
        state.page = 1;
        renderTable();
    });
}

/* ---------- Live updates ---------- */

function startLiveStudents() {
    watchTables(
        "admin-students",
        [{ table: "profiles", filter: "role=eq.student" }],
        () => refreshStudents()
    );
}

// Reloads the list, and the open student's details if that panel is showing
async function refreshStudents() {
    await loadStudents();
    renderCourseOptions();
    renderTable();

    const openId = state.open;
    if (!openId) return;

    const student = state.students.find((item) => item.id === openId);
    if (student) {
        openPanel(student);
    } else {
        closePanel();
    }
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_students" });
    bindEvents();

    loadStudents()
        .then(() => {
            renderCourseOptions();
            renderTable();
        })
        .catch((error) => {
            console.error("[admin_students] could not load students:", error);
            showToast("Students could not be loaded.", { type: "error" });
        });

    loadEmails()
        .then(() => renderTable())
        .catch((error) => {
            console.error("[admin_students] could not load emails:", error);
        });
    startLiveStudents();
}