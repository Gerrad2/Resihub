import { supabase } from "../../api.js";
import { initPageModule } from "../page-module.js";
import { showToast } from "../../ui/toast.js";

/* =========================================
   ADMIN LISTINGS
   Matches the approved design (screen 9).
   Admins see every listing and approve or reject
   the ones waiting for review. Approve and reject
   call approve_listing / reject_listing in the database.
========================================= */

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

function firstImage(listing) {
    const images = [...(listing.listing_images ?? [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return images[0]?.image_url || PLACEHOLDER;
}

/* ---------- Data ---------- */

async function loadListings() {
    const { data, error } = await supabase
        .from("listings")
        .select("id, title, area, state, price, property_type, publication_status, created_at, listing_images(image_url, display_order)")
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

function renderFilters() {
    const regionSelect = $("listingState");
    if (regionSelect) {
        const keep = regionSelect.value;
        const regions = [...new Set(state.listings.map((listing) => listing.state).filter(Boolean))].sort();

        regionSelect.replaceChildren();
        const all = document.createElement("option");
        all.value = "";
        all.textContent = "All States";
        regionSelect.append(all);

        regions.forEach((region) => {
            const option = document.createElement("option");
            option.value = region;
            option.textContent = region;
            regionSelect.append(option);
        });
        regionSelect.value = regions.includes(keep) ? keep : "";
    }
}

/* ---------- Filtering ---------- */

function filteredListings() {
    const wantedStatus = STATUS_FILTER[state.status] ?? "";

    return state.listings.filter((listing) => {
        if (wantedStatus && listing.publication_status !== wantedStatus) return false;
        if (state.type && listing.property_type !== state.type) return false;
        if (state.region && listing.state !== state.region) return false;

        if (state.search) {
            const haystack = [listing.title, listing.area, listing.state].filter(Boolean).join(" ").toLowerCase();
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

function actionButton(label, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

function actionsCell(listing, row) {
    const td = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "admin-actions";

    if (listing.publication_status === "pending_review") {
        wrap.append(
            actionButton("Approve", "btn btn-primary btn-sm", (event) => approve(listing, row, event.currentTarget)),
            actionButton("Reject", "btn btn-outline btn-sm", (event) => reject(listing, row, event.currentTarget))
        );
    } else {
        const note = document.createElement("span");
        note.className = "admin-listing-note";
        note.textContent = "—";
        wrap.append(note);
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
        actionsCell(listing, row)
    );
    return row;
}

function renderTable() {
    const body = $("listingTableBody");
    const empty = $("noListingsFound");
    if (!body) return;

    const rows = filteredListings();
    body.replaceChildren(...rows.map(createRow));

    if (empty) empty.classList.toggle("hidden", rows.length > 0);
}

/* ---------- Actions ---------- */

async function approve(listing, row, button) {
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

async function reject(listing, row, button) {
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

async function refresh() {
    await loadListings();
    renderStats();
    renderFilters();
    renderTable();
}

/* ---------- Events ---------- */

function bindEvents() {
    $("listingTableBody")?.addEventListener("click", () => { });

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
}