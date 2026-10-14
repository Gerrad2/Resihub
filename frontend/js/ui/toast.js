const containerId = "resihubToasts";

function container() {
    let element = document.getElementById(containerId);
    if (element) return element;

    element = document.createElement("div");
    element.id = containerId;
    element.className = "toast-container";
    element.setAttribute("aria-live", "polite");
    element.setAttribute("aria-atomic", "true");
    document.body.append(element);
    return element;
}

export function showToast(message, { type = "info", duration = 4000 } = {}) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.textContent = String(message);
    container().append(toast);

    requestAnimationFrame(() => toast.classList.add("active"));
    const remove = () => {
        toast.classList.remove("active");
        window.setTimeout(() => toast.remove(), 200);
    };
    if (duration > 0) window.setTimeout(remove, duration);
    return { element: toast, remove };
}
