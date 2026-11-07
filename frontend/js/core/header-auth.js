import { getCurrentUser, getProfile } from "../api.js";

const DASHBOARDS = {
    student: "../student/dashboard_student.htm",
    landlord: "../landlord/dashboard_landlord.htm",
    admin: "../admin/admin_dashboard.htm",
    super_admin: "../admin/admin_dashboard.htm",
};

/*
 * data-auth="guest" items are hidden when signed in.
 * data-auth="member" items are shown when signed in, and links point to the person's dashboard.
 */
export async function initHeaderAuth() {
    const userResult = await getCurrentUser();
    const user = userResult.success ? userResult.data : null;

    document.querySelectorAll('[data-auth="guest"]').forEach((el) => {
        el.hidden = Boolean(user);
    });

    document.querySelectorAll('[data-auth="member"]').forEach((el) => {
        el.hidden = !user;
    });

    if (!user) return;

    const profileResult = await getProfile(user.id);
    const role = profileResult.success ? profileResult.data?.role : null;
    const href = DASHBOARDS[role] ?? DASHBOARDS.student;

    document.querySelectorAll('a[data-auth="member"]').forEach((el) => {
        el.href = href;
    });
}