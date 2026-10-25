import { getCurrentUser, supabase } from "./api.js";
import { showToast } from "./ui/toast.js";

const $ = (id) => document.getElementById(id);

const STATUS = {
    open: { label: "Open", className: "sp-open" },
    in_progress: { label: "In progress", className: "sp-progress" },
    awaiting_user: { label: "Awaiting your reply", className: "sp-progress" },
    resolved: { label: "Resolved", className: "sp-resolved" },
    closed: { label: "Closed", className: "sp-closed" },
};

const PRIORITY = {
    low: { label: "Low", className: "sp-low" },
    medium: { label: "Medium", className: "sp-medium" },
    high: { label: "High", className: "sp-high" },
    urgent: { label: "Urgent", className: "sp-high" },
};

export async function initSupport({ role }) {
    const userResult = await getCurrentUser();

    if (!userResult.success || !userResult.data) {
        showToast("Please sign in to contact ResiHub support.", { type: "error" });
        return;
    }

    const user = userResult.data;

    $("supportForm")?.addEventListener("submit", (event) => submit(event, user, role));

    await loadTickets(user);
}

async function submit(event, user, role) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);

    const payload = {
        user_id: user.id,
        role,
        category: String(data.get("category") ?? "").trim(),
        priority: role === "student" ? String(data.get("priority") ?? "medium") : "medium",
        subject: String(data.get("subject") ?? "").trim(),
        description: String(data.get("message") ?? "").trim(),
    };

    if (!payload.category || payload.subject.length < 3 || payload.description.length < 10) {
        showToast("Choose a category, and add a subject and a message of at least 10 characters.", {
            type: "error",
        });
        return;
    }

    const button = $("supportSubmit");
    button.disabled = true;

    const { error } = await supabase.from("support_tickets").insert(payload);

    button.disabled = false;

    if (error) {
        showToast("Your message could not be sent. Please try again.", { type: "error" });
        return;
    }

    form.reset();
    showToast("Thank you. Your message has been sent to the ResiHub team.", { type: "success" });

    await loadTickets(user);
}

async function loadTickets(user) {
    const { data, error } = await supabase
        .from("support_tickets")
        .select("id, category, priority, subject, description, status, admin_reply, replied_at, created_at, role")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (error) {
        showToast("Your messages could not be loaded.", { type: "error" });
        return;
    }

    renderTickets(data ?? []);
}

function renderTickets(tickets) {
    const list = $("ticketList");
    if (!list) return;

    list.replaceChildren(...tickets.map((ticket) => createTicket(ticket)));
    $("ticketEmpty")?.classList.toggle("hidden", tickets.length > 0);
}

function createTicket(ticket) {
    const card = document.createElement("article");
    card.className = "sp-ticket";

    const head = document.createElement("div");
    head.className = "sp-ticket-head";

    const title = document.createElement("h3");
    title.textContent = ticket.subject;

    const badges = document.createElement("div");
    badges.className = "sp-badges";

    const status = STATUS[ticket.status] ?? STATUS.open;
    const statusBadge = document.createElement("span");
    statusBadge.className = `sp-badge ${status.className}`;
    statusBadge.textContent = status.label;
    badges.append(statusBadge);

    if (ticket.role === "student") {
        const priority = PRIORITY[ticket.priority] ?? PRIORITY.medium;
        const priorityBadge = document.createElement("span");
        priorityBadge.className = `sp-badge ${priority.className}`;
        priorityBadge.textContent = `${priority.label} priority`;
        badges.append(priorityBadge);
    }

    head.append(title, badges);

    const meta = document.createElement("p");
    meta.className = "sp-meta";
    meta.textContent = `${ticket.category ?? "Other"} · ${formatDate(ticket.created_at)}`;

    const body = document.createElement("p");
    body.className = "sp-message";
    body.textContent = ticket.description;

    card.append(head, meta, body);

    if (ticket.admin_reply) {
        const reply = document.createElement("div");
        reply.className = "sp-reply";

        const label = document.createElement("strong");
        label.textContent = "ResiHub support replied";

        const text = document.createElement("p");
        text.textContent = ticket.admin_reply;

        const when = document.createElement("span");
        when.textContent = ticket.replied_at ? formatDate(ticket.replied_at) : "";

        reply.append(label, text, when);
        card.append(reply);
    }

    return card;
}

function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}