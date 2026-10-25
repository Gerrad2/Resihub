import { initPageModule } from "../page-module.js";
import { getListings, getUniversities } from "../../api.js";
import { renderListingCards } from "../../listings.js";
import { showToast } from "../../ui/toast.js";

const PAGE_SIZE = 12;

const state = {
    universities: [],
    listings: [],
    page: 1,
    hasMore: false,
    loading: false,
};

const $ = (id) => document.getElementById(id);

export function init() {
    initPageModule({ area: "general", page: "browse_rooms" });
    bindEvents();
    loadPage();
}

async function loadPage() {
    await loadUniversities();
    applyUrlParams();
    await fetchListings();
}

function bindEvents() {
    $("filterForm")?.addEventListener("change", () => fetchListings());
    $("sortBy")?.addEventListener("change", render);
    $("loadMoreBtn")?.addEventListener("click", () => fetchListings({ append: true }));

    // page.js resets the forms on this click, so refresh after it
    $("resetFilters")?.addEventListener("click", () => setTimeout(() => fetchListings(), 0));

    $("clearSearch")?.addEventListener("click", () => {
        $("filterForm")?.reset();
        $("browseSearchForm")?.reset();
        fetchListings();
    });
}

async function loadUniversities() {
    const result = await getUniversities();
    state.universities = result.success ? result.data ?? [] : [];

    const select = $("browseUniversity");
    state.universities.forEach((university) => {
        select?.append(new Option(university.name, university.id));
    });
}

function findUniversity(value) {
    const text = String(value).trim().toLowerCase();
    return state.universities.find(
        (university) => university.id === value || university.name?.toLowerCase() === text
    );
}

/* Read the search and filter fields into API arguments */
function readFilters() {
    const search = new FormData($("browseSearchForm"));
    const filters = new FormData($("filterForm"));
    const text = (data, key) => String(data.get(key) ?? "").trim();

    const university = text(search, "university");
    const budget = text(search, "maxBudget");
    const minPrice = text(filters, "minPrice");
    const maxPrice = text(filters, "maxPrice");
    const availability = text(filters, "availability");

    return {
        area: text(search, "area") || null,
        universityId: university ? findUniversity(university)?.id ?? null : null,
        propertyType: text(search, "propertyType") || null,
        minPrice: minPrice ? Number(minPrice) : null,
        maxPrice: maxPrice ? Number(maxPrice) : budget ? Number(budget) : null,
        availabilityStatus: availability === "booked" ? "booked" : "available",
        amenities: filters.getAll("amenities"),
    };
}

async function fetchListings({ append = false } = {}) {
    if (state.loading) return;
    state.loading = true;

    const pageToLoad = append ? state.page + 1 : 1;
    const { amenities, ...filters } = readFilters();

    const result = await getListings({ ...filters, page: pageToLoad, pageSize: PAGE_SIZE });

    state.loading = false;

    if (!result.success) {
        showToast("Rooms could not be loaded. Please try again.", { type: "error" });
        return;
    }

    const batch = result.data?.listings ?? [];
    state.listings = append ? [...state.listings, ...batch] : batch;
    state.page = pageToLoad;
    state.hasMore = batch.length === PAGE_SIZE;

    render();
}

/* Amenities and sorting are applied here, on the rooms already loaded */
function render() {
    const { amenities } = readFilters();

    const matching = state.listings.filter((listing) =>
        amenities.every((key) => Boolean(listing.amenities?.[key]))
    );

    const sorted = sortListings(matching, $("sortBy")?.value);

    if (sorted.length) {
        renderListingCards($("listingsContainer"), sorted);
    } else {
        $("listingsContainer")?.replaceChildren();
    }

    $("noListings")?.classList.toggle("hidden", sorted.length > 0);
    $("listingResults").textContent =
        sorted.length === 1 ? "Showing 1 result" : `Showing ${sorted.length} results`;
    $("loadMoreBtn")?.parentElement?.classList.toggle("hidden", !state.hasMore);
}

function sortListings(items, mode) {
    const copy = [...items];

    if (mode === "lowest") {
        copy.sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
    } else if (mode === "newest") {
        copy.sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));
    }

    return copy;
}

/* The page-module search form sends the visitor back here with its values in the URL */
function applyUrlParams() {
    const params = new URLSearchParams(location.search);

    const setValue = (id, value) => {
        const el = $(id);
        if (el && value) el.value = value;
    };

    setValue("browseArea", params.get("area"));
    setValue("browseType", params.get("propertyType"));
    setValue("browseBudget", params.get("maxBudget"));

    const university = params.get("university");
    if (university) {
        const match = findUniversity(university);
        if (match) $("browseUniversity").value = match.id;
    }

    setValue("minPrice", params.get("minPrice"));
    setValue("maxPrice", params.get("maxPrice"));
    setValue("availability", params.get("availability"));
    setValue("sortBy", params.get("sortBy"));

    params.getAll("amenities").forEach((key) => {
        const box = document.querySelector(`#filterForm input[name="amenities"][value="${key}"]`);
        if (box) box.checked = true;
    });
}