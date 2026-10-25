import { getCurrentUser, supabase } from "./api.js";
import { showError } from "./student_utils.js";
import { showToast } from "./ui/toast.js";

const $ = (id) => document.getElementById(id);

const DEFAULT_ROOM = "../assets/images/placeholder-room.jpg";
const PAGE_SIZE = 9;

const money = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
});

const PUBLICATION = {
    published: { label: "Published", className: "published" },
    draft: { label: "Draft", className: "draft" },
    archived: { label: "Archived", className: "archived" },
};

const AVAILABILITY = {
    available: { label: "Available", className: "available" },
    booked: { label: "Booked", className: "booked" },
    unavailable: { label: "Unavailable", className: "unavailable" },
};

let me = null;
let listings = [];
let offset = 0;
let hasMore = true;
let loading = false;
let searchTimer = null;

export async function init() {
    bindEvents();

    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;

    if (!me) {
        showError("Please sign in to see your listings.");
        return;
    }

    await Promise.all([loadCounts(), loadPage(true)]);
    render();
}

function bindEvents() {
    $("listingFilterForm")?.addEventListener("submit", (event) => event.preventDefault());

    $("listingSearch")?.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => reload(), 300);
    });

    $("listingSort")?.addEventListener("change", () => reload());

    document.querySelectorAll("[data-listing-tab]").forEach((tab) => {
        tab.addEventListener("click", () => {
            $("listingStatus").value = tab.dataset.listingTab;
            reload();
        });
    });

    $("loadMoreListings")?.addEventListener("click", async () => {
        await loadPage(false);
        render();
    });
}

async function reload() {
    await loadPage(true);
    render();
}

/* Counts for the tabs and the side card, ignoring the current search */
async function loadCounts() {
    const [all, published, draft, archived] = await Promise.all([
        countFor(null),
        countFor("published"),
        countFor("draft"),
        countFor("archived"),
    ]);

    setText("listingAllCount", all);
    setText("listingPublishedCount", published);
    setText("listingDraftCount", draft);
    setText("listingArchivedCount", archived);

    setText("listingTotal", all);
    setText("sideLive", published);
    setText("sideDraft", draft);
    setText("sideArchived", archived);
}

async function countFor(status) {
    let query = supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("landlord_id", me.id);

    if (status) query = query.eq("publication_status", status);

    const { count, error } = await query;
    return error ? "—" : count ?? 0;
}

/* Loads one page using the current status, search and sort */
async function loadPage(reset) {
    if (loading) return;
    loading = true;

    if (reset) {
        listings = [];
        offset = 0;
        hasMore = true;
    }

    const status = $("listingStatus")?.value ?? "";
    const search = ($("listingSearch")?.value ?? "").trim();
    const sort = $("listingSort")?.value ?? "newest";

    let query = supabase
        .from("listings")
        .select(`
            id,
            title,
            price,
            area,
            availability_status,
            publication_status,
            created_at,
            universities(name),
            listing_images(image_url, display_order)
        `)
        .eq("landlord_id", me.id);

    if (status) query = query.eq("publication_status", status);
    if (search) query = query.ilike("title", `%${search}%`);

    query = applySort(query, sort);

    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);

    loading = false;

    if (error) {
        showToast("Your listings could not be loaded.", { type: "error" });
        return;
    }

    const rows = data ?? [];
    listings = listings.concat(rows);
    offset += rows.length;
    hasMore = rows.length === PAGE_SIZE;
}

function applySort(query, sort) {
    switch (sort) {
        case "oldest":
            return query.order("created_at", { ascending: true });
        case "price_high":
            return query.order("price", { ascending: false });
        case "price_low":
            return query.order("price", { ascending: true });
        case "title":
            return query.order("title", { ascending: true });
        default:
            return query.order("created_at", { ascending: false });
    }
}

function render() {
    const grid = $("myListingsGrid");
    if (grid) {
        grid.replaceChildren(...listings.map((listing) => createCard(listing)));
    }

    const status = $("listingStatus")?.value ?? "";
    document.querySelectorAll("[data-listing-tab]").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.listingTab === status);
    });

    $("emptyListings")?.classList.toggle("hidden", listings.length > 0);
    $("loadMoreListings")?.classList.toggle("hidden", !hasMore);
}

function createCard(listing) {
    const card = element("article", "ml-card-item");

    const media = element("div", "ml-media");

    const image = element("img");
    image.src = roomImage(listing);
    image.alt = listing.title || "Room photo";

    const badges = element("div", "ml-badges");

    const publication = PUBLICATION[listing.publication_status] ?? PUBLICATION.draft;
    const availability = AVAILABILITY[listing.availability_status] ?? AVAILABILITY.available;

    badges.append(
        element("span", `ml-tag ${publication.className}`, publication.label),
        element("span", `ml-tag ${availability.className}`, availability.label)
    );

    media.append(image, badges);

    const body = element("div", "ml-body");

    const title = element("h3", "ml-title", listing.title || "Room");

    const place = element("p", "ml-meta", listing.universities?.name || listing.area || "");

    const price = element("p", "ml-price");
    price.textContent = listing.price != null ? money.format(listing.price) : "Price on request";
    if (listing.price != null) {
        price.append(element("span", "", "/month"));
    }

    const actions = element("div", "ml-actions");

    const view = element("a", "ml-action", "View");
    view.href = `listing_details.htm?id=${encodeURIComponent(listing.id)}`;

    const edit = element("a", "ml-action primary", "Edit");
    edit.href = `edit_listing.htm?id=${encodeURIComponent(listing.id)}`;

    actions.append(view, edit);
    body.append(title, place, price, actions);

    card.append(media, body);
    return card;
}

function roomImage(listing) {
    const images = [...(listing.listing_images ?? [])].sort(
        (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );
    return images[0]?.image_url || DEFAULT_ROOM;
}

function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
}