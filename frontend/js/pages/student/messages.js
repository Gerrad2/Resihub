import { getCurrentUser, getPublicProfile, supabase } from "../../api.js";
import { showError } from "../../student_utils.js";
import { showToast } from "../../ui/toast.js";
import { ticksFor, startMessageStatus } from "../../core/message-status.js";

const $ = (id) => document.getElementById(id);
const DEFAULT_AVATAR = "../assets/images/default-avatar.png";

let me = null;
let conversations = [];
let activeId = null;

export async function init() {
    bindEvents();

    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;
    if (!me) return;

    await loadConversations();

    // messages.htm?c=<conversation id> opens that conversation
    const requested = new URLSearchParams(location.search).get("c");
    if (requested) {
        await openConversation(requested);
    }

    // Delivered and read ticks, refreshed every few seconds
    startMessageStatus(me.id, refreshActiveThread);
}

function bindEvents() {
    $("conversationSearch")?.addEventListener("input", renderList);
    $("messageForm")?.addEventListener("submit", sendCurrent);
}

/* Active conversations where I am the student or the landlord */
async function loadConversations() {
    const { data, error } = await supabase
        .from("conversations")
        .select("id, student_id, landlord_id, property_id, last_message_at")
        .eq("status", "active")
        .or(`student_id.eq.${me.id},landlord_id.eq.${me.id}`)
        .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) {
        showError("Your conversations could not be loaded.");
        return;
    }

    const rows = data ?? [];

    if (!rows.length) {
        conversations = [];
        renderList();
        return;
    }

    const ids = rows.map((row) => row.id);
    const otherIds = rows.map((row) => (row.student_id === me.id ? row.landlord_id : row.student_id));
    const propertyIds = [...new Set(rows.map((row) => row.property_id).filter(Boolean))];

    const [profiles, listings, messages] = await Promise.all([
        Promise.all(otherIds.map((id) => getPublicProfile(id))),
        propertyIds.length
            ? supabase.from("listings").select("id, title").in("id", propertyIds)
            : Promise.resolve({ data: [] }),
        supabase
            .from("messages")
            .select("conversation_id, sender_id, body, is_read, created_at")
            .in("conversation_id", ids)
            .order("created_at", { ascending: false }),
    ]);

    const titles = new Map((listings.data ?? []).map((listing) => [listing.id, listing.title]));

    const lastByConversation = new Map();
    const unreadByConversation = new Map();

    for (const message of messages.data ?? []) {
        if (!lastByConversation.has(message.conversation_id)) {
            lastByConversation.set(message.conversation_id, message);
        }
        if (!message.is_read && message.sender_id !== me.id) {
            unreadByConversation.set(
                message.conversation_id,
                (unreadByConversation.get(message.conversation_id) ?? 0) + 1
            );
        }
    }

    conversations = rows.map((row, index) => ({
        id: row.id,
        otherId: otherIds[index],
        profile: profiles[index].success ? profiles[index].data : null,
        listingTitle: titles.get(row.property_id) ?? "",
        last: lastByConversation.get(row.id) ?? null,
        unread: unreadByConversation.get(row.id) ?? 0,
    }));

    renderList();
}

function renderList() {
    const query = $("conversationSearch")?.value.trim().toLowerCase() ?? "";
    const list = $("conversationList");
    if (!list) return;

    const items = conversations.filter((conv) => {
        if (!query) return true;
        return (
            displayName(conv).toLowerCase().includes(query) ||
            conv.listingTitle.toLowerCase().includes(query)
        );
    });

    list.replaceChildren(...items.map((conv) => createListButton(conv)));

    if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "msg-none";
        empty.textContent = conversations.length
            ? "No matching conversations."
            : "No conversations yet. They open automatically when a landlord approves your booking.";
        list.append(empty);
    }
}

function createListButton(conv) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `msg-conv${conv.id === activeId ? " active" : ""}`;

    const avatar = document.createElement("img");
    avatar.src = conv.profile?.avatar_url || DEFAULT_AVATAR;
    avatar.alt = "";

    const text = document.createElement("div");
    text.className = "msg-conv-text";

    const top = document.createElement("div");
    top.className = "msg-conv-top";

    const name = document.createElement("strong");
    name.textContent = displayName(conv);

    const time = document.createElement("span");
    time.className = "msg-conv-time";
    time.textContent = conv.last ? formatListTime(conv.last.created_at) : "";

    top.append(name, time);

    const preview = document.createElement("p");
    preview.className = "msg-conv-preview";
    preview.textContent = conv.last
        ? `${conv.last.sender_id === me.id ? "You: " : ""}${conv.last.body}`
        : conv.listingTitle || "No messages yet";

    text.append(top, preview);
    button.append(avatar, text);

    if (conv.unread) {
        const badge = document.createElement("span");
        badge.className = "msg-unread";
        badge.textContent = conv.unread;
        button.append(badge);
    }

    button.addEventListener("click", () => openConversation(conv.id));
    return button;
}

