import { initPageModule } from "../page-module.js";
import { supabase } from "../../api.js";

const FALLBACK_PHOTO = "../assets/images/university-campus.jpg";

const $ = (id) => document.getElementById(id);

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value ?? "";
}

// Quote-safe CSS url() value for database URLs
function cssUrl(url) {
    return `url("${String(url).replace(/"/g, "%22")}")`;
}

function showMessage(title, text) {
    setText("universityName", title);
    setText("universityDescription", text);
}

async function loadUniversity() {
    const id = new URLSearchParams(window.location.search).get("id");

    if (!id) {
        showMessage("No university selected", "Open this page from a university in the list.");
        return;
    }

    const { data, error } = await supabase
        .from("universities")
        .select("id, name, location, city, state, description, logo_url, image_url, student_population")
        .eq("id", id)
        .maybeSingle();

    if (error || !data) {
        showMessage("University not found", "This university could not be loaded.");
        return;
    }

    document.title = `${data.name} | ResiHub`;

    setText("universityName", data.name);
    setText("universityCity", data.city);
    setText("universityState", data.state);
    setText("universityLocation", data.location);
    setText("universityDescription", data.description || "No description has been added yet.");
    setText(
        "studentPopulation",
        data.student_population != null ? Number(data.student_population).toLocaleString() : "—"
    );

    // Hero photo from the database, with the campus image as fallback
    const hero = document.querySelector(".uni-hero");
    if (hero) {
        hero.style.setProperty("--uni-hero-photo", cssUrl(data.image_url || FALLBACK_PHOTO));
    }

    // Logo in front and large faded logo behind the hero
    const logo = $("universityImage");
    const watermark = $("universityLogoBg");

    if (data.logo_url) {
        logo.src = data.logo_url;
        logo.alt = `${data.name} logo`;
        logo.hidden = false;

        watermark.src = data.logo_url;
        watermark.hidden = false;
    } else {
        logo.hidden = true;
        watermark.hidden = true;
    }
}

export function init() {
    initPageModule({ area: "general", page: "university_details" });
    loadUniversity();
}