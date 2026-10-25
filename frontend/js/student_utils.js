import { getCurrentUser } from "./api.js";
import { showToast } from "./ui/toast.js";

export async function getStudentContext() {
    const result = await getCurrentUser();
    if (!result.success || !result.data) {
        throw result.error || new Error("Please sign in to continue.");
    }
    return { user: result.data };
}

export function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-NG");
}

export function node(tag, className = "", text = "") {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
}

export function showError(message) {
    showToast(message || "Something went wrong.", { type: "error" });
}