async function openConversation(id) {
    const conv = conversations.find((c) => c.id === id);

    if (!conv) {
        showToast("That conversation is no longer available.", { type: "error" });
        return;
    }

    activeId = id;

    $("chatAvatar").src = conv.profile?.avatar_url || DEFAULT_AVATAR;
    setText("chatName", displayName(conv));
    setText("chatStatus", conv.listingTitle || roleLabel(conv.profile?.role));

    $("emptyChat")?.classList.add("hidden");
    $("chatMessages")?.classList.remove("hidden");
    $("messageInput").disabled = false;
    $("sendMessage").disabled = false;

    renderActions(conv);
    renderList();

    const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, body, is_read, read_at, delivered_at, created_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

    if (error) {
        showError("Messages could not be loaded.");
        return;
    }

    const messages = data ?? [];
    renderThread(messages);

    const unreadIds = messages
        .filter((m) => !m.is_read && m.sender_id !== me.id)
        .map((m) => m.id);

    if (unreadIds.length) {
        await supabase
            .from("messages")
            .update({ is_read: true, read_at: new Date().toISOString() })
            .in("id", unreadIds);

        conv.unread = 0;
        renderList();
    }
}

async function refreshActiveThread() {
    if (!activeId) return;

    const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, body, is_read, read_at, delivered_at, created_at")
        .eq("conversation_id", activeId)
        .order("created_at", { ascending: true });

    if (error || !data) return;
    renderThread(data);
}

function renderThread(messages) {
    const thread = $("chatMessages");
    if (!thread) return;

    thread.replaceChildren(...messages.map((message) => createBubble(message)));
    thread.scrollTop = thread.scrollHeight;
}

function createBubble(message) {
    const mine = message.sender_id === me.id;

    const row = document.createElement("div");
    row.className = `msg-row ${mine ? "mine" : "theirs"}`;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = message.body;

    const meta = document.createElement("div");
    meta.className = "msg-meta";

    const time = document.createElement("span");
    time.className = "msg-time";
    time.textContent = formatTime(message.created_at);

    meta.append(time);
    if (mine) meta.append(ticksFor(message));

    row.append(bubble, meta);
    return row;
}

async function sendCurrent(event) {
    event.preventDefault();
    if (!activeId) return;

    const input = $("messageInput");
    const body = input.value.trim();
    if (!body) return;

    const button = $("sendMessage");
    button.disabled = true;

    const { error } = await supabase
        .from("messages")
        .insert({ conversation_id: activeId, sender_id: me.id, body });

    button.disabled = false;

    if (error) {
        console.error("[messages] send failed:", error);
        showToast("Message not sent. This conversation may have been removed or blocked.", { type: "error" });
        return;
    }

    input.value = "";
    await refreshActiveThread();
    await loadConversations();
}

/* ---------- Remove and block ---------- */

function renderActions(conv) {
    const box = $("chatActions");
    if (!box) return;

    box.replaceChildren(
        actionButton("Remove", "msg-action", () => removeConversation(conv)),
        actionButton("Block", "msg-action danger", () => blockConversation(conv))
    );
}

function actionButton(label, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

async function removeConversation(conv) {
    const confirmed = confirm(
        `Remove ${displayName(conv)}? You will no longer be able to message each other here. The chat history is kept.`
    );
    if (!confirmed) return;

    const { error } = await supabase.rpc("remove_conversation", { conv_id: conv.id });

    if (error) {
        showToast("Could not remove this conversation. Please try again.", { type: "error" });
        return;
    }

    showToast("Conversation removed.", { type: "success" });
    resetChat();
    await loadConversations();
}

async function blockConversation(conv) {
    const confirmed = confirm(
        `Block ${displayName(conv)}? Neither of you can send messages here until it is unblocked.`
    );
    if (!confirmed) return;

    const { error } = await supabase.rpc("block_conversation", { conv_id: conv.id });

    if (error) {
        showToast("Could not block this person. Please try again.", { type: "error" });
        return;
    }

    showToast("Blocked.", { type: "success" });
    resetChat();
    await loadConversations();
}

function resetChat() {
    activeId = null;

    $("emptyChat")?.classList.remove("hidden");
    $("chatMessages")?.classList.add("hidden");
    $("chatMessages")?.replaceChildren();
    $("messageInput").disabled = true;
    $("sendMessage").disabled = true;
    $("chatActions")?.replaceChildren();

    $("chatAvatar").src = DEFAULT_AVATAR;
    setText("chatName", "Select a conversation");
    setText("chatStatus", "");
}

/* ---------- Helpers ---------- */

function displayName(conv) {
    return conv.profile?.business_name || conv.profile?.full_name || "ResiHub user";
}

function roleLabel(role) {
    if (role === "landlord") return "Landlord";
    if (role === "student") return "Student";
    return "";
}

function formatTime(value) {
    return new Date(value).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

function formatListTime(value) {
    const date = new Date(value);
    const sameDay = date.toDateString() === new Date().toDateString();

    return sameDay
        ? formatTime(value)
        : date.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}