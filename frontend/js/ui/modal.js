let activeModal = null;
let restoreFocus = null;

export function openModal(modalId) {
    const modal = typeof modalId === "string" ? document.getElementById(modalId) : modalId;
    if (!modal) return false;
    restoreFocus = document.activeElement;
    activeModal = modal;
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    modal.querySelector("button, input, select, textarea, [href]")?.focus();
    return true;
}

export function closeModal() {
    if (!activeModal) return;
    activeModal.classList.remove("active");
    activeModal.setAttribute("aria-hidden", "true");
    activeModal = null;
    document.body.classList.remove("modal-open");
    restoreFocus?.focus?.();
    restoreFocus = null;
}

export function initModal() {
    document.addEventListener("click", (event) => {
        const opener = event.target.closest("[data-modal-open]");
        if (opener) return openModal(opener.dataset.modalOpen);
        if (event.target.closest("[data-modal-close]") || event.target === activeModal) closeModal();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeModal();
    });
}
