/**
 * ============================================================
 * ResiHub 2.0
 * Application Bootstrapper
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Detect application area
 * 2. Load the correct header/footer
 * 3. Synchronize authentication state
 * 4. Initialize global UI systems
 * 5. Dispatch application lifecycle events
 *
 * This module does NOT:
 *
 * - contain page-specific business logic
 * - render listing data
 * - handle individual forms
 * - perform page-specific Supabase queries
 *
 * Page-specific JavaScript belongs in the individual
 * page modules loaded by each HTML document.
 * ============================================================
 */


import {
    getCurrentSession,
    getCurrentUser,
    getProfile,
    onAuthStateChange,
} from "./api.js";


import {
    setState,
    resetState,
} from "./state.js";


import {
    initAccessibility,
} from "./ui/accessibility.js";


import {
    initAnimations,
} from "./ui/animations.js";


import {
    initModal,
} from "./ui/modal.js";


import {
    initNavigation,
} from "./ui/navigation.js";


import {
    initTheme,
} from "./ui/theme.js";


/*
|--------------------------------------------------------------------------
| Application constants
|--------------------------------------------------------------------------
*/

const APP_NAME = "ResiHub";

const APPLICATION_READY_EVENT =
    "resihub:app-ready";

const AUTH_CHANGED_EVENT =
    "resihub:auth-change";


/*
|--------------------------------------------------------------------------
| Detect current application area
|--------------------------------------------------------------------------
*/

function getPageArea() {

    const path = window.location.pathname
        .replace(/\\/g, "/")
        .toLowerCase();


    const segments = path
        .split("/")
        .filter(Boolean);


    /*
     * Admin area
     */

    if (segments.includes("admin")) {
        return "admin";
    }


    /*
     * Landlord area
     */

    if (segments.includes("landlord")) {
        return "landlord";
    }


    /*
     * Student area
     */

    if (segments.includes("student")) {
        return "student";
    }


    /*
     * General/public area
     */

    if (segments.includes("general")) {
        return "general";
    }


    /*
     * Root pages are treated as public pages.
     */

    return "general";
}


/*
|--------------------------------------------------------------------------
| Layout loader configuration
|--------------------------------------------------------------------------
*/

const methods = {
    admin: "loadAdminLayout",

    general: "loadGeneralLayout",

    landlord: "loadLandlordLayout",

    student: "loadStudentLayout",

    system: "loadGeneralLayout",

    auth: "loadGeneralLayout"
};


/*
|--------------------------------------------------------------------------
| Load application layout
|--------------------------------------------------------------------------
*/

async function loadLayout() {

    const area = getPageArea();

    const loaderPath =
        LAYOUT_LOADERS[area];


    if (!loaderPath) {

        console.error(
            `[${APP_NAME}] No layout loader exists for "${area}".`
        );

        return false;
    }


    const header =
        document.getElementById("header");


    const footer =
        document.getElementById("footer");


    /*
     * Header is mandatory.
     */

    if (!header) {

        console.error(
            `[${APP_NAME}] Required "#header" container is missing.`
        );

        return false;
    }


    /*
     * Footer is strongly recommended but does not
     * prevent the application from starting.
     */

    if (!footer) {

        console.warn(
            `[${APP_NAME}] "#footer" container was not found.`
        );
    }


    try {

        const module =
            await import(loaderPath);


        let result = false;


        switch (area) {

            case "admin":

                result =
                    await module.loadAdminLayout();

                break;


            case "landlord":

                result =
                    await module.loadLandlordLayout();

                break;


            case "student":

                result =
                    await module.loadStudentLayout();

                break;


            case "general":

            default:

                result =
                    await module.loadGeneralLayout();

                break;

        }


        if (!result) {

            console.error(
                `[${APP_NAME}] Layout loading failed for "${area}".`
            );

            return false;
        }


        document.documentElement.dataset.appArea =
            area;


        document.dispatchEvent(
            new CustomEvent(
                "resihub:layout-ready",
                {
                    detail: {
                        area,
                    },
                }
            )
        );


        return true;

    } catch (error) {

        console.error(
            `[${APP_NAME}] Unable to load layout:`,
            error
        );

        return false;
    }
}


/*
|--------------------------------------------------------------------------
| Synchronize authentication state
|--------------------------------------------------------------------------
*/

