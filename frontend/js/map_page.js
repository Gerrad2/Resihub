import { getCurrentUser, supabase } from "./api.js";
import { showError } from "./student_utils.js";
import { watchTables } from "./core/realtime.js";

const $ = (id) => document.getElementById(id);

const LAGOS = [6.5244, 3.3792];
const APPROX_RADIUS_M = 1100;
const AVAILABILITY_LABEL = { available: "Available", booked: "Booked", unavailable: "Unavailable" };

const money = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
});

let me = null;
let mode = "student";
let map = null;
let layer = null;
let points = [];
let fitted = false;

export async function init() {
    mode = document.body.dataset.mapMode === "landlord" ? "landlord" : "student";

    const userResult = await getCurrentUser();
    me = userResult.success ? userResult.data : null;

    if (!me) {
        showError("Please sign in to use the map.");
        return;
    }

    setupMap();
    await loadPoints();
    startLive();
}

function setupMap() {
    if (typeof L === "undefined") {
        setStatus("The map could not be loaded. Check your connection and refresh the page.");
        return;
    }

    map = L.map($("mapCanvas")).setView(LAGOS, 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    layer = L.layerGroup().addTo(map);

    $("mapAvailability")?.addEventListener("change", renderPins);
    $("mapClose")?.addEventListener("click", closeDetail);
}

/* ---------- Data ---------- */

async function loadPoints() {
    const [approx, exact] = await Promise.all([
        supabase
            .from("listing_map_points")
            .select("id, title, price, property_type, availability_status, latitude, longitude"),
        loadExact(),
    ]);

    if (approx.error) {
        console.error("[map] could not load rooms:", approx.error);
        setStatus("Rooms could not be loaded on the map.");
        return;
    }

    points = mergePoints(approx.data ?? [], exact);
    renderPins();
}

// Exact coordinates the person is allowed to see
async function loadExact() {
    const exact = new Map();

    if (mode === "landlord") {
        const { data, error } = await supabase
            .from("listings")
            .select("id, title, price, property_type, availability_status, latitude, longitude")
            .eq("landlord_id", me.id)
            .not("latitude", "is", null)
            .not("longitude", "is", null);

        if (error) {
            console.error("[map] could not load your rooms:", error);
            return exact;
        }

        for (const row of data ?? []) {
            exact.set(row.id, { ...row, lat: Number(row.latitude), lng: Number(row.longitude) });
        }
        return exact;
    }

    const { data: bookings, error } = await supabase
        .from("booking_requests")
        .select("listing_id")
        .eq("student_id", me.id)
        .eq("status", "approved");

    if (error) {
        console.error("[map] could not load your bookings:", error);
        return exact;
    }

    const ids = [...new Set((bookings ?? []).map((b) => b.listing_id).filter(Boolean))];

    await Promise.all(
        ids.map(async (id) => {
            const { data, error: rpcError } = await supabase.rpc("resihub_exact_location", { p_listing: id });
            if (rpcError || !data?.length) return;

            exact.set(id, {
                id,
                lat: Number(data[0].latitude),
                lng: Number(data[0].longitude),
            });
        })
    );

    return exact;
}

function mergePoints(approx, exact) {
    const merged = new Map();

    for (const row of approx) {
        merged.set(row.id, {
            ...row,
            lat: Number(row.latitude),
            lng: Number(row.longitude),
            exact: false,
        });
    }

    for (const [id, spot] of exact) {
        const base = merged.get(id);

        if (base) {
            base.lat = spot.lat;
            base.lng = spot.lng;
            base.exact = true;
        } else if (spot.title) {
            // Landlords see their own rooms even when they are not published
            merged.set(id, { ...spot, exact: true });
        }
    }

    return [...merged.values()];
}

/* ---------- Pins ---------- */

function renderPins() {
    if (!map) return;

    layer.clearLayers();

    const wanted = $("mapAvailability")?.value ?? "";
    const visible = points.filter((p) => !wanted || p.availability_status === wanted);

    for (const p of visible) {
        const shape = p.exact
            ? L.marker([p.lat, p.lng])
            : L.circle([p.lat, p.lng], {
                radius: APPROX_RADIUS_M,
                color: "#3b82f6",
                fillColor: "#3b82f6",
                fillOpacity: 0.18,
                weight: 2,
            });

        shape.on("click", () => openDetail(p));
        shape.addTo(layer);
    }

    if (!fitted && visible.length) {
        const bounds = L.latLngBounds(visible.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        fitted = true;
    }

    setStatus(`${visible.length} ${visible.length === 1 ? "room" : "rooms"} on the map`);
}

/* ---------- Room card ---------- */

function openDetail(p) {
    const card = $("mapDetail");
    if (!card) return;

    setText("mapDetailTitle", p.title || "Room");
    setText("mapDetailPrice", p.price != null ? `${money.format(p.price)}/month` : "Price on request");
    setText(
        "mapDetailMeta",
        [p.property_type, AVAILABILITY_LABEL[p.availability_status]].filter(Boolean).join(" · ")
    );
    setText("mapDetailLocation", p.exact ? "Exact location" : "General area (about 1 km)");

    const link = $("mapDetailLink");
    if (link) {
        const target = mode === "landlord" ? "listing_details.htm" : "../general/room_details.htm";
        link.href = `${target}?id=${encodeURIComponent(p.id)}`;
    }

    card.classList.remove("hidden");
    map.panTo([p.lat, p.lng]);
}

function closeDetail() {
    $("mapDetail")?.classList.add("hidden");
}

/* ---------- Live updates ---------- */

function startLive() {
    watchTables(
        `map-${me.id}`,
        [{ table: "listings" }, { table: "booking_requests" }],
        () => loadPoints()
    );
}

/* ---------- Helpers ---------- */

function setStatus(text) {
    setText("mapStatus", text);
}

function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
}