import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";

/* =========================================
   ADMIN DASHBOARD
   Fills the figures, usage ring and recent
   activity shown on admin/admin_dashboard.htm.
   Loaded automatically by app.js.
========================================= */

const DAY_MS = 24 * 60 * 60 * 1000;
const numberFormat = new Intl.NumberFormat("en-NG");

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function windowStart(daysAgo) {
    return new Date(Date.now() - daysAgo * DAY_MS).toISOString();
}

/* Count rows in a table, optionally narrowed by `scope`. */
async function count(table, scope = (query) => query) {
    const query = scope(supabase.from(table).select("id", { count: "exact", head: true }));
    const { count: total, error } = await query;

    if (error) throw error;

    return total ?? 0;
}

/* Total rows, rows created in the last 30 days, and rows in the 30 days before that. */
async function trend(table) {
    const recentStart = windowStart(30);
    const previousStart = windowStart(60);

    const [total, recent, previous] = await Promise.all([
        count(table),
        count(table, (query) => query.gte("created_at", recentStart)),
        count(table, (query) => query.gte("created_at", previousStart).lt("created_at", recentStart)),
    ]);

    return { total, recent, previous };
}

function renderChange(id, recent, previous) {
    const el = $(id);
    if (!el) return;

    el.classList.remove("up", "down", "flat");

    if (previous === 0 && recent === 0) {
        el.textContent = "No new activity in 30 days";
        el.classList.add("flat");
        return;
    }

    if (previous === 0) {
        el.textContent = "New in the last 30 days";
        el.classList.add("up");
        return;
    }

    const percent = Math.round(((recent - previous) / previous) * 100);
    const sign = percent > 0 ? "+" : "";

    el.textContent = `${sign}${percent}% vs previous 30 days`;
    el.classList.add(percent > 0 ? "up" : percent < 0 ? "down" : "flat");
}

function showUnavailable(ids) {
    ids.forEach((id) => setText(id, "\u2014"));
}

/* ---------- Admin name ---------- */

async function loadAdminName() {
    try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;

        if (!user) return;

        const { data, error } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();

        if (error) throw error;

        const firstName = data?.full_name?.trim().split(/\s+/)[0];
        setText("adminName", firstName || "Admin");
    } catch (error) {
        console.warn("Could not load the administrator name:", error);
    }
}

/* ---------- Key figures ---------- */

async function loadStats() {
    try {
        const [users, listings, bookings] = await Promise.all([
            trend("profiles"),
            trend("listings"),
            trend("booking_requests"),
        ]);

        setText("totalUsers", numberFormat.format(users.total));
        renderChange("totalUsersChange", users.recent, users.previous);

        setText("listingCount", numberFormat.format(listings.total));
        renderChange("listingCountChange", listings.recent, listings.previous);

        setText("bookingCount", numberFormat.format(bookings.total));
        renderChange("bookingCountChange", bookings.recent, bookings.previous);

        // Revenue stays empty until payments exist (e.g. landlord verification fees).
        setText("revenueCount", "");
        setText("revenueChange", "");
    } catch (error) {
        console.error("Could not load dashboard figures:", error);
        showUnavailable(["totalUsers", "listingCount", "bookingCount"]);
        ["totalUsersChange", "listingCountChange", "bookingCountChange"].forEach((id) => {
            setText(id, "Could not load");
        });
    }
}

/* ---------- Platform usage ring ---------- */

async function loadUsage() {
    try {
        const statuses = ["published", "pending_review", "draft", "archived"];
        const [published, pending, draft, archived] = await Promise.all(
            statuses.map((status) =>
                count("listings", (query) => query.eq("publication_status", status))
            )
        );

        const total = published + pending + draft + archived;
        const percent = total ? Math.round((published / total) * 100) : 0;

        setText("platformUsagePercent", `${percent}%`);
        setText("usagePublished", numberFormat.format(published));
        setText("usageDraft", numberFormat.format(draft));
        setText("usageArchived", numberFormat.format(archived));
        setUsagePending(pending);

        $("platformUsageRing")?.style.setProperty("--usage", `${percent}%`);
    } catch (error) {
        console.error("Could not load platform usage:", error);
        setText("platformUsagePercent", "\u2014");
        showUnavailable(["usagePublished", "usageDraft", "usageArchived"]);
    }
}

/* Adds a "Pending review" line to the usage legend after Published.
   Built here so the HTML does not need changing. Rebuilt on each load. */
function setUsagePending(value) {
    const legend = document.querySelector(".usage-legend");
    if (!legend) return;

    legend.querySelector("[data-usage='pending']")?.remove();

    const item = document.createElement("li");
    item.dataset.usage = "pending";

    const dot = document.createElement("span");
    dot.className = "dot dot-pending";

    const strong = document.createElement("strong");
    strong.textContent = numberFormat.format(value);

    item.append(dot, " Pending review ", strong);
    legend.insertBefore(item, legend.children[1] ?? null);
}

/* ---------- Recent activity ---------- */

function activityItem({ icon, text, at }) {
    const item = document.createElement("li");
    item.className = "activity-item";

    const iconBox = document.createElement("span");
    iconBox.className = "activity-icon";
    iconBox.setAttribute("aria-hidden", "true");

    const glyph = document.createElement("i");
    glyph.className = `fa-solid ${icon}`;
    iconBox.append(glyph);

    const label = document.createElement("span");
    label.className = "activity-text";
    label.textContent = text;

    const time = document.createElement("time");
    time.className = "activity-time";
    time.dateTime = at;
    time.textContent = timeAgo(at);

    item.append(iconBox, label, time);
    return item;
}

function timeAgo(iso) {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;

    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

async function loadActivity() {
    const list = $("recentActivity");
    if (!list) return;

    try {
        const [users, listings, bookings] = await Promise.all([
            supabase.from("profiles").select("full_name, role, created_at").order("created_at", { ascending: false }).limit(5),
            supabase.from("listings").select("title, publication_status, created_at").order("created_at", { ascending: false }).limit(5),
            supabase.from("booking_requests").select("status, created_at").order("created_at", { ascending: false }).limit(5),
        ]);

        [users, listings, bookings].forEach((result) => {
            if (result.error) throw result.error;
        });

        const items = [
            ...users.data.map((user) => ({
                icon: "fa-user-plus",
                text: `New ${user.role} registered: ${user.full_name || "Unnamed user"}`,
                at: user.created_at,
            })),
            ...listings.data.map((listing) => ({
                icon: "fa-house",
                text: `Listing "${listing.title}" is ${listing.publication_status}`,
                at: listing.created_at,
            })),
            ...bookings.data.map((booking) => ({
                icon: "fa-calendar-check",
                text: `Booking request ${booking.status}`,
                at: booking.created_at,
            })),
        ]
            .sort((a, b) => new Date(b.at) - new Date(a.at))
            .slice(0, 6);

        list.replaceChildren();

        if (!items.length) {
            const empty = document.createElement("li");
            empty.className = "activity-empty";
            empty.textContent = "No recent activity yet.";
            list.append(empty);
            return;
        }

        items.forEach((item) => list.append(activityItem(item)));
    } catch (error) {
        console.error("Could not load recent activity:", error);
        list.replaceChildren();

        const failed = document.createElement("li");
        failed.className = "activity-empty";
        failed.textContent = "Recent activity could not be loaded.";
        list.append(failed);
    }
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_dashboard" });

    Promise.allSettled([loadAdminName(), loadStats(), loadUsage(), loadActivity()]);
}