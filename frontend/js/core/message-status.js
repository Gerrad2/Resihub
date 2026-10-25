import { supabase } from "../api.js";

const POLL_MS = 5000;

/* Ticks for a message I sent: sent, delivered, or read */
export function ticksFor(message) {
    const state = message.is_read ? "read" : message.delivered_at ? "delivered" : "sent";

    const span = document.createElement("span");
    span.className = `msg-ticks ${state}`;
    span.textContent = state === "read" ? "✓✓✓" : state === "delivered" ? "✓✓" : "✓";
    span.setAttribute("aria-label", state.charAt(0).toUpperCase() + state.slice(1));
    span.title = span.getAttribute("aria-label");

    return span;
}

/* Marks messages sent to me as delivered. The database only allows this for my own conversations. */
export async function markDelivered(myId) {
    const { error } = await supabase
        .from("messages")
        .update({ delivered_at: new Date().toISOString() })
        .is("delivered_at", null)
        .neq("sender_id", myId);

    if (error) console.warn("[message-status] delivered update failed:", error);
}

/* Keeps ticks up to date. refresh() should reload and redraw the open chat. */
export function startMessageStatus(myId, refresh) {
    const tick = async () => {
        await markDelivered(myId);
        await refresh();
    };

    tick();
    return setInterval(tick, POLL_MS);
}