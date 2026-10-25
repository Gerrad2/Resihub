import { getCurrentUser, createBookingRequest } from "../api.js";
import { showToast } from "./toast.js";

const MODAL_ID = "bookingInspectionModal";

let overlay = null;
let form = null;
let busy = false;
let getListing = () => null;

/* Connects the "Book Now" button to the form. Call once from the room page. */
export function initBookingForm(trigger, listingGetter) {
    getListing = listingGetter;

    if (!trigger) {
        console.error('[booking] button not found. Check that the element id is "bookInspection".');
        return;
    }

    if (trigger.dataset.bookingReady === "true") return;
    trigger.dataset.bookingReady = "true";

    trigger.addEventListener("click", (event) => {
        event.preventDefault();
        openForm();
    });
}

/* Builds the form once, removing any older copy first */
function ensureForm() {
    if (overlay && document.body.contains(overlay)) return;

    document.querySelectorAll(`#${MODAL_ID}`).forEach((node) => node.remove());

    overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "modal";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.display = "none";

    overlay.innerHTML = `
        <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="bookingTitle">
            <div class="modal-header">
                <h2 class="modal-title" id="bookingTitle">Book an Inspection</h2>
                <button type="button" class="modal-close" data-close aria-label="Close">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
            </div>
            <form id="bookingForm" novalidate>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="inspectionDate">Preferred Date &amp; Time</label>
                        <input type="datetime-local" id="inspectionDate" class="form-control" required>
                        <p class="validation-message" id="inspectionDateError" hidden></p>
                    </div>
                    <div class="form-group">
                        <label for="bookingMessage">Message to Landlord (optional)</label>
                        <textarea id="bookingMessage" class="form-control" rows="3" maxlength="500"
                            placeholder="Any details you'd like to share..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline" data-close>Cancel</button>
                    <button type="submit" class="btn btn-primary" id="submitBookingBtn">Send Request</button>
                </div>
            </form>
        </div>
    `;

    document.body.append(overlay);

    form = overlay.querySelector("#bookingForm");

    // Each close button gets its own listener, so nothing depends on event bubbling
    overlay.querySelectorAll("[data-close]").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            closeForm();
        });
    });

    // A click on the dimmed background closes the form
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeForm();
    });

    form.addEventListener("submit", handleSubmit);

    // Escape closes the form
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isOpen()) closeForm();
    });
}

function isOpen() {
    return overlay && overlay.style.display !== "none";
}

function openForm() {
    ensureForm();

    const dateInput = form.querySelector("#inspectionDate");
    dateInput.min = toLocalInputValue(new Date());
    setError("");

    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    dateInput.focus();
}

function closeForm() {
    if (busy || !overlay) return;

    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
}

async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;

    const dateInput = form.querySelector("#inspectionDate");
    const messageInput = form.querySelector("#bookingMessage");
    const submitButton = form.querySelector("#submitBookingBtn");

    if (!dateInput.value) {
        setError("Choose a preferred date and time.");
        dateInput.focus();
        return;
    }

    const chosen = new Date(dateInput.value);
    if (Number.isNaN(chosen.getTime()) || chosen <= new Date()) {
        setError("Please choose a date and time in the future.");
        dateInput.focus();
        return;
    }

    const listing = getListing();
    if (!listing) {
        showToast("This room has not finished loading. Please try again in a moment.", { type: "error" });
        return;
    }

    const userResult = await getCurrentUser();
    const user = userResult.success ? userResult.data : null;

    if (!user) {
        showToast("Please sign in as a student to book an inspection.", { type: "info" });
        window.location.href = "../auth/student_login.htm";
        return;
    }

    busy = true;
    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
    setError("");

    const result = await createBookingRequest({
        listingId: listing.id,
        landlordId: listing.landlord_id,
        inspectionDate: chosen.toISOString(),
        message: messageInput.value.trim() || null,
    });

    busy = false;
    submitButton.disabled = false;
    submitButton.textContent = "Send Request";

    if (!result.success) {
        console.error("[booking] request failed:", result.error);
        showToast(result.error?.message || "Your request could not be sent. Please try again.", { type: "error" });
        return;
    }

    showToast("Inspection request sent to the landlord.", { type: "success" });
    form.reset();

    setTimeout(() => {
        window.location.href = "../student/booking_requests.htm";
    }, 1200);
}

function setError(text) {
    const box = form?.querySelector("#inspectionDateError");
    if (!box) return;
    box.textContent = text;
    box.hidden = !text;
}

function toLocalInputValue(date) {
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}