// js/landlord_messages.js

import {
    supabase,
    getCurrentUser,
    getProfile,
    getMessages,
    sendMessage,
    markMessageRead
} from "./core/api.js";

import { showToast } from "./ui/toast.js";

let currentUser = null;
let currentConversation = null;
let conversations = [];

const conversationSearch = document.getElementById("conversationSearch");
const conversationList = document.getElementById("conversationList");
const chatAvatar = document.getElementById("chatAvatar");
const chatName = document.getElementById("chatName");
const chatStatus = document.getElementById("chatStatus");
const chatMessages = document.getElementById("chatMessages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const emptyChat = document.getElementById("emptyChat");

const DEFAULT_AVATAR = "../assets/images/default-avatar.png";

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return new Intl.DateTimeFormat("en-NG", {
        hour: "numeric",
        minute: "2-digit",
        day: "numeric",
        month: "short"
    }).format(date);
}

function setLoading(element, text = "Loading...") {
    if (element) {
        element.innerHTML = `<div class="empty-state"><p>${text}</p></div>`;
    }
}

async function initialize() {
    const result = await getCurrentUser();

    if (!result.success || !result.data) {
        window.location.href = "../auth/landlord_login.htm";
        return;
    }

    currentUser = result.data;

    await loadConversations();

    messageForm?.addEventListener("submit", handleSendMessage);
    conversationSearch?.addEventListener("input", filterConversations);
}

async function loadConversations() {
    setLoading(conversationList);

    const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
            `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
        )
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        setLoading(conversationList, "Unable to load conversations.");
        return;
    }

    const map = new Map();

    for (const message of data ?? []) {
        const otherId =
            message.sender_id === currentUser.id
                ? message.receiver_id
                : message.sender_id;

        if (!map.has(otherId)) {
            map.set(otherId, {
                userId: otherId,
                lastMessage: message.message,
                createdAt: message.created_at,
                unread:
                    message.receiver_id === currentUser.id &&
                    !message.is_read
            });
        }
    }

    conversations = [];

    for (const conversation of map.values()) {
        const profileResult = await getProfile(conversation.userId);

        conversations.push({
            ...conversation,
            profile: profileResult.success
                ? profileResult.data
                : null
        });
    }

    renderConversations(conversations);
}

function renderConversations(items) {
    if (!conversationList) return;

    if (!items.length) {
        conversationList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-comments"></i>
                <h3>No Conversations</h3>
                <p>Your messages will appear here.</p>
            </div>
        `;
        return;
    }

    conversationList.innerHTML = items.map(item => `
        <button
            type="button"
            class="conversation-item ${item.userId === currentConversation ? "active" : ""}"
            data-user-id="${escapeHtml(item.userId)}"
        >
            <img
                src="${escapeHtml(item.profile?.avatar_url || DEFAULT_AVATAR)}"
                alt=""
            >

            <span class="conversation-content">
                <strong>
                    ${escapeHtml(item.profile?.full_name || "User")}
                </strong>

                <small>
                    ${escapeHtml(item.lastMessage)}
                </small>
            </span>

            ${item.unread ? `<span class="unread-dot"></span>` : ""}
        </button>
    `).join("");

    conversationList.querySelectorAll("[data-user-id]").forEach(button => {
        button.addEventListener("click", () => {
            openConversation(button.dataset.userId);
        });
    });
}

async function openConversation(userId) {
    currentConversation = userId;

    const conversation = conversations.find(
        item => item.userId === userId
    );

    if (!conversation) return;

    chatName.textContent =
        conversation.profile?.full_name || "User";

    chatAvatar.src =
        conversation.profile?.avatar_url || DEFAULT_AVATAR;

    chatStatus.textContent = "Conversation";

    emptyChat?.classList.add("hidden");
    chatMessages?.classList.remove("hidden");

    renderConversations(conversations);

    const result = await getMessages(
        currentUser.id,
        userId
    );

    if (!result.success) {
        showToast("Unable to load messages.", {
            type: "error"
        });
        return;
    }

    renderMessages(result.data);

    for (const message of result.data) {
        if (
            message.receiver_id === currentUser.id &&
            !message.is_read
        ) {
            await markMessageRead(message.id);
        }
    }

    messageInput?.focus();
}

function renderMessages(messages) {
    if (!chatMessages) return;

    if (!messages.length) {
        chatMessages.innerHTML = `
            <div class="empty-state">
                <p>No messages yet. Start the conversation.</p>
            </div>
        `;
        return;
    }

    chatMessages.innerHTML = messages.map(message => {
        const own = message.sender_id === currentUser.id;

        return `
            <div class="message ${own ? "sent" : "received"}">
                <div class="message-bubble">
                    <p>${escapeHtml(message.message)}</p>
                    <small>${formatDate(message.created_at)}</small>
                </div>
            </div>
        `;
    }).join("");

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function handleSendMessage(event) {
    event.preventDefault();

    if (!currentConversation) {
        showToast("Select a conversation first.", {
            type: "error"
        });
        return;
    }

    const message = messageInput.value.trim();

    if (!message) return;

    const button = document.getElementById("sendMessage");

    button.disabled = true;

    const result = await sendMessage({
        receiverId: currentConversation,
        message
    });

    button.disabled = false;

    if (!result.success) {
        showToast("Message could not be sent.", {
            type: "error"
        });
        return;
    }

    messageInput.value = "";

    await openConversation(currentConversation);
    await loadConversations();
}

function filterConversations() {
    const term =
        conversationSearch.value.trim().toLowerCase();

    const filtered = conversations.filter(item =>
        (item.profile?.full_name || "")
            .toLowerCase()
            .includes(term)
    );

    renderConversations(filtered);
}

initialize();