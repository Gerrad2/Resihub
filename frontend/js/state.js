const DEFAULT_STATE = {
    user: null,

    role: "guest",

    isAuthenticated: false,

    theme: "azure",

    reducedMotion: getReducedMotionPreference(),

    search: {
        query: "",
        university: "",
        area: "",
        propertyType: "",
        minPrice: null,
        maxPrice: null,
        amenities: [],
        availability: "",
        sortBy: "newest",
        page: 1,
    },

    ui: {
        activeModalId: null,
        activeMenuId: null,
        isNavigationOpen: false,
        isLoading: false,
    },
};

/**
 * Internal application state.
 *
 * Modules should access this through:
 *
 * getState()
 * setState()
 * updateState()
 * subscribe()
 */
let state = cloneState(DEFAULT_STATE);

/**
 * State subscribers.
 *
 * Each subscriber receives a fresh state snapshot.
 */
const listeners = new Set();

/**
 * Detect the user's reduced-motion preference safely.
 *
 * @returns {boolean}
 */
function getReducedMotionPreference() {
    if (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function"
    ) {
        return false;
    }

    return window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;
}

/**
 * Clone state safely.
 *
 * structuredClone is preferred because it creates a deep copy.
 * JSON fallback keeps the store usable in older environments.
 *
 * @param {Object} value
 * @returns {Object}
 */
function cloneState(value) {
    if (
        typeof structuredClone === "function"
    ) {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
}

/**
 * Notify all subscribers.
 *
 * Each subscriber is isolated so one broken listener
 * cannot prevent other parts of the application from
 * receiving state updates.
 */
function notify() {
    const snapshot = getState();

    listeners.forEach((listener) => {
        try {
            listener(snapshot);
        } catch (error) {
            console.error(
                "[ResiHub State] Subscriber error:",
                error
            );
        }
    });
}

/**
 * Get a read-only snapshot of the current state.
 *
 * @returns {Object}
 */
export function getState() {
    return cloneState(state);
}

/**
 * Replace the top-level state values supplied.
 *
 * Example:
 *
 * setState({
 *     role: "student",
 *     isAuthenticated: true
 * });
 *
 * @param {Object} updates
 */
export function setState(updates = {}) {
    if (
        !updates ||
        typeof updates !== "object" ||
        Array.isArray(updates)
    ) {
        console.warn(
            "[ResiHub State] setState() expects an object."
        );

        return;
    }

    state = {
        ...state,
        ...cloneState(updates),
    };

    notify();
}

/**
 * Update a nested state value using dot notation.
 *
 * Example:
 *
 * updateState(
 *     "search.query",
 *     "University of Lagos"
 * );
 *
 * @param {string} path
 * @param {*} value
 */
export function updateState(path, value) {
    if (
        typeof path !== "string" ||
        path.trim() === ""
    ) {
        console.warn(
            "[ResiHub State] updateState() requires a valid path."
        );

        return;
    }

    const keys = path
        .split(".")
        .map((key) => key.trim())
        .filter(Boolean);

    if (keys.length === 0) {
        return;
    }

    const nextState = cloneState(state);

    let target = nextState;

    for (
        let index = 0;
        index < keys.length - 1;
        index += 1
    ) {
        const key = keys[index];

        if (
            !target[key] ||
            typeof target[key] !== "object" ||
            Array.isArray(target[key])
        ) {
            target[key] = {};
        }

        target = target[key];
    }

    const finalKey = keys[keys.length - 1];

    target[finalKey] = cloneState(value);

    state = nextState;

    notify();
}

/**
 * Subscribe to state changes.
 *
 * Example:
 *
 * const unsubscribe = subscribe((state) => {
 *     console.log(state);
 * });
 *
 * @param {Function} listener
 * @returns {Function} unsubscribe function
 */
export function subscribe(listener) {
    if (typeof listener !== "function") {
        console.warn(
            "[ResiHub State] subscribe() expects a function."
        );

        return () => { };
    }

    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

/**
 * Reset the application state.
 *
 * Useful for:
 * - logout
 * - testing
 * - application reset
 *
 * @param {Object} overrides
 */
export function resetState(overrides = {}) {
    state = {
        ...cloneState(DEFAULT_STATE),
        ...cloneState(overrides),
    };

    notify();
}

/**
 * Update reduced-motion state.
 *
 * This allows accessibility.js to synchronize
 * the application state with the user's preference.
 *
 * @param {boolean} enabled
 */
export function setReducedMotion(enabled) {
    updateState(
        "reducedMotion",
        Boolean(enabled)
    );
}

/**
 * Remove all state subscribers.
 *
 * Primarily useful during testing or complete
 * application teardown.
 */
export function clearSubscribers() {
    listeners.clear();
}