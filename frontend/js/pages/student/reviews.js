import { getCurrentUser, getUniversities, supabase } from "../../api.js";
import { showError } from "../../student_utils.js";
import { showToast } from "../../ui/toast.js";

const $ = (id) => document.getElementById(id);
const DEFAULT_AVATAR = "../assets/images/default-avatar.png";
const PAGE_SIZE = 12;

let me = null;
let universities = [];
let mine = [];
let all = [];
let allOffset = 0;
let allHasMore = true;
let allLoading = false;
let tab = "mine";

export async function init() {
    bindEvents();
    bindCompose();

    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;

    if (!me) {
        showError("Please sign in to see your reviews.");
        return;
    }

    const uniResult = await getUniversities();
    universities = uniResult.success ? uniResult.data ?? [] : [];
    fillUniversityFilter();

    await loadMine();
    render();
}

function bindEvents() {
    $("reviewFilterForm")?.addEventListener("submit", (event) => event.preventDefault());
    $("reviewSearch")?.addEventListener("input", render);
    $("reviewUniversity")?.addEventListener("change", render);
    $("reviewRating")?.addEventListener("change", render);
    $("reviewSort")?.addEventListener("change", render);

    document.querySelectorAll("[data-review-tab]").forEach((button) => {
        button.addEventListener("click", async () => {
            tab = button.dataset.reviewTab;

            if (tab === "all" && !all.length && allHasMore) {
                await loadAll(true);
            }

            render();
        });
    });

    $("loadMoreReviews")?.addEventListener("click", async () => {
        await loadAll(false);
        render();
    });
}

/* ---------- Write a review ---------- */

function bindCompose() {
    $("writeReviewBtn")?.addEventListener("click", openCompose);
    $("composeCancel")?.addEventListener("click", closeCompose);
    $("composeListing")?.addEventListener("change", prefillFromListing);
    $("composeForm")?.addEventListener("submit", submitReview);
}

/* Rooms whose booking is completed, for the room dropdown */
async function openCompose() {
    const panel = $("composePanel");
    if (!panel) return;

    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });

    const { data, error } = await supabase
        .from("booking_requests")
        .select("listing_id, listings(title)")
        .eq("student_id", me.id)
        .eq("status", "completed");

    if (error) {
        showToast("Your completed stays could not be loaded.", { type: "error" });
        return;
    }

    const rooms = new Map();
    for (const row of data ?? []) {
        if (row.listing_id && !rooms.has(row.listing_id)) {
            rooms.set(row.listing_id, row.listings?.title || "Room");
        }
    }

    const select = $("composeListing");
    select.replaceChildren(
        new Option("Choose a room", ""),
        ...[...rooms.entries()].map(([id, title]) => new Option(title, id))
    );

    const hasStays = rooms.size > 0;
    $("composeEmpty")?.classList.toggle("hidden", hasStays);
    $("composeForm")?.classList.toggle("hidden", !hasStays);

    clearFields();
}

function closeCompose() {
    $("composePanel")?.classList.add("hidden");
    $("composeForm")?.reset();
    clearFields();
}

/* If the chosen room already has a review, load it so it can be edited */
function prefillFromListing() {
    const listingId = $("composeListing").value;
    const existing = mine.find((review) => review.listing_id === listingId);

    clearFields();

    if (existing) {
        setRating(existing.rating);
        $("composeComment").value = existing.comment ?? "";
        $("composeSubmit").textContent = "Update review";
    }
}

async function submitReview(event) {
    event.preventDefault();

    const listingId = $("composeListing").value;
    const rating = selectedRating();
    const comment = $("composeComment").value.trim();

    if (!listingId) {
        showToast("Choose the room you stayed in.", { type: "error" });
        return;
    }

    if (!rating) {
        showToast("Choose a star rating.", { type: "error" });
        return;
    }

    const button = $("composeSubmit");
    button.disabled = true;

    const existing = mine.find((review) => review.listing_id === listingId);
    const payload = { rating, comment: comment || null };

    const result = existing
        ? await supabase.from("reviews").update(payload).eq("id", existing.id)
        : await supabase
            .from("reviews")
            .insert({ ...payload, student_id: me.id, listing_id: listingId });

    button.disabled = false;

    if (result.error) {
        showToast(reviewErrorMessage(result.error), { type: "error" });
        return;
    }

    showToast(existing ? "Your review has been updated." : "Thank you for your review.", {
        type: "success",
    });

    closeCompose();

    await loadMine();

    if (tab === "all") {
        await loadAll(true);
    }

    render();
}

function selectedRating() {
    return Number(document.querySelector('input[name="composeRating"]:checked')?.value) || 0;
}

function setRating(value) {
    document.querySelectorAll('input[name="composeRating"]').forEach((input) => {
        input.checked = Number(input.value) === value;
    });
}

function clearFields() {
    document.querySelectorAll('input[name="composeRating"]').forEach((input) => {
        input.checked = false;
    });
    $("composeComment").value = "";
    $("composeSubmit").textContent = "Submit review";
}

function reviewErrorMessage(error) {
    if (error.code === "23505") {
        return "You have already reviewed this room.";
    }
    if (error.code === "42501") {
        return "You can review a room once your stay has been marked completed.";
    }
    return "Your review could not be saved. Please try again.";
}

/* ---------- Lists and summary ---------- */

function fillUniversityFilter() {
    const select = $("reviewUniversity");
    if (!select) return;

    universities.forEach((university) => {
        select.append(new Option(university.name, university.id));
    });
}

/* Reviews this student has written */
async function loadMine() {
    const { data, error } = await supabase
        .from("reviews")
        .select("id, rating, comment, created_at, listing_id, listings(title, university_id)")
        .eq("student_id", me.id)
        .order("created_at", { ascending: false });

    if (error) {
        showError("Your reviews could not be loaded.");
        mine = [];
    } else {
        mine = (data ?? []).map((review) => ({
            ...review,
            mine: true,
            reviewer: { full_name: "You", avatar_url: null },
        }));
    }

    renderSummary();
}

