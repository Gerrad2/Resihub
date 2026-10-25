import { getCurrentUser, getFavorites, removeFavorite } from "../../api.js";
import { showError } from "../../student_utils.js";
import { showToast } from "../../ui/toast.js";

const $ = (id) => document.getElementById(id);
const DEFAULT_ROOM = "../assets/images/placeholder-room.jpg";

const money = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
});

let me = null;
let saved = [];
let filter = "all";

export async function init() {
    bindEvents();

    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;

    if (!me) {
        showError("Please sign in to see your saved properties.");
        return;
    }

    const result = await getFavorites(me.id);

    if (!result.success) {
        showError("Your saved properties could not be loaded.");
        saved = [];
    } else {
        saved = result.data ?? [];
    }

    updateCounts();
    render();
}

function bindEvents() {
    document.querySelectorAll("[data-saved-tab]").forEach((tab) => {
        tab.addEventListener("click", () => {
            filter = tab.dataset.savedTab;
            render();
        });
    });

    $("clearSavedBtn")?.addEventListener("click", clearAll);
}

function listingOf(row) {
    return row.listings ?? {};
}

function listingIdOf(row) {
    return row.listing_id ?? listingOf(row).id;
}

function statusOf(row) {
    return listingOf(row).availability_status ?? "";
}

function updateCounts() {
    setText("savedAllCount", saved.length);
    setText("savedAvailableCount", saved.filter((r) => statusOf(r) === "available").length);
    setText("savedBookedCount", saved.filter((r) => statusOf(r) === "booked").length);
}

function visible() {
    if (filter === "available") return saved.filter((r) => statusOf(r) === "available");
    if (filter === "booked") return saved.filter((r) => statusOf(r) === "booked");
    return saved;
}

function render() {
    const items = visible();

    $("savedListings")?.replaceChildren(...items.map((row) => createCard(row)));
    $("emptySaved")?.classList.toggle("hidden", saved.length > 0);

    document.querySelectorAll("[data-saved-tab]").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.savedTab === filter);
    });

    $("clearSavedBtn")?.classList.toggle("hidden", saved.length === 0);
}

function createCard(row) {
    const listing = listingOf(row);
    const listingId = listingIdOf(row);

    const card = document.createElement("article");
    card.className = "sv-card";

    const media = document.createElement("div");
    media.className = "sv-media";

    const image = document.createElement("img");
    image.src = roomImage(listing);
    image.alt = listing.title || "Room photo";

    const heart = document.createElement("button");
    heart.type = "button";
    heart.className = "sv-heart";
    heart.setAttribute("aria-label", "Remove from saved");
    heart.innerHTML = '<i class="fa-solid fa-heart" aria-hidden="true"></i>';
    heart.addEventListener("click", () => removeOne(listingId, heart));

    media.append(image, heart);

    const body = document.createElement("div");
    body.className = "sv-body";

    const title = document.createElement("h3");
    title.className = "sv-title";
    title.textContent = listing.title || "Room";

    const price = document.createElement("p");
    price.className = "sv-price";
    price.textContent = listing.price != null ? `${money.format(listing.price)}` : "Price on request";
    if (listing.price != null) {
        const per = document.createElement("span");
        per.textContent = "/month";
        price.append(per);
    }

    const place = document.createElement("p");
    place.className = "sv-place";
    const pin = document.createElement("i");
    pin.className = "fa-solid fa-location-dot";
    pin.setAttribute("aria-hidden", "true");
    place.append(pin, listing.universities?.name || listing.area || "");

    const foot = document.createElement("div");
    foot.className = "sv-foot";

    const status = document.createElement("span");
    const state = statusOf(row);
    status.className = `sv-status ${state === "available" ? "sv-available" : state === "booked" ? "sv-booked" : "sv-other"}`;
    status.textContent = state ? capitalise(state) : "Unavailable";

    const view = document.createElement("a");
    view.className = "sv-view";
    view.href = `../general/room_details.htm?id=${encodeURIComponent(listingId)}`;
    view.textContent = "View";

    foot.append(status, view);
    body.append(title, price, place, foot);

    card.append(media, body);
    return card;
}

async function removeOne(listingId, button) {
    button.disabled = true;

    const result = await removeFavorite(me.id, listingId);

    if (!result.success) {
        button.disabled = false;
        showToast("Could not remove this property. Please try again.", { type: "error" });
        return;
    }

    saved = saved.filter((row) => listingIdOf(row) !== listingId);
    showToast("Removed from saved properties.", { type: "success" });

    updateCounts();
    render();
}

async function clearAll() {
    if (!saved.length) return;

    const confirmed = confirm("Remove all saved properties? This cannot be undone.");
    if (!confirmed) return;

    const button = $("clearSavedBtn");
    button.disabled = true;

    const results = await Promise.all(
        saved.map((row) => removeFavorite(me.id, listingIdOf(row)))
    );

    button.disabled = false;

    const failed = results.filter((r) => !r.success).length;
    saved = saved.filter((row, index) => !results[index].success);

    if (failed) {
        showToast(`${failed} could not be removed. Please try again.`, { type: "error" });
    } else {
        showToast("All saved properties removed.", { type: "success" });
    }

    updateCounts();
    render();
}

function roomImage(listing) {
    const images = [...(listing.listing_images ?? [])].sort(
        (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );
    return images[0]?.image_url || DEFAULT_ROOM;
}

function capitalise(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}