import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN ROLES AND PERMISSIONS (design 14)
   Two fixed roles. Super Admin always has every permission.
   The Admin role's permissions can be changed by a Super Admin only.
========================================= */

const state = {
    matrix: [],
    canEdit: false,
};

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
}

/* ---------- Data ---------- */

async function loadOverview() {
    const { data, error } = await supabase.rpc("admin_roles_overview");
    if (error) throw error;

    const row = (data ?? [])[0] ?? {};
    setText("totalAdmins", row.admin_count ?? 0);
    setText("totalRoles", 2);
    setText("permissionCount", `${row.granted_permissions ?? 0} of ${row.total_permissions ?? 0}`);

    const body = $("rolesTable");
    if (!body) return;

    const adminRow = document.createElement("tr");
    adminRow.append(
        cell("Admin"),
        cell(String(row.admin_count ?? 0)),
        cell(`${row.granted_permissions ?? 0} of ${row.total_permissions ?? 0} permissions`)
    );

    const superRow = document.createElement("tr");
    superRow.append(
        cell("Super Admin"),
        cell(String(row.super_admin_count ?? 0)),
        cell("All permissions (fixed)")
    );

    body.replaceChildren(superRow, adminRow);
}

async function loadMatrix() {
    const { data, error } = await supabase.rpc("admin_permission_matrix");
    if (error) throw error;

    state.matrix = data ?? [];
    state.canEdit = state.matrix.length > 0 && state.matrix[0].can_edit === true;
    renderMatrix();

    setText(
        "editNotice",
        state.canEdit
            ? "You can change the Admin permissions."
            : "Only a Super Admin can change the Admin permissions. You can view them here."
    );
}

/* ---------- Permission matrix ---------- */

function renderMatrix() {
    const container = $("permissionMatrix");
    if (!container) return;

    const groups = new Map();
    state.matrix.forEach((item) => {
        const category = item.category || "General";
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(item);
    });

    const cards = [...groups.entries()].map(([category, items]) => {
        const card = document.createElement("section");
        card.className = "perm-group glass-card";

        const title = document.createElement("h3");
        title.textContent = category;
        card.append(title);

        items.forEach((item) => {
            const row = document.createElement("label");
            row.className = "perm-row";

            const text = document.createElement("span");
            text.textContent = item.permission_label;

            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = item.granted === true;
            box.disabled = !state.canEdit;
            box.dataset.permissionId = item.permission_id;
            box.setAttribute("aria-label", item.permission_label);

            row.append(text, box);
            card.append(row);
        });

        return card;
    });

    container.replaceChildren(...cards);
}

async function changePermission(box) {
    const permissionId = box.dataset.permissionId;
    const granted = box.checked;
    box.disabled = true;

    const { error } = await supabase.rpc("admin_set_admin_permission", {
        p_permission_id: permissionId,
        p_granted: granted,
    });

    box.disabled = !state.canEdit;

    if (error) {
        console.error("[admin_roles_permissions] change failed:", error);
        box.checked = !granted;
        showToast(error.message || "The permission could not be changed.", { type: "error" });
        return;
    }

    const item = state.matrix.find((entry) => entry.permission_id === permissionId);
    if (item) item.granted = granted;

    showToast(granted ? "Permission added to Admin." : "Permission removed from Admin.", { type: "success" });
    await loadOverview();
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_roles_permissions" });

    $("permissionMatrix")?.addEventListener("change", (event) => {
        const box = event.target.closest("input[type='checkbox'][data-permission-id]");
        if (box && state.canEdit) changePermission(box);
    });

    Promise.all([loadOverview(), loadMatrix()]).catch((error) => {
        console.error("[admin_roles_permissions] could not load roles:", error);
        showToast("Roles and permissions could not be loaded.", { type: "error" });
    });
}