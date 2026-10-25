export function createUniversityCard(university) {
    const card = document.createElement("a");
    card.className = "uni-card";
    card.href = `university_details.htm?id=${encodeURIComponent(university.id)}`;

    const logo = document.createElement("div");
    logo.className = "uni-logo";

    if (university.logo_url) {
        const img = document.createElement("img");
        img.src = university.logo_url;
        img.alt = "";
        logo.append(img);
    } else {
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-building-columns";
        icon.setAttribute("aria-hidden", "true");
        logo.append(icon);
    }

    const info = document.createElement("div");
    info.className = "uni-info";

    const name = document.createElement("h3");
    name.className = "uni-name";
    name.textContent = university.name;

    const location = document.createElement("p");
    location.className = "uni-location";
    location.textContent = [university.city, university.state].filter(Boolean).join(", ");

    const meta = document.createElement("p");
    meta.className = "uni-meta";
    if (university.student_population) {
        meta.textContent = `${Number(university.student_population).toLocaleString()} students`;
    }

    const link = document.createElement("span");
    link.className = "uni-link";
    link.innerHTML = 'View Rooms <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';

    info.append(name, location, meta, link);
    card.append(logo, info);
    return card;
}