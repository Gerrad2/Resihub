/**
 * Load one HTML component.
 *
 * @param {string} file
 * @param {string} elementId
 * @returns {Promise<boolean>}
 */
export async function loadComponent(file, elementId) {
    const target = document.getElementById(elementId);

    if (!target) {
        console.warn(
            `[ResiHub Components] Target "#${elementId}" was not found.`
        );

        return false;
    }

    if (!file) {
        console.error(
            `[ResiHub Components] No component file supplied for "#${elementId}".`
        );

        return false;
    }

    try {
        const response = await fetch(file, {
            method: "GET",
            cache: "no-cache",
        });

        if (!response.ok) {
            throw new Error(
                `Unable to load "${file}" (${response.status} ${response.statusText}).`
            );
        }

        const html = await response.text();

        if (!html.trim()) {
            throw new Error(
                `Component "${file}" returned an empty response.`
            );
        }

        target.innerHTML = html;

        return true;
    } catch (error) {
        console.error(
            `[ResiHub Components] Failed to load "${file}":`,
            error
        );

        return false;
    }
}


/**
 * Load multiple components.
 *
 * Components are loaded in parallel.
 *
 * @param {Array} components
 * @returns {Promise<boolean>}
 */
export async function loadComponents(components = []) {
    if (!Array.isArray(components) || components.length === 0) {
        console.warn(
            "[ResiHub Components] No components were supplied."
        );

        return false;
    }

    const results = await Promise.all(
        components.map(({ file, elementId }) =>
            loadComponent(file, elementId)
        )
    );

    return results.every(Boolean);
}


/**
 * Check whether a component target exists.
 *
 * @param {string} elementId
 * @returns {boolean}
 */
export function componentTargetExists(elementId) {
    return Boolean(
        elementId &&
        document.getElementById(elementId)
    );
}