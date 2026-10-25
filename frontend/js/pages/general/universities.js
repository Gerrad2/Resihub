import { initPageModule } from "../page-module.js";
import { getListings, getUniversities } from "../../api.js";
import { createUniversityCard } from "./university-card.js";

const $ = (id) => document.getElementById(id);

let universities = [];

export function init() {
    initPageModule({ area: "general", page: "universities" });
    bindEvents();
    load();
}

async function load() {
    const [universityResult, listingResult] = await Promise.all([
        getUniversities(),
        getListings({ pageSize: 1 }),
    ]);

    universities = universityResult.success ? universityResult.data ?? [] : [];

    setText("totalUniversities", universities.length);
    setText("totalStates", uniqueStates().length);
    setText(
        "totalListings",
        listingResult.success ? listingResult.data?.count ?? 0 : "—"
    );

    fillStateFilter();
    render();
}

function uniqueStates() {
    return [...new Set(universities.map((u) => u.state).filter(Boolean))].sort();
}

function fillStateFilter() {
    const select = $("stateFilter");
    uniqueStates().forEach((state) => select?.append(new Option(state, state)));
}

function visibleUniversities() {
    const query = $("searchUniversity")?.value.trim().toLowerCase() ?? "";
    const state = $("stateFilter")?.value ?? "";

    return universities.filter((university) => {
        const matchesText =
            !query ||
            [university.name, university.city, university.state, university.location].some((value) =>
                String(value ?? "").toLowerCase().includes(query)
            );
        const matchesState = !state || university.state === state;
        return matchesText && matchesState;
    });
}

function render() {
    const items = visibleUniversities();
    $("universitiesGrid")?.replaceChildren(...items.map((u) => createUniversityCard(u)));
    $("emptyUniversities")?.classList.toggle("hidden", items.length > 0);
}

function bindEvents() {
    $("searchUniversity")?.addEventListener("input", render);
    $("stateFilter")?.addEventListener("change", render);

    $("resetUniversitySearch")?.addEventListener("click", () => {
        $("searchUniversity").value = "";
        $("stateFilter").value = "";
        render();
    });
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}