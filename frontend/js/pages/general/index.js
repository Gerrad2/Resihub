import { initPageModule } from "../page-module.js";
import { getListings, getUniversities, supabase } from "../../api.js";
import { renderListingCards } from "../../listings.js";
import { createUniversityCard } from "./university-card.js";
import { showToast } from "../../ui/toast.js";

const $ = (id) => document.getElementById(id);

export function init() {
    initPageModule({ area: "general", page: "index" });
    load();
    loadTestimonials();
    bindNewsletter();
}

async function load() {
    const [listingResult, universityResult, statsResult] = await Promise.all([
        getListings({ pageSize: 3 }),
        getUniversities(),
        supabase.rpc("public_stats"),
    ]);

    if (listingResult.success) {
        renderListingCards($("featuredRooms"), listingResult.data?.listings ?? [], {
            emptyMessage: "No rooms are listed yet. Check back soon.",
        });
    } else {
        renderListingCards($("featuredRooms"), [], {
            emptyMessage: "Rooms could not be loaded right now.",
        });
    }

    if (universityResult.success) {
        $("universitiesGrid")?.replaceChildren(
            ...(universityResult.data ?? []).slice(0, 4).map((u) => createUniversityCard(u))
        );
    }

    const stats = statsResult.error ? null : statsResult.data;
    setText("listingCount", stats?.listings ?? "—");
    setText("studentCount", stats?.students ?? "—");
    setText("landlordCount", stats?.landlords ?? "—");
    setText("universityCount", stats?.universities ?? "—");
    setText("reviewCount", stats?.reviews ?? "—");
}

/* Only reviews with 4 or 5 stars and a written comment are shown.
   If there are none, the whole section is hidden. */
async function loadTestimonials() {
    const section = document.querySelector(".testimonials");
    const grid = $("testimonialsGrid");

    const { data, error } = await supabase
        .from("reviews")
        .select("rating, comment, profiles(full_name)")
        .gte("rating", 4)
        .not("comment", "is", null)
        .order("created_at", { ascending: false })
        .limit(3);

    if (error || !data?.length) {
        section?.setAttribute("hidden", "");
        return;
    }

    grid?.replaceChildren(...data.map((review) => createTestimonialCard(review)));
}

function createTestimonialCard(review) {
    const card = document.createElement("article");
    card.className = "testimonial-card";

    const stars = document.createElement("div");
    stars.className = "testimonial-stars";
    stars.setAttribute("aria-label", `${review.rating} out of 5 stars`);
    for (let i = 1; i <= 5; i++) {
        const star = document.createElement("i");
        star.className = i <= review.rating ? "fa-solid fa-star" : "fa-regular fa-star";
        star.setAttribute("aria-hidden", "true");
        stars.append(star);
    }

    const quote = document.createElement("p");
    quote.className = "testimonial-text";
    quote.textContent = `"${review.comment}"`;

    const name = document.createElement("p");
    name.className = "testimonial-name";
    name.textContent = review.profiles?.full_name || "ResiHub student";

    card.append(stars, quote, name);
    return card;
}

function bindNewsletter() {
    $("newsletterForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const form = event.currentTarget;
        const email = new FormData(form).get("email")?.toString().trim();
        if (!email) return;

        const button = form.querySelector("button");
        button.disabled = true;

        const { error } = await supabase.from("newsletter_subscribers").insert({ email });

        button.disabled = false;

        if (error?.code === "23505") {
            showToast("You're already subscribed.", { type: "info" });
            return;
        }

        if (error) {
            showToast("Could not subscribe right now. Please try again.", { type: "error" });
            return;
        }

        form.reset();
        showToast("Thanks for subscribing!", { type: "success" });
    });
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}