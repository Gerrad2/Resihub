import { getCurrentUser, supabase } from "../api.js";

const POLL_MS = 30000;
const SEEN_KEY = "resihub:seen-notification-ids";

let audioContext = null;
let unlocked = false;
let timer = null;

/* Starts checking for new notifications. Call once per portal page. */
export function startNotificationAlerts() {
    unlockAudioOnFirstInteraction();

    check();
    timer = setInterval(check, POLL_MS);

    // Check straight away when the person returns to the tab
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
    });
}

async function check() {
    const userResult = await getCurrentUser();
    if (!userResult.success || !userResult.data) return;

    const { data, error } = await supabase
        .from("notifications")
        .select("id, title, created_at")
        .eq("user_id", userResult.data.id)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(50);

    if (error) {
        console.error("[alerts] could not check notifications:", error);
        return;
    }

    const unread = data ?? [];
    updateCounts(unread.length);

    const seen = loadSeen();
    const fresh = unread.filter((item) => !seen.has(item.id));

    if (fresh.length > 0) {
        playAlertSound();
        showBrowserNote(fresh);
        fresh.forEach((item) => seen.add(item.id));
        saveSeen(seen);
    }
}

/* Shows the count on the bell badge and in the page title */
function updateCounts(count) {
    const badge = document.getElementById("notificationBadge");
    if (badge) {
        badge.textContent = count;
        badge.classList.toggle("hidden", count === 0);
    }

    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = count > 0 ? `(${count}) ${base}` : base;
}

/* A short two-tone beep, generated in the browser */
function playAlertSound() {
    if (!unlocked) return;

    try {
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        const now = audioContext.currentTime;

        [880, 660].forEach((frequency, index) => {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();

            oscillator.type = "sine";
            oscillator.frequency.value = frequency;

            gain.gain.setValueAtTime(0.0001, now + index * 0.18);
            gain.gain.exponentialRampToValueAtTime(0.25, now + index * 0.18 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.18 + 0.16);

            oscillator.connect(gain).connect(audioContext.destination);
            oscillator.start(now + index * 0.18);
            oscillator.stop(now + index * 0.18 + 0.18);
        });
    } catch (error) {
        console.warn("[alerts] sound could not play:", error);
    }
}

/* Browsers block sound until the person has clicked or pressed a key */
function unlockAudioOnFirstInteraction() {
    const unlock = () => {
        unlocked = true;
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
    };

    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
}

/* A small on-screen message for new notifications */
function showBrowserNote(items) {
    const note = document.createElement("div");
    note.className = "alert-note";

    const text = document.createElement("strong");
    text.textContent = items.length === 1
        ? "You have a new notification"
        : `You have ${items.length} new notifications`;

    const link = document.createElement("a");
    link.href = notificationsPageUrl();
    link.textContent = "View";

    note.append(text, link);
    document.body.append(note);

    setTimeout(() => note.remove(), 6000);
}

function notificationsPageUrl() {
    return location.pathname.includes("/landlord/")
        ? "../landlord/landlord_notifications.htm"
        : "../student/notification.htm";
}

function loadSeen() {
    try {
        return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]"));
    } catch {
        return new Set();
    }
}

function saveSeen(set) {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
}