
const PLACEHOLDER_IMAGE = "../assets/images/placeholder-room.jpg";

/**
 * Format a Naira price for display.
 *
 * Returns a friendly fallback when the listing has no price set,
 * rather than showing "₦NaN" or an empty string.
 *
 * @param {number|string|null} price
 * @returns {string}
 */
export function formatPrice(price) {
    const amount = Number(price);

    if (!Number.isFinite(amount)) {
        return "Price on request";
    }

    return `₦${amount.toLocaleString("en-NG")}`;
}

/**
 * Resolve the best image URL for a listing.
 *
 * listing_images is joined in from Supabase and may be empty,
 * unordered, or missing entirely - all of that is handled here
 * so callers never need to think about it.
 *
 * @param {Object} listing
 * @returns {string}
 */
export function getListingImageUrl(listing) {
    const images = listing?.listing_images;

    if (!Array.isArray(images) || images.length === 0) {
        return PLACEHOLDER_IMAGE;
    }

    const sorted = [...images].sort(
        (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );

    return sorted[0]?.image_url || PLACEHOLDER_IMAGE;
}

/**
 * Human-friendly label for a property_type value.
 *
 * @param {string} propertyType
 * @returns {string}
 */
function formatPropertyType(propertyType) {
    if (!propertyType) {
        return "Property";
    }

    return propertyType
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

/**
 * Build a single property card element.
 *
 * Uses safe DOM APIs (textContent) throughout - no innerHTML with
 * untrusted listing data.
 *
 * @param {Object} listing
 * @returns {HTMLElement}
 */
export function createListingCard(listing) {
    const card = document.createElement("a");
    card.className = "property-card";
    card.href = `../general/room_details.htm?id=${encodeURIComponent(listing.id)}`;

    const imageWrap = document.createElement("div");
    imageWrap.className = "property-image";

    const image = document.createElement("img");
    image.src = getListingImageUrl(listing);
    image.alt = listing.title || "Student accommodation";
    image.loading = "lazy";

    imageWrap.append(image);

    const content = document.createElement("div");
    content.className = "property-content";

    const title = document.createElement("h3");
    title.className = "property-title";
    title.textContent = listing.title || "Untitled listing";

    const location = document.createElement("p");
    location.className = "property-location";

    const locationIcon = document.createElement("i");
    locationIcon.className = "fa-solid fa-location-dot";
    locationIcon.setAttribute("aria-hidden", "true");

    const locationText = document.createElement("span");
    const universityName = listing.universities?.name;
    locationText.textContent = universityName
        ? `${listing.area || ""}${listing.area ? ", " : ""}${universityName}`
        : listing.area || "Location not specified";

    location.append(locationIcon, locationText);

    const price = document.createElement("p");
    price.className = "property-price";
    price.textContent = formatPrice(listing.price);

    const features = document.createElement("div");
    features.className = "property-features";

    const typeFeature = document.createElement("span");
    typeFeature.className = "property-feature";
    typeFeature.textContent = formatPropertyType(listing.property_type);
    features.append(typeFeature);

    const amenities = listing.amenities;

    if (amenities && typeof amenities === "object") {
        Object.entries(amenities)
            .filter(([, enabled]) => Boolean(enabled))
            .slice(0, 2)
            .forEach(([key]) => {
                const pill = document.createElement("span");
                pill.className = "property-feature";
                pill.textContent = key.charAt(0).toUpperCase() + key.slice(1);
                features.append(pill);
            });
    }

    const footer = document.createElement("div");
    footer.className = "property-footer";

    const badge = document.createElement("span");
    const status = listing.availability_status === "available"
        ? "available"
        : "booked";
    badge.className = `status-badge ${status}`;
    badge.textContent = status === "available" ? "Available" : "Booked";

    footer.append(badge);

    content.append(title, location, price, features, footer);
    card.append(imageWrap, content);

    return card;
}

/**
 * Render a list of listings into a container.
 *
 * Handles the empty case gracefully instead of leaving a blank
 * section - callers pass an emptyMessage suited to their context.
 *
 * @param {HTMLElement} container
 * @param {Array} listings
 * @param {Object} options
 * @param {string} [options.emptyMessage]
 */
export function renderListingCards(container, listings, options = {}) {
    if (!container) {
        return;
    }

    const {
        emptyMessage = "No properties found.",
    } = options;

    container.replaceChildren();

    if (!Array.isArray(listings) || listings.length === 0) {
        const empty = document.createElement("p");
        empty.className = "listings-empty-message";
        empty.textContent = emptyMessage;

        container.append(empty);

        return;
    }

    const fragment = document.createDocumentFragment();

    listings.forEach((listing) => {
        fragment.append(createListingCard(listing));
    });

    container.append(fragment);
}