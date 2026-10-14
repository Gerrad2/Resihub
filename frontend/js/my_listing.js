// js/my_listing.js

import {
    getCurrentUser,
    getLandlordListings,
    deleteListing
} from "./core/api.js";

import { showToast } from "./ui/toast.js";

let listings = [];

const form =
    document.getElementById("listingFilterForm");

const search =
    document.getElementById("listingSearch");

const status =
    document.getElementById("listingStatus");

const sort =
    document.getElementById("listingSort");

const grid =
    document.getElementById("myListingsGrid");

const empty =
    document.getElementById("emptyListings");

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function money(value) {
    return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function imageOf(listing) {
    return (
        listing.listing_images?.sort(
            (a, b) =>
                (a.display_order ?? 0) -
                (b.display_order ?? 0)
        )[0]?.image_url ||
        "../assets/images/placeholder-room.jpg"
    );
}

async function init() {
    const userResult =
        await getCurrentUser();

    if (!userResult.success || !userResult.data) {
        window.location.href =
            "../auth/landlord_login.htm";
        return;
    }

    const result =
        await getLandlordListings(
            userResult.data.id
        );

    if (!result.success) {
        showToast("Unable to load listings.", {
            type: "error"
        });
        return;
    }

    listings = result.data;

    form?.addEventListener(
        "submit",
        event => event.preventDefault()
    );

    search?.addEventListener(
        "input",
        render
    );

    status?.addEventListener(
        "change",
        render
    );

    sort?.addEventListener(
        "change",
        render
    );

    render();
}

function render() {
    let result = [...listings];

    const query =
        search.value.trim().toLowerCase();

    if (query) {
        result = result.filter(listing =>
            `${listing.title} ${listing.area}`
                .toLowerCase()
                .includes(query)
        );
    }

    if (status.value) {
        result = result.filter(listing => {
            const publication =
                listing.publication_status;

            const availability =
                listing.availability_status;

            if (status.value === "draft") {
                return publication === "draft";
            }

            if (status.value === "pending") {
                return publication === "pending";
            }

            if (status.value === "active") {
                return (
                    publication === "published" &&
                    availability === "available"
                );
            }

            if (status.value === "booked") {
                return availability === "reserved";
            }

            return true;
        });
    }

    if (sort.value === "oldest") {
        result.sort(
            (a, b) =>
                new Date(a.created_at) -
                new Date(b.created_at)
        );
    }

    if (sort.value === "price") {
        result.sort(
            (a, b) =>
                Number(a.price || 0) -
                Number(b.price || 0)
        );
    }

    if (!result.length) {
        grid.innerHTML = "";
        empty?.classList.remove("hidden");
        return;
    }

    empty?.classList.add("hidden");

    grid.innerHTML = result.map(listing => `
        <article class="listing-card">
            <div class="listing-image">
                <img
                    src="${escapeHtml(imageOf(listing))}"
                    alt="${escapeHtml(listing.title)}"
                    loading="lazy"
                >
            </div>

            <div class="listing-card-content">
                <span class="property-badge">
                    ${escapeHtml(
        listing.publication_status || "draft"
    )}
                </span>

                <h3>${escapeHtml(listing.title)}</h3>

                <p>
                    <i class="fa-solid fa-location-dot"></i>
                    ${escapeHtml(listing.area)}
                </p>

                <strong>${money(listing.price)}</strong>

                <div class="listing-card-actions">
                    <a
                        href="../landlord/listing_details.htm?id=${listing.id}"
                        class="btn-outline"
                    >
                        View
                    </a>

                    <a
                        href="../landlord/edit_listing.htm?id=${listing.id}"
                        class="btn-primary"
                    >
                        Edit
                    </a>

                    <button
                        type="button"
                        class="btn-danger"
                        data-delete="${listing.id}"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </article>
    `).join("");

    grid.querySelectorAll("[data-delete]").forEach(button => {
        button.addEventListener(
            "click",
            () => removeListing(button.dataset.delete)
        );
    });
}

async function removeListing(id) {
    const listing =
        listings.find(item =>
            String(item.id) === String(id)
        );

    if (!listing) return;

    if (
        !window.confirm(
            `Delete "${listing.title}"? This cannot be undone.`
        )
    ) {
        return;
    }

    const result =
        await deleteListing(id);

    if (!result.success) {
        showToast("Unable to delete listing.", {
            type: "error"
        });
        return;
    }

    listings =
        listings.filter(
            item => String(item.id) !== String(id)
        );

    showToast(
        "Listing deleted successfully.",
        { type: "success" }
    );

    render();
}

init();