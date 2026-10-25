const REMINDER_KEY = "resihub:verify-reminder-day";

/* Badge that shows a landlord's status */
export function trustBadge(status) {
    const verified = status === "verified";

    const badge = document.createElement("span");
    badge.className = `trust-badge ${verified ? "verified" : "unverified"}`;
    badge.textContent =
        verified ? "✔ Verified landlord" :
            status === "pending" ? "Verification pending" :
                "Not yet verified";

    return badge;
}

/* Caution note for students, shown only for unverified landlords */
export function unverifiedNotice(status) {
    if (status === "verified") return null;

    const note = document.createElement("p");
    note.className = "trust-notice";
    note.textContent =
        "This landlord hasn't completed verification yet. Check their listings and reviews carefully before you pay anything.";
    return note;
}

/* Landlord reminder, hidden for the rest of the day once dismissed */
export function renderLandlordBanner(container, status) {
    if (!container || status === "verified") return;

    const today = new Date().toDateString();
    if (localStorage.getItem(REMINDER_KEY) === today) return;

    const box = document.createElement("div");
    box.className = "verify-banner";

    const text = document.createElement("p");
    text.textContent = status === "pending"
        ? "Your verification is in progress. You'll be notified once it's complete."
        : "Your business isn't verified yet. Verify to publish more than 3 listings and show the verified badge to students.";

    const link = document.createElement("a");
    link.href = "verify_account.htm";
    link.textContent = status === "pending" ? "View progress" : "Verify now";

    const later = document.createElement("button");
    later.type = "button";
    later.textContent = "Remind me tomorrow";
    later.addEventListener("click", () => {
        localStorage.setItem(REMINDER_KEY, today);
        box.remove();
    });

    box.append(text, link, later);
    container.replaceChildren(box);
}