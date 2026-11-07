import { supabase } from "../api.js";

/*
 * Calls onChange whenever a row in one of the tables changes.
 * Changes that arrive close together are grouped into one call.
 *
 * tables: [{ table: "listings", filter: "landlord_id=eq.<id>" }, ...]
 * filter is optional. Returns a function that stops the subscription.
 */
export function watchTables(channelName, tables, onChange, delay = 150) {
    let timer = null;

    const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            Promise.resolve(onChange()).catch((error) => {
                console.error(`[realtime] ${channelName} refresh failed:`, error);
            });
        }, delay);
    };

    const channel = supabase.channel(channelName);

    for (const { table, filter } of tables) {
        channel.on(
            "postgres_changes",
            { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
            schedule
        );
    }

    channel.subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(`[realtime] ${channelName} ${status}`, error ?? "");
        }
    });

    return () => {
        clearTimeout(timer);
        supabase.removeChannel(channel);
    };
}