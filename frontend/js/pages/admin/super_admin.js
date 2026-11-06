import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   SUPER ADMIN (design 20)
   Overview for Super Admins only. Anyone else sees an access notice
   and no figures. The database checks access again on every call.
========================================= */

const numberFormat = new Intl.NumberFormat("en-NG");

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function showContent(allowed) {
    $("superAdminContent")?.classList.toggle("hidden", !allowed);
    $("superAccessDenied")?.classList.toggle("hidden", allowed);
}

async function checkAccess() {
    const { data, error } = await supabase.rpc("am_i_super_admin");
    if (error) throw error;
    return data === true;
}

async function loadProfile() {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

    setText("superName", profile?.full_name || user.email || "Super Administrator");
    setText("superEmail", user.email || "—");
}

async function loadFigures() {
    const [roles, analytics] = await Promise.all([
        supabase.rpc("admin_roles_overview"),
        supabase.rpc("admin_analytics_summary", { p_days: 365 }),
    ]);

    if (roles.error) throw roles.error;
    if (analytics.error) throw analytics.error;

    const overview = (roles.data ?? [])[0] ?? {};
    const totals = analytics.data?.totals ?? {};

    setText("totalUsers", numberFormat.format(totals.users ?? 0));
    setText("listingCount", numberFormat.format(totals.listings ?? 0));
    setText("totalBookings", numberFormat.format(totals.bookings ?? 0));
    setText("totalRevenue", "Coming soon");

    setText("adminCount", numberFormat.format(overview.admin_count ?? 0));
    setText("studentCount", numberFormat.format(totals.students ?? 0));
    setText("landlordCount", numberFormat.format(totals.landlords ?? 0));
}

export function init() {
    initPageModule({ area: "admin", page: "super_admin" });

    checkAccess()
        .then((allowed) => {
            showContent(allowed);
            if (!allowed) return null;
            return Promise.all([loadProfile(), loadFigures()]);
        })
        .catch((error) => {
            console.error("[super_admin] could not load the page:", error);
            showToast("The Super Admin overview could not be loaded.", { type: "error" });
        });
}