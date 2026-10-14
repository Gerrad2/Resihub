const STORAGE_PREFIX = "resihub:";

const STORAGE_KEYS = Object.freeze({
    THEME: "theme",
    RECENTLY_VIEWED: "recently-viewed",
});

const VALID_THEMES = new Set([
    "azure",
    "midnight",
    "emerald",
    "sunset",
    "lavender",
]);

const DEFAULT_THEME = "azure";

const MAX_RECENTLY_VIEWED = 10;

/**
 * Obtain localStorage safely.
 *
 * Browsers may deny access to localStorage because of:
 * - privacy settings
 * - restricted browsing modes
 * - storage quotas
 * - security policies
 *
 * @returns {Storage|null}
 */
function getStorage() {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        const storage = window.localStorage;

        if (!storage) {
            return null;
        }

        /*
         * Verify that storage is actually writable.
         */
        const testKey = `${STORAGE_PREFIX}storage-test`;

        storage.setItem(testKey, "1");
        storage.removeItem(testKey);

        return storage;
    } catch {
        return null;
    }
}

/**
 * Build a namespaced storage key.
 *
 * Example:
 *
 * theme
 *
 * becomes:
 *
 * resihub:theme
 *
 * @param {string} key
 * @returns {string}
 */
function buildKey(key) {
    return `${STORAGE_PREFIX}${key}`;
}

/**
 * Read a value from localStorage.
 *
 * Invalid JSON automatically falls back to the supplied value.
 *
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
export function getItem(key, fallback = null) {
    if (
        typeof key !== "string" ||
        key.trim() === ""
    ) {
        return fallback;
    }

    const storage = getStorage();

    if (!storage) {
        return fallback;
    }

    try {
        const rawValue = storage.getItem(buildKey(key));

        if (rawValue === null) {
            return fallback;
        }

        return JSON.parse(rawValue);
    } catch {
        /*
         * If corrupted data exists, remove it so that
         * future reads don't repeatedly fail.
         */
        removeItem(key);

        return fallback;
    }
}

/**
 * Persist a value safely.
 *
 * @param {string} key
 * @param {*} value
 * @returns {boolean}
 */
export function setItem(key, value) {
    if (
        typeof key !== "string" ||
        key.trim() === ""
    ) {
        return false;
    }

    const storage = getStorage();

    if (!storage) {
        return false;
    }

    try {
        storage.setItem(
            buildKey(key),
            JSON.stringify(value)
        );

        return true;
    } catch {
        return false;
    }
}

/**
 * Remove a stored value.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function removeItem(key) {
    if (
        typeof key !== "string" ||
        key.trim() === ""
    ) {
        return false;
    }

    const storage = getStorage();

    if (!storage) {
        return false;
    }

    try {
        storage.removeItem(buildKey(key));

        return true;
    } catch {
        return false;
    }
}

/**
 * Check whether a stored value exists.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function hasItem(key) {
    if (
        typeof key !== "string" ||
        key.trim() === ""
    ) {
        return false;
    }

    const storage = getStorage();

    if (!storage) {
        return false;
    }

    try {
        return storage.getItem(buildKey(key)) !== null;
    } catch {
        return false;
    }
}

/**
 * Get the currently stored theme.
 *
 * Invalid or corrupted themes fall back to Azure.
 *
 * @returns {string}
 */
export function getTheme() {
    const theme = getItem(
        STORAGE_KEYS.THEME,
        DEFAULT_THEME
    );

    return VALID_THEMES.has(theme)
        ? theme
        : DEFAULT_THEME;
}

/**
 * Persist a valid theme.
 *
 * @param {string} theme
 * @returns {boolean}
 */
export function saveTheme(theme) {
    if (!VALID_THEMES.has(theme)) {
        return false;
    }

    return setItem(
        STORAGE_KEYS.THEME,
        theme
    );
}

/**
 * Remove the stored theme.
 *
 * Useful when returning theme behavior to the
 * application's default/system behavior.
 *
 * @returns {boolean}
 */
export function clearTheme() {
    return removeItem(STORAGE_KEYS.THEME);
}

/**
 * Get recently viewed listing IDs.
 *
 * Invalid storage data is converted into an empty array.
 *
 * @returns {Array}
 */
export function getRecentlyViewed() {
    const listings = getItem(
        STORAGE_KEYS.RECENTLY_VIEWED,
        []
    );

    if (!Array.isArray(listings)) {
        return [];
    }

    return listings;
}

/**
 * Save a listing as recently viewed.
 *
 * The newest listing is placed first.
 *
 * Duplicate listing IDs are removed.
 *
 * Only the most recent MAX_RECENTLY_VIEWED
 * listings are retained.
 *
 * @param {string|number} listingId
 * @returns {boolean}
 */
export function saveRecentlyViewed(listingId) {
    if (
        listingId === null ||
        listingId === undefined ||
        listingId === ""
    ) {
        return false;
    }

    const listings = getRecentlyViewed()
        .filter((id) => String(id) !== String(listingId));

    listings.unshift(listingId);

    return setItem(
        STORAGE_KEYS.RECENTLY_VIEWED,
        listings.slice(0, MAX_RECENTLY_VIEWED)
    );
}

/**
 * Remove a listing from recently viewed.
 *
 * @param {string|number} listingId
 * @returns {boolean}
 */
export function removeRecentlyViewed(listingId) {
    if (
        listingId === null ||
        listingId === undefined ||
        listingId === ""
    ) {
        return false;
    }

    const listings = getRecentlyViewed()
        .filter(
            (id) =>
                String(id) !== String(listingId)
        );

    return setItem(
        STORAGE_KEYS.RECENTLY_VIEWED,
        listings
    );
}

/**
 * Clear all recently viewed listings.
 *
 * @returns {boolean}
 */
export function clearRecentlyViewed() {
    return removeItem(
        STORAGE_KEYS.RECENTLY_VIEWED
    );
}

/**
 * Clear all ResiHub client preferences.
 *
 * This only removes values managed by this module.
 *
 * @returns {boolean}
 */
export function clearStorage() {
    const storage = getStorage();

    if (!storage) {
        return false;
    }

    try {
        Object.values(STORAGE_KEYS).forEach((key) => {
            storage.removeItem(buildKey(key));
        });

        return true;
    } catch {
        return false;
    }
}

/**
 * Expose supported themes without exposing the
 * internal Set directly.
 *
 * @returns {string[]}
 */
export function getAvailableThemes() {
    return [...VALID_THEMES];
}