import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";
import { watchTables } from "../../core/realtime.js";

/* =========================================
   ADMIN LISTINGS
   Admins see every listing, view it, and approve or reject
   listings waiting for review. Approve and reject call
   approve_listing / reject_listing in the database.
========================================= */

const PAGE_SIZE = 5;
const PLACEHOLDER = "../assets/images/placeholder-room.jpg";

const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

/* Labels in the page's dropdowns mapped to database status values */
const STATUS_FILTER = {
    Approved: "published",
    Pending: "pending_review",
    Suspended: "archived",
};

const STATUS_BADGE = {
    published: { label: "Approved", className: "active" },
    pending_review: { label: "Pending", className: "pending" },
    draft: { label: "Draft", className: "pending" },
    archived: { label: "Suspended", className: "suspended" },
};

const state = {
    listings: [],
    search: "",
    status: "",
    type: "",
    region: "",
    page: 1,
};

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function regionOf(listing) {
    return listing.universities?.location || "";
}

function firstImage(listing) {
    const images = [...(listing.listing_images ?? [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return images[0]?.image_url || PLACEHOLDER;
}

/* ---------- Data ---------- */

async function loadListings() {
    const { data, error } = await supabase
        .from("listings")
        .select("id, title, area, price, property_type, publication_status, created_at, universities(location), listing_images(image_url, display_order)")
        .order("created_at", { ascending: false });

    if (error) throw error;
    state.listings = data ?? [];
}

function renderStats() {
    const count = (status) => state.listings.filter((listing) => listing.publication_status === status).length;

    setText("totalListings", state.listings.length);
    setText("approvedListings", count("published"));
    setText("pendingListings", count("pending_review"));
    /* No featured flag exists in the database yet, so this stays blank. */
    setText("featuredListings", "");
}

function renderRegionOptions() {
    const select = $("listingState");
    if (!select) return;

    const keep = select.value;
    const regions = [...new Set(state.listings.map(regionOf).filter(Boolean))].sort();

    select.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All States";
    select.append(all);

    regions.forEach((region) => {
        const option = document.createElement("option");
        option.value = region;
        option.textContent = region;
        select.append(option);
    });

    select.value = regions.includes(keep) ? keep : "";
}

/* ---------- Filtering ---------- */

function filteredListings() {
    const wantedStatus = STATUS_FILTER[state.status] ?? "";

    return state.listings.filter((listing) => {
        if (wantedStatus && listing.publication_status !== wantedStatus) return false;
        if (state.type && listing.property_type !== state.type) return false;
        if (state.region && regionOf(listing) !== state.region) return false;

        if (state.search) {
            const haystack = [listing.title, listing.area, regionOf(listing)].filter(Boolean).join(" ").toLowerCase();
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

function imageCell(listing) {
    const td = document.createElement("td");
    const img = document.createElement("img");
    img.className = "admin-listing-thumb";
    img.src = firstImage(listing);
    img.onerror = () => {
        img.onerror = null;
        img.src = PLACEHOLDER;
    };
    img.alt = listing.title || "Listing photo";
    td.append(img);
    return td;
}

function statusCell(listing) {
    const td = document.createElement("td");
    const meta = STATUS_BADGE[listing.publication_status] ?? { label: listing.publication_status, className: "pending" };

    const badge = document.createElement("span");
    badge.className = `status-badge ${meta.className}`;
    badge.textContent = meta.label;

    td.append(badge);
    return td;
}

const EYE_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`;

function iconButton(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-btn";
    button.dataset.action = action;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = EYE_ICON;
    return button;
}

function textButton(label, className, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.action = action;
    button.textContent = label;
    return button;
}

function actionsCell(listing) {
    const td = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "admin-actions";

    wrap.append(iconButton("View listing", "view"));

    if (listing.publication_status === "pending_review") {
        wrap.append(
            textButton("Approve", "btn btn-primary btn-sm", "approve"),
            textButton("Reject", "btn btn-outline btn-sm", "reject")
        );
    }

    td.append(wrap);
    return td;
}

function createRow(listing) {
    const row = document.createElement("tr");
    row.dataset.listingId = listing.id;

    row.append(
        imageCell(listing),
        cell(listing.title || "Untitled listing"),
        cell(listing.area || "—"),
        cell(listing.price != null ? naira.format(listing.price) : ""),
        statusCell(listing),
        actionsCell(listing)
    );
    return row;
}

function renderTable() {
    const body = $("listingTableBody");
    const empty = $("noListingsFound");
    if (!body) return;

    const rows = filteredListings();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);

    const start = (state.page - 1) * PAGE_SIZE;
    body.replaceChildren(...rows.slice(start, start + PAGE_SIZE).map(createRow));

    if (empty) empty.classList.toggle("hidden", rows.length > 0);
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
    const nav = $("listingPagination");
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

/* ---------- Actions ---------- */

function listingById(id) {
    return state.listings.find((listing) => listing.id === id);
}

async function approve(listing, button) {
    if (!confirm(`Approve "${listing.title}"? It will then be visible to students.`)) return;

    button.disabled = true;
    const { error } = await supabase.rpc("approve_listing", { p_listing_id: listing.id });

    if (error) {
        button.disabled = false;
        showToast(error.message || "This listing could not be approved.", { type: "error" });
        return;
    }

    showToast("Listing approved.", { type: "success" });
    await refresh();
}

async function reject(listing, button) {
    const reason = window.prompt(`Why are you rejecting "${listing.title}"? The landlord will see this reason.`);
    if (reason === null) return;
    if (!reason.trim()) {
        showToast("A reason is required to reject a listing.", { type: "error" });
        return;
    }

    button.disabled = true;
    const { error } = await supabase.rpc("reject_listing", {
        p_listing_id: listing.id,
        p_reason: reason.trim(),
    });

    if (error) {
        button.disabled = false;
        showToast(error.message || "This listing could not be rejected.", { type: "error" });
        return;
    }

    showToast("Listing sent back to the landlord.", { type: "success" });
    await refresh();
}

function viewListing(listing) {
    window.location.href = `../general/room_details.htm?id=${encodeURIComponent(listing.id)}`;
}

async function refresh() {
    await loadListings();
    renderStats();
    renderRegionOptions();
    renderTable();
}

/* ---------- Live updates ---------- */

let stopLiveListings = null;

function startLiveListings() {
    if (stopLiveListings) return;

    stopLiveListings = watchTables("admin-listings", [{ table: "listings" }], () => refresh());
}

/* ---------- Events ---------- */

function bindEvents() {
    $("listingTableBody")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;

        const listing = listingById(button.closest("tr")?.dataset.listingId);
        if (!listing) return;

        if (button.dataset.action === "view") viewListing(listing);
        if (button.dataset.action === "approve") approve(listing, button);
        if (button.dataset.action === "reject") reject(listing, button);
    });

    $("listingPagination")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");
        if (!button || button.disabled) return;

        state.page = Number(button.dataset.page);
        renderTable();
    });

    $("listingFilterForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        state.search = ($("listingSearch")?.value ?? "").trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("listingSearch")?.addEventListener("input", (event) => {
        state.search = event.target.value.trim().toLowerCase();
        state.page = 1;
        renderTable();
    });

    $("listingStatus")?.addEventListener("change", (event) => {
        state.status = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("propertyType")?.addEventListener("change", (event) => {
        state.type = event.target.value;
        state.page = 1;
        renderTable();
    });

    $("listingState")?.addEventListener("change", (event) => {
        state.region = event.target.value;
        state.page = 1;
        renderTable();
    });
}

/* ---------- Entry point ---------- */

export function init() {
    initPageModule({ area: "admin", page: "admin_listings" });
    bindEvents();

    refresh().catch((error) => {
        console.error("[admin_listings] could not load listings:", error);
        showToast("Listings could not be loaded.", { type: "error" });
    });
    startLiveListings();
}