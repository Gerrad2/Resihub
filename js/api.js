/**
 * ============================================================
 * ResiHub 2.0
 * Supabase API Layer
 * ============================================================
 *
 * Responsibilities:
 * - Supabase client configuration
 * - Authentication
 * - Profiles
 * - Universities
 * - Listings
 * - Listing images
 * - Favorites
 * - Booking requests
 * - Messages
 * - Notifications
 * - Reviews
 *
 * Security:
 * - The browser uses only the Supabase publishable key.
 * - Authentication is handled by Supabase Auth.
 * - Authorization MUST be enforced by Supabase RLS policies.
 * - Never place a service_role key in frontend JavaScript.
 * ============================================================
 */

import {
    createClient
} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";


/*
|--------------------------------------------------------------------------
| Supabase configuration
|--------------------------------------------------------------------------
*/

const SUPABASE_URL =
    "https://clyksbctnzyreiujzinr.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_69yZEC9GZNEoN3qjFEU6Ng_LHmWT1e-";


export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);


/*
|--------------------------------------------------------------------------
| Standard API result helpers
|--------------------------------------------------------------------------
*/

function success(data = null) {
    return {
        success: true,
        data,
        error: null
    };
}


function failure(error) {
    console.error(
        "[ResiHub API]",
        error
    );

    return {
        success: false,
        data: null,
        error
    };
}


/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
*/

/**
 * Get the currently authenticated user.
 */
export async function getCurrentUser() {

    try {

        const {
            data,
            error
        } = await supabase.auth.getUser();


        if (error) {
            return failure(error);
        }


        return success(
            data?.user ?? null
        );

    } catch (error) {

        return failure(error);

    }
}


/**
 * Get the current Supabase session.
 */
export async function getCurrentSession() {

    try {

        const {
            data,
            error
        } = await supabase.auth.getSession();


        if (error) {
            return failure(error);
        }


        return success(
            data?.session ?? null
        );

    } catch (error) {

        return failure(error);

    }
}


/**
 * Listen for authentication changes.
 *
 * Returns the Supabase subscription.
 */
export function onAuthStateChange(callback) {

    if (typeof callback !== "function") {

        console.warn(
            "[ResiHub API] onAuthStateChange() requires a callback."
        );

        return {
            data: {
                subscription: null
            }
        };
    }


    const {
        data
    } = supabase.auth.onAuthStateChange(
        callback
    );


    return data;
}


/**
 * Sign out the current user.
 */
export async function signOut() {

    try {

        const {
            error
        } = await supabase.auth.signOut();


        if (error) {
            return failure(error);
        }


        return success(true);

    } catch (error) {

        return failure(error);

    }
}


/*
|--------------------------------------------------------------------------
| Profiles
|--------------------------------------------------------------------------
*/

/**
 * Get a profile by user ID.
 */