async function synchronizeAuthState() {

    try {

        const sessionResult =
            await getCurrentSession();


        if (!sessionResult.success) {

            console.warn(
                `[${APP_NAME}] Unable to retrieve session.`,
                sessionResult.error
            );

            resetState();

            return null;
        }


        const session =
            sessionResult.data;


        /*
         * No active session.
         */

        if (!session?.user) {

            resetState();

            document.dispatchEvent(
                new CustomEvent(
                    AUTH_CHANGED_EVENT,
                    {
                        detail: {
                            user: null,
                            session: null,
                            profile: null,
                            role: "guest",
                        },
                    }
                )
            );


            return null;
        }


        const user =
            session.user;


        /*
         * Retrieve the application profile.
         *
         * The role stored in profiles controls application
         * behavior, but actual database authorization MUST
         * still be enforced through Supabase RLS.
         */

        const profileResult =
            await getProfile(user.id);


        const profile =
            profileResult.success
                ? profileResult.data
                : null;


        const role =
            profile?.role || "guest";


        setState({

            user,

            role,

            isAuthenticated: true,

        });


        document.dispatchEvent(
            new CustomEvent(
                AUTH_CHANGED_EVENT,
                {
                    detail: {
                        user,
                        session,
                        profile,
                        role,
                    },
                }
            )
        );


        return {
            user,
            session,
            profile,
            role,
        };

    } catch (error) {

        console.error(
            `[${APP_NAME}] Authentication synchronization failed:`,
            error
        );

        resetState();

        return null;
    }
}


/*
|--------------------------------------------------------------------------
| Listen for authentication changes
|--------------------------------------------------------------------------
*/

function initializeAuthListener() {

    const subscription =
        onAuthStateChange(
            async (event, session) => {

                /*
                 * SIGNED_OUT
                 */

                if (
                    event === "SIGNED_OUT" ||
                    !session?.user
                ) {

                    resetState();


                    document.dispatchEvent(
                        new CustomEvent(
                            AUTH_CHANGED_EVENT,
                            {
                                detail: {
                                    event,
                                    user: null,
                                    session: null,
                                    profile: null,
                                    role: "guest",
                                },
                            }
                        )
                    );


                    return;
                }


                /*
                 * For SIGNED_IN, TOKEN_REFRESHED and
                 * USER_UPDATED we resynchronize the
                 * application profile.
                 */

                const user =
                    session.user;


                let profile = null;


                try {

                    const result =
                        await getProfile(user.id);


                    if (result.success) {
                        profile = result.data;
                    }

                } catch (error) {

                    console.error(
                        `[${APP_NAME}] Failed to refresh profile:`,
                        error
                    );

                }


                const role =
                    profile?.role || "guest";


                setState({

                    user,

                    role,

                    isAuthenticated: true,

                });


                document.dispatchEvent(
                    new CustomEvent(
                        AUTH_CHANGED_EVENT,
                        {
                            detail: {
                                event,
                                user,
                                session,
                                profile,
                                role,
                            },
                        }
                    )
                );
            }
        );


    return subscription;
}


/*
|--------------------------------------------------------------------------
| Initialize global systems
|--------------------------------------------------------------------------
*/

function initializeGlobalUI() {

    /*
     * Theme must be initialized before visual components.
     */

    initTheme();


    /*
     * Accessibility preferences.
     */

    initAccessibility();


    /*
     * Header/footer must already exist before
     * navigation initialization.
     */

    initNavigation();


    /*
     * Modal system.
     */

    initModal();


    /*
     * Scroll/reveal animations.
     */

    initAnimations();

}


/*
|--------------------------------------------------------------------------
| Dispatch application-ready event
|--------------------------------------------------------------------------
*/

function dispatchApplicationReady() {

    document.dispatchEvent(
        new CustomEvent(
            APPLICATION_READY_EVENT,
            {
                detail: {
                    area: getPageArea(),

                    path:
                        window.location.pathname,

                    timestamp:
                        Date.now(),
                },
            }
        )
    );

}


/*
|--------------------------------------------------------------------------
| Main application bootstrap
|--------------------------------------------------------------------------
*/

async function initApp() {

    try {

        console.info(
            `[${APP_NAME}] Initializing application...`
        );


        /*
         * STEP 1
         * Load header/footer.
         */

        const layoutLoaded =
            await loadLayout();


        if (!layoutLoaded) {

            console.error(
                `[${APP_NAME}] Application stopped because the layout could not be loaded.`
            );

            return;
        }


        /*
         * STEP 2
         * Synchronize Supabase authentication.
         */

        await synchronizeAuthState();


        /*
         * STEP 3
         * Listen for future auth changes.
         */

        initializeAuthListener();


        /*
         * STEP 4
         * Initialize global UI.
         */

        initializeGlobalUI();


        /*
         * STEP 5
         * Tell page modules that the global application
         * is ready.
         */

        dispatchApplicationReady();


        console.info(
            `[${APP_NAME}] Application initialized successfully.`
        );


    } catch (error) {

        console.error(
            `[${APP_NAME}] Application initialization failed:`,
            error
        );

    }

}


/*
|--------------------------------------------------------------------------
| Start application safely
|--------------------------------------------------------------------------
*/

if (
    document.readyState === "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initApp,
        {
            once: true,
        }
    );

} else {

    initApp();

}


/*
|--------------------------------------------------------------------------
| Public diagnostic helper
|--------------------------------------------------------------------------
|
| This does not expose secrets.
|
| It only allows us to inspect whether the application
| bootstrapper has been loaded.
|--------------------------------------------------------------------------
*/

window.ResiHub = Object.freeze({

    version: "1.0",

    getArea: getPageArea,

    isReady() {
        return Boolean(
            document.documentElement
                .dataset
                .appArea
        );
    },

});
