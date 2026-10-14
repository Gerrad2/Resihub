import { showToast } from "../ui/toast.js";

function initFaq() {
    document.querySelectorAll(".faq-question, .faq-item button").forEach((button) => {
        button.addEventListener("click", () => {
            const item = button.closest(".faq-item");
            if (!item) return;
            const open = !item.classList.contains("active");
            item.parentElement?.querySelectorAll(".faq-item.active").forEach((other) => other.classList.remove("active"));
            item.classList.toggle("active", open);
            button.setAttribute("aria-expanded", String(open));
        });
    });
}

function initFilters() {
    const panel = document.getElementById("filtersPanel");
    document.getElementById("toggleFilters")?.addEventListener("click", () => panel?.classList.toggle("active"));
    document.getElementById("resetFilters")?.addEventListener("click", () => {
        document.getElementById("filterForm")?.reset();
        document.getElementById("browseSearchForm")?.reset();
    });
    [["gridView", "grid-view"], ["listView", "list-view"]].forEach(([id, name]) => {
        document.getElementById(id)?.addEventListener("click", () => {
            const results = document.getElementById("listingsContainer");
            results?.classList.remove("grid-view", "list-view");
            results?.classList.add(name);
            document.getElementById("gridView")?.classList.toggle("active", id === "gridView");
            document.getElementById("listView")?.classList.toggle("active", id === "listView");
        });
    });
}

function initForms() {
    document.querySelectorAll("form").forEach((form) => form.addEventListener("submit", (event) => {
        if (!form.checkValidity()) {
            event.preventDefault();
            form.classList.add("was-validated");
            form.querySelector(":invalid")?.focus();
        }
    }));
    document.querySelectorAll("[data-password-toggle]").forEach((button) => button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        if (!input) return;
        input.type = input.type === "password" ? "text" : "password";
        button.setAttribute("aria-pressed", String(input.type === "text"));
    }));
    document.querySelectorAll("[data-demo-submit]").forEach((button) => button.addEventListener("click", () => showToast("This action will be connected to Supabase once the database is ready.", { type: "info" })));
}

function initUploadPreview() {
    const input = document.getElementById("propertyImages") || document.getElementById("profileImage");
    const preview = document.getElementById("imagePreview") || document.getElementById("profilePreview");
    input?.addEventListener("change", () => {
        if (!preview || !input.files?.length) return;
        preview.replaceChildren(...[...input.files].slice(0, 6).map((file) => {
            const image = document.createElement("img");
            image.src = URL.createObjectURL(file);
            image.alt = "Selected image preview";
            image.onload = () => URL.revokeObjectURL(image.src);
            return image;
        }));
    });
}

export function initPage() {
    initFaq();
    initFilters();
    initForms();
    initUploadPreview();
}
