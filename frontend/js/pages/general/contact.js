import { initPageModule } from "../page-module.js";
import { supabase } from "../../api.js";
import { showToast } from "../../ui/toast.js";

export function init() {
    initPageModule({ area: "general", page: "contact" });
    document.getElementById("contactForm")?.addEventListener("submit", sendMessage);
}

async function sendMessage(event) {
    event.preventDefault();

    const form = event.currentTarget;
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const data = new FormData(form);
    const button = document.getElementById("sendMessageBtn");
    button.disabled = true;

    const { error } = await supabase.from("contact_messages").insert({
        full_name: data.get("name").toString().trim(),
        email: data.get("email").toString().trim(),
        subject: data.get("subject")?.toString().trim() || null,
        message: data.get("message").toString().trim(),
    });

    button.disabled = false;

    if (error) {
        showToast("Your message could not be sent. Please try again.", { type: "error" });
        return;
    }

    form.reset();
    showToast("Thanks! We've received your message and will reply soon.", { type: "success" });
}