export async function getProfile(userId) {

    try {

        if (!userId) {

            return failure(
                new Error(
                    "A user ID is required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();


        if (error) {
            return failure(error);
        }


        return success(data);

    } catch (error) {

        return failure(error);

    }
}


/*
|--------------------------------------------------------------------------
| Universities
|--------------------------------------------------------------------------
*/

/**
 * Get all universities.
 */
export async function getUniversities() {

    try {

        const {
            data,
            error
        } = await supabase
            .from("universities")
            .select("*")
            .order(
                "name",
                {
                    ascending: true
                }
            );


        if (error) {
            return failure(error);
        }


        return success(
            data ?? []
        );

    } catch (error) {

        return failure(error);

    }
}


/*
|--------------------------------------------------------------------------
| Listings
|--------------------------------------------------------------------------
*/

/**
 * Get one listing.
 */
export async function getListing(
    listingId
) {

    try {

        if (!listingId) {

            return failure(
                new Error(
                    "A listing ID is required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("listings")
            .select(`
                *,
                universities (
                    id,
                    name,
                    location,
                    description,
                    logo_url
                ),
                listing_images (
                    id,
                    image_url,
                    display_order
                )
            `)
            .eq(
                "id",
                listingId
            )
            .maybeSingle();


        if (error) {
            return failure(error);
        }


        return success(data);

    } catch (error) {

        return failure(error);

    }
}


/**
 * Get paginated listings.
 */
export async function getListings({

    page = 1,

    pageSize = 12,

    universityId = null,

    area = null,

    propertyType = null,

    minPrice = null,

    maxPrice = null,

    availabilityStatus = "available",

    publicationStatus = "published"

} = {}) {

    try {

        const safePage =
            Math.max(
                1,
                Number(page) || 1
            );


        const safePageSize =
            Math.min(
                100,
                Math.max(
                    1,
                    Number(pageSize) || 12
                )
            );


        const from =
            (safePage - 1) *
            safePageSize;


        const to =
            from +
            safePageSize -
            1;


        let query = supabase
            .from("listings")
            .select(`
                *,
                universities (
                    id,
                    name,
                    location,
                    logo_url
                ),
                listing_images (
                    id,
                    image_url,
                    display_order
                )
            `, {
                count: "exact"
            })
            .eq(
                "publication_status",
                publicationStatus
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            )
            .range(
                from,
                to
            );


        if (availabilityStatus) {

            query =
                query.eq(
                    "availability_status",
                    availabilityStatus
                );
        }


        if (universityId) {

            query =
                query.eq(
                    "university_id",
                    universityId
                );
        }


        if (area) {

            query =
                query.ilike(
                    "area",
                    `%${area}%`
                );
        }


        if (propertyType) {

            query =
                query.eq(
                    "property_type",
                    propertyType
                );
        }


        if (minPrice !== null) {

            query =
                query.gte(
                    "price",
                    minPrice
                );
        }


        if (maxPrice !== null) {

            query =
                query.lte(
                    "price",
                    maxPrice
                );
        }


        const {
            data,
            error,
            count
        } = await query;


        if (error) {
            return failure(error);
        }


        return success({

            listings:
                data ?? [],

            count:
                count ?? 0,

            page:
                safePage,

            pageSize:
                safePageSize

        });

    } catch (error) {

        return failure(error);

    }
}


/**
 * Get listings belonging to a landlord.
 */
export async function getLandlordListings(
    landlordId
) {

    try {

        if (!landlordId) {

            return failure(
                new Error(
                    "A landlord ID is required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("listings")
            .select(`
                *,
                universities (
                    id,
                    name,
                    location
                ),
                listing_images (
                    id,
                    image_url,
                    display_order
                )
            `)
            .eq(
                "landlord_id",
                landlordId
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (error) {
            return failure(error);
        }


        return success(
            data ?? []
        );

    } catch (error) {

        return failure(error);

    }
}


/**
 * Create a listing.
 *
 * landlord_id should normally come from the authenticated
 * user's ID, not from arbitrary user input.
 */
export async function createListing(
    listingData
) {

    try {

        const listing = listingData;

        if (
            !listing ||
            typeof listing !== "object"
        ) {

            return failure(
                new Error(
                    "Listing data is required."
                )
            );
        }


        const {
            data: {
                user
            } = {}
        } = await supabase.auth.getUser();


        if (!user) {

            return failure(
                new Error(
                    "You must be authenticated to create a listing."
                )
            );
        }


        const payload = {
            landlord_id:
                user.id,

            university_id:
                listing.university_id ??
                null,

            title:
                listing.title,

            description:
                listing.description ??
                null,

            price:
                listing.price ??
                null,

            property_type:
                listing.property_type,

            area:
                listing.area,

            address:
                listing.address ??
                null,

            phone:
                listing.phone ??
                null,

            availability_status:
                listing.availability_status ??
                "available",

            available_rooms:
                listing.available_rooms ??
                null,

            amenities:
                listing.amenities ??
                {},

            publication_status:
                listing.publication_status ??
                "published"
        };


        const {
            data,
            error
        } = await supabase
            .from("listings")
            .insert(payload)
            .select()
            .single();


        if (error) {
            return failure(error);
        }


        return success(data);

    } catch (error) {

        return failure(error);

    }
}


/**
 * Update a listing.
 */
export async function updateListing(
    listingId,
    updates
) {

    try {

        if (!listingId) {

            return failure(
                new Error(
                    "A listing ID is required."
                )
            );
        }


        if (
            !updates ||
            typeof updates !== "object"
        ) {

            return failure(
                new Error(
                    "Listing updates are required."
                )
            );
        }


        /*
         * Never allow the browser to change ownership
         * through this method.
         */

        const safeUpdates = {
            ...updates
        };


        delete safeUpdates.id;

        delete safeUpdates.landlord_id;


        const {
            data,
            error
        } = await supabase
            .from("listings")
            .update(safeUpdates)
            .eq(
                "id",
                listingId
            )
            .select()
            .single();


        if (error) {
            return failure(error);
        }


        return success(data);

    } catch (error) {

        return failure(error);

    }
}


/**
 * Delete a listing.
 *
 * Actual authorization must be enforced by RLS.
 */
export async function deleteListing(
    listingId
) {

    try {

        if (!listingId) {

            return failure(
                new Error(
                    "A listing ID is required."
                )
            );
        }


        const {
            error
        } = await supabase
            .from("listings")
            .delete()
            .eq(
                "id",
                listingId
            );


        if (error) {
            return failure(error);
        }


        return success(true);

    } catch (error) {

        return failure(error);

    }
}


/*
|--------------------------------------------------------------------------
| Listing Images
|--------------------------------------------------------------------------
*/

/**
 * Create a listing_images database record.
 *
 * IMPORTANT:
 * The actual image file upload will be handled separately
 * through Supabase Storage.
 */
export async function createListingImage(
    listingId,
    imageUrl,
    displayOrder = 0
) {

    try {

        if (!listingId) {

            return failure(
                new Error(
                    "A listing ID is required."
                )
            );
        }


        if (!imageUrl) {

            return failure(
                new Error(
                    "An image URL is required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("listing_images")
            .insert({

                listing_id:
                    listingId,

                image_url:
                    imageUrl,

                display_order:
                    Number(displayOrder) || 0

            })
            .select()
            .single();


        if (error) {
            return failure(error);
        }


        return success(data);

    } catch (error) {

        return failure(error);

    }
}


/**
 * Get images belonging to a listing.
 */
export async function getListingImages(
    listingId
) {

    try {

        if (!listingId) {

            return failure(
                new Error(
                    "A listing ID is required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("listing_images")
            .select("*")
            .eq(
                "listing_id",
                listingId
            )
            .order(
                "display_order",
                {
                    ascending: true
                }
            );


        if (error) {
            return failure(error);
        }


        return success(
            data ?? []
        );

    } catch (error) {

        return failure(error);

    }
}


/**
 * Delete a listing image database record.
 */
export async function deleteListingImage(
    imageId
) {

    try {

        if (!imageId) {

            return failure(
                new Error(
                    "An image ID is required."
                )
            );
        }


        const {
            error
        } = await supabase
            .from("listing_images")
            .delete()
            .eq(
                "id",
                imageId
            );


        if (error) {
            return failure(error);
        }


        return success(true);

    } catch (error) {

        return failure(error);

    }
}


/*
|--------------------------------------------------------------------------
| Favorites
|--------------------------------------------------------------------------
*/

/**
 * Get a student's favorites.
 */
export async function getFavorites(
    userId
) {

    try {

        if (!userId) {

            return failure(
                new Error(
                    "A user ID is required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("favorites")
            .select(`
                *,
                listings (
                    *,
                    universities (
                        id,
                        name,
                        location,
                        logo_url
                    ),
                    listing_images (
                        id,
                        image_url,
                        display_order
                    )
                )
            `)
            .eq(
                "student_id",
                userId
            );


        if (error) {
            return failure(error);
        }


        return success(
            data ?? []
        );

    } catch (error) {

        return failure(error);

    }
}


/**
 * Check whether a listing is already saved.
 */
export async function isFavorite(
    studentId,
    listingId
) {

    try {

        if (
            !studentId ||
            !listingId
        ) {

            return failure(
                new Error(
                    "Student ID and listing ID are required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("favorites")
            .select("id")
            .eq(
                "student_id",
                studentId
            )
            .eq(
                "listing_id",
                listingId
            )
            .maybeSingle();


        if (error) {
            return failure(error);
        }


        return success(
            Boolean(data)
        );

    } catch (error) {

        return failure(error);

    }
}


/**
 * Add a listing to favorites.
 */
export async function addFavorite(
    studentId,
    listingId
) {

    try {

        if (
            !studentId ||
            !listingId
        ) {

            return failure(
                new Error(
                    "Student ID and listing ID are required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("favorites")
            .insert({

                student_id:
                    studentId,

                listing_id:
                    listingId

            })
            .select()
            .single();


        if (error) {
            return failure(error);
        }


        return success(data);

    } catch (error) {

        return failure(error);

    }
}


/**
 * Remove a favorite.
 */
export async function removeFavorite(
    studentId,
    listingId
) {

    try {

        if (
            !studentId ||
            !listingId
        ) {

            return failure(
                new Error(
                    "Student ID and listing ID are required."
                )
            );
        }


        const {
            error
        } = await supabase
            .from("favorites")
            .delete()
            .eq(
                "student_id",
                studentId
            )
            .eq(
                "listing_id",
                listingId
            );


        if (error) {
            return failure(error);
        }


        return success(true);

    } catch (error) {

        return failure(error);

    }
}


/*
|--------------------------------------------------------------------------
| Booking Requests
|--------------------------------------------------------------------------
*/

/**
 * Create a booking / inspection request.
 */
export async function createBookingRequest({
    listingId,
    landlordId,
    inspectionDate = null,
    message = null
} = {}) {

    try {

        if (
            !listingId ||
            !landlordId
        ) {

            return failure(
                new Error(
                    "Listing ID and landlord ID are required."
                )
            );
        }


        const {
            data: {
                user
            } = {}
        } = await supabase.auth.getUser();


        if (!user) {

            return failure(
                new Error(
                    "You must be authenticated to create a booking request."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("booking_requests")
            .insert({

                student_id:
                    user.id,

                listing_id:
                    listingId,

                landlord_id:
                    landlordId,

                inspection_date:
                    inspectionDate,

                message:
                    message,

                status:
                    "pending"

            })
            .select()
            .single();


        if (error) {
            return failure(error);
        }


        return success(data);

    } catch (error) {

        return failure(error);

    }
}


/**
 * Get booking requests made by a student.
 */
export async function getStudentBookings(
    studentId
) {

    try {

        if (!studentId) {

            return failure(
                new Error(
                    "A student ID is required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("booking_requests")
            .select(`
                *,
                listings (
                    *,
                    universities (
                        id,
                        name,
                        location
                    ),
                    listing_images (
                        id,
                        image_url,
                        display_order
                    )
                )
            `)
            .eq(
                "student_id",
                studentId
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (error) {
            return failure(error);
        }


        return success(
            data ?? []
        );

    } catch (error) {

        return failure(error);

    }
}


/**
 * Get booking requests received by a landlord.
 */
export async function getLandlordBookings(
    landlordId
) {

    try {

        if (!landlordId) {

            return failure(
                new Error(
                    "A landlord ID is required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("booking_requests")
            .select(`
                *,
                listings (
                    id,
                    title,
                    area,
                    price
                )
            `)
            .eq(
                "landlord_id",
                landlordId
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (error) {
            return failure(error);
        }


        return success(
            data ?? []
        );

    } catch (error) {

        return failure(error);

    }
}


/**
 * Update booking status.
 */
export async function updateBookingStatus(
    bookingId,
    status
) {

    try {

        if (!bookingId) {

            return failure(
                new Error(
                    "A booking ID is required."
                )
            );
        }


        if (!status) {

            return failure(
                new Error(
                    "A booking status is required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("booking_requests")
            .update({
                status
            })
            .eq(
                "id",
                bookingId
            )
            .select()
            .single();


        if (error) {
            return failure(error);
        }


        return success(data);

    } catch (error) {

        return failure(error);

    }
}


/*
|--------------------------------------------------------------------------
| Messages
|--------------------------------------------------------------------------
*/

/**
 * Get messages between two users.
 */
export async function getMessages(
    userId,
    otherUserId,
    listingId = null
) {

    try {

        if (
            !userId ||
            !otherUserId
        ) {

            return failure(
                new Error(
                    "Both user IDs are required."
                )
            );
        }


        let query = supabase
            .from("messages")
            .select("*")
            .or(
                `and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );


        if (listingId) {

            query =
                query.eq(
                    "listing_id",
                    listingId
                );
        }


        const {
            data,
            error
        } = await query;


        if (error) {
            return failure(error);
        }


        return success(
            data ?? []
        );

    } catch (error) {

        return failure(error);

    }
}


/**
 * Send a message.
 */
export async function sendMessage({
    receiverId,
    message,
    listingId = null
} = {}) {

    try {

        if (
            !receiverId ||
            !message?.trim()
        ) {

            return failure(
                new Error(
                    "Receiver and message are required."
                )
            );
        }


        const {
            data: {
                user
            } = {}
        } = await supabase.auth.getUser();


        if (!user) {

            return failure(
                new Error(
                    "You must be authenticated to send a message."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("messages")
            .insert({

                sender_id:
                    user.id,

                receiver_id:
                    receiverId,

                listing_id:
                    listingId,

                message:
                    message.trim(),

                is_read:
                    false

            })
            .select()
            .single();


        if (error) {
            return failure(error);
        }


        return success(data);

    } catch (error) {

        return failure(error);

    }
}


/**
 * Mark a message as read.
 */
export async function markMessageRead(
    messageId
) {

    try {

        if (!messageId) {

            return failure(
                new Error(
                    "A message ID is required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("messages")
            .update({
                is_read: true
            })
            .eq(
                "id",
                messageId
            )
            .select()
            .single();


        if (error) {
            return failure(error);
        }


        return success(data);

    } catch (error) {

        return failure(error);

    }
}


/*
|--------------------------------------------------------------------------
| Notifications
|--------------------------------------------------------------------------
*/

/**
 * Get notifications for a user.
 */
export async function getNotifications(
    userId
) {

    try {

        if (!userId) {

            return failure(
                new Error(
                    "A user ID is required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("notifications")
            .select("*")
            .eq(
                "user_id",
                userId
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (error) {
            return failure(error);
        }


        return success(
            data ?? []
        );

    } catch (error) {

        return failure(error);

    }
}


/**
 * Get unread notification count.
 */
export async function getUnreadNotificationCount(
    userId
) {

    try {

        if (!userId) {

            return failure(
                new Error(
                    "A user ID is required."
                )
            );
        }


        const {
            count,
            error
        } = await supabase
            .from("notifications")
            .select(
                "id",
                {
                    count: "exact",
                    head: true
                }
            )
            .eq(
                "user_id",
                userId
            )
            .eq(
                "is_read",
                false
            );


        if (error) {
            return failure(error);
        }


        return success(
            count ?? 0
        );

    } catch (error) {

        return failure(error);

    }
}


/**
 * Mark notification as read.
 */
export async function markNotificationRead(
    notificationId
) {

    try {

        if (!notificationId) {

            return failure(
                new Error(
                    "A notification ID is required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("notifications")
            .update({
                is_read: true
            })
            .eq(
                "id",
                notificationId
            )
            .select()
            .single();


        if (error) {
            return failure(error);
        }


        return success(data);

    } catch (error) {

        return failure(error);

    }
}


/*
|--------------------------------------------------------------------------
| Reviews
|--------------------------------------------------------------------------
*/

/**
 * Get reviews for a listing.
 */
export async function getReviews(
    listingId
) {

    try {

        if (!listingId) {

            return failure(
                new Error(
                    "A listing ID is required."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("listing_reviews")
            .select(`
                *,
                profiles (
                    id,
                    full_name,
                    avatar_url
                )
            `)
            .eq(
                "listing_id",
                listingId
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (error) {
            return failure(error);
        }


        return success(
            data ?? []
        );

    } catch (error) {

        return failure(error);

    }
}


/**
 * Create a review.
 */
export async function createReview({
    listingId,
    rating,
    comment = null
} = {}) {

    try {

        if (!listingId) {

            return failure(
                new Error(
                    "A listing ID is required."
                )
            );
        }


        const numericRating =
            Number(rating);


        if (
            !Number.isInteger(
                numericRating
            ) ||
            numericRating < 1 ||
            numericRating > 5
        ) {

            return failure(
                new Error(
                    "Rating must be an integer from 1 to 5."
                )
            );
        }


        const {
            data: {
                user
            } = {}
        } = await supabase.auth.getUser();


        if (!user) {

            return failure(
                new Error(
                    "You must be authenticated to write a review."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("listing_reviews")
            .insert({

                student_id:
                    user.id,

                listing_id:
                    listingId,

                rating:
                    numericRating,

                comment:
                    comment?.trim() ||
                    null

            })
            .select()
            .single();


        if (error) {
            return failure(error);
        }


        return success(data);

    } catch (error) {

        return failure(error);

    }
}


/**
 * Update a review.
 */
export async function updateReview(
    reviewId,
    rating,
    comment = null
) {

    try {

        if (!reviewId) {

            return failure(
                new Error(
                    "A review ID is required."
                )
            );
        }


        const numericRating =
            Number(rating);


        if (
            !Number.isInteger(
                numericRating
            ) ||
            numericRating < 1 ||
            numericRating > 5
        ) {

            return failure(
                new Error(
                    "Rating must be an integer from 1 to 5."
                )
            );
        }


        const {
            data,
            error
        } = await supabase
            .from("listing_reviews")
            .update({

                rating:
                    numericRating,

                comment:
                    comment?.trim() ||
                    null

            })
            .eq(
                "id",
                reviewId
            )
            .select()
            .single();


        if (error) {
            return failure(error);
        }


        return success(data);

    } catch (error) {

        return failure(error);

    }
}


/**
 * Delete a review.
 */
export async function deleteReview(
    reviewId
) {

    try {

        if (!reviewId) {

            return failure(
                new Error(
                    "A review ID is required."
                )
            );
        }


        const {
            error
        } = await supabase
            .from("listing_reviews")
            .delete()
            .eq(
                "id",
                reviewId
            );


        if (error) {
            return failure(error);
        }


        return success(true);

    } catch (error) {

        return failure(error);

    }
}