/* Everyone's reviews, in pages */
async function loadAll(reset) {
    if (allLoading) return;
    if (!reset && !allHasMore) return;

    allLoading = true;

    if (reset) {
        all = [];
        allOffset = 0;
        allHasMore = true;
    }

    const from = allOffset;
    const to = allOffset + PAGE_SIZE - 1;

    const { data, error } = await supabase
        .from("reviews")
        .select("id, rating, comment, created_at, student_id, listing_id, listings(title, university_id), profiles(full_name, avatar_url)")
        .order("created_at", { ascending: false })
        .range(from, to);

    allLoading = false;

    if (error) {
        showToast("Reviews could not be loaded. Please try again.", { type: "error" });
        return;
    }

    const rows = (data ?? []).map((review) => ({
        ...review,
        mine: review.student_id === me.id,
        reviewer: review.profiles,
    }));

    all = all.concat(rows);
    allOffset += rows.length;
    allHasMore = rows.length === PAGE_SIZE;
}

function renderSummary() {
    const count = mine.length;
    const average = count ? mine.reduce((sum, r) => sum + r.rating, 0) / count : 0;

    setText("averageRating", count ? average.toFixed(1) : "—");
    setText("totalReviews", count);
    setText("reviewedListings", new Set(mine.map((r) => r.listing_id)).size);

    renderStars("ratingStars", average);

    const bars = $("ratingBars");
    if (bars) {
        bars.replaceChildren(
            ...[5, 4, 3, 2, 1].map((stars) => {
                const n = mine.filter((r) => r.rating === stars).length;
                return createBar(stars, n, count);
            })
        );
    }
}

function createBar(stars, count, total) {
    const row = document.createElement("div");
    row.className = "rv-bar";

    const label = document.createElement("span");
    label.textContent = `${stars} ★`;

    const track = document.createElement("div");
    track.className = "rv-bar-track";

    const fill = document.createElement("div");
    fill.className = "rv-bar-fill";
    fill.style.width = total ? `${(count / total) * 100}%` : "0%";

    track.append(fill);

    const number = document.createElement("span");
    number.textContent = count;

    row.append(label, track, number);
    return row;
}

function renderStars(containerId, value) {
    const container = $(containerId);
    if (!container) return;

    const filled = Math.round(value);
    const icons = [1, 2, 3, 4, 5].map((i) => {
        const icon = document.createElement("i");
        icon.className = i <= filled ? "fa-solid fa-star" : "fa-regular fa-star off";
        icon.setAttribute("aria-hidden", "true");
        return icon;
    });

    container.replaceChildren(...icons);
}

function visibleReviews() {
    const source = tab === "mine" ? mine : all;

    const query = ($("reviewSearch")?.value ?? "").trim().toLowerCase();
    const university = $("reviewUniversity")?.value ?? "";
    const rating = Number($("reviewRating")?.value) || 0;
    const sort = $("reviewSort")?.value ?? "newest";

    const items = source.filter((review) => {
        const title = (review.listings?.title ?? "").toLowerCase();
        const comment = (review.comment ?? "").toLowerCase();

        const matchesQuery = !query || title.includes(query) || comment.includes(query);
        const matchesUniversity = !university || review.listings?.university_id === university;
        const matchesRating = !rating || review.rating === rating;

        return matchesQuery && matchesUniversity && matchesRating;
    });

    items.sort((a, b) => {
        if (sort === "highest") return b.rating - a.rating;
        if (sort === "lowest") return a.rating - b.rating;
        if (sort === "oldest") return new Date(a.created_at) - new Date(b.created_at);
        return new Date(b.created_at) - new Date(a.created_at);
    });

    return items;
}

function render() {
    const items = visibleReviews();

    $("reviewGrid")?.replaceChildren(...items.map((review) => createCard(review)));
    $("emptyReviews")?.classList.toggle("hidden", items.length > 0);
    $("loadMoreReviews")?.classList.toggle("hidden", tab !== "all" || !allHasMore);

    document.querySelectorAll("[data-review-tab]").forEach((button) => {
        button.classList.toggle("active", button.dataset.reviewTab === tab);
    });
}

function createCard(review) {
    const card = document.createElement("article");
    card.className = "rv-card";

    const head = document.createElement("div");
    head.className = "rv-head";

    const avatar = document.createElement("img");
    avatar.src = review.reviewer?.avatar_url || DEFAULT_AVATAR;
    avatar.alt = "";

    const who = document.createElement("div");

    const name = document.createElement("strong");
    name.textContent = review.mine ? "You" : review.reviewer?.full_name || "Student";

    const date = document.createElement("span");
    date.textContent = formatDate(review.created_at);

    who.append(name, date);
    head.append(avatar, who);

    const listing = document.createElement("a");
    listing.className = "rv-listing";
    listing.href = `../general/room_details.htm?id=${encodeURIComponent(review.listing_id)}`;
    listing.textContent = review.listings?.title || "Room";

    const stars = document.createElement("div");
    stars.className = "rv-stars";
    [1, 2, 3, 4, 5].forEach((i) => {
        const icon = document.createElement("i");
        icon.className = i <= review.rating ? "fa-solid fa-star" : "fa-regular fa-star off";
        icon.setAttribute("aria-hidden", "true");
        stars.append(icon);
    });

    const comment = document.createElement("p");
    comment.className = review.comment ? "rv-comment" : "rv-comment empty";
    comment.textContent = review.comment || "No comment written.";

    card.append(head, listing, stars, comment);
    return card;
}

function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}