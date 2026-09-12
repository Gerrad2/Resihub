import { showToast } from "../ui/toast.js";

function syncSearchToUrl(form) {
    form.addEventListener("submit", (event) => {
        if (!form.checkValidity()) return;
        event.preventDefault();
        const params = new URLSearchParams(location.search);
        new FormData(form).forEach((value, key) => {
            if (String(value).trim()) params.set(key, value);
            else params.delete(key);
        });
        location.assign(`browse_rooms.htm?${params.toString()}`);
    });
}

function initSearchForms() {
    document.querySelectorAll("#searchForm, #quickSearch, #browseSearchForm, #universitySearchForm").forEach(syncSearchToUrl);
}

function initEmptyActions() {
    document.querySelectorAll("[id^='loadMore'], #clearSavedBtn, #markAllReadBtn").forEach((button) => {
        button.addEventListener("click", () => {
            showToast("This action will use live ResiHub data after Supabase integration.", { type: "info" });
        });
    });
}

export function initPageModule({ area, page }) {
    document.documentElement.dataset.pageArea = area;
    document.documentElement.dataset.pageName = page;
    initSearchForms();
    initEmptyActions();
}
