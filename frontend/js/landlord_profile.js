// js/landlord_profile.js

import {
    getCurrentUser,
    getProfile
} from "./core/api.js";

const avatar = document.getElementById("landlordAvatar");
const landlordName = document.getElementById("landlordName");
const businessDisplay =
    document.getElementById("businessNameDisplay");

const fields = {
    fullName: "full_name",
    email: null,
    phone: "phone",
    gender: "gender",
    dateOfBirth: "date_of_birth",
    state: "state",
    businessName: "business_name",
    businessDescription: "business_description",
    cacNumber: "cac_number"
};

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent =
            value || "Not provided";
    }
}

function formatDate(value) {
    if (!value) return "Not provided";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("en-NG", {
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(date);
}

async function init() {
    const userResult = await getCurrentUser();

    if (!userResult.success || !userResult.data) {
        window.location.href =
            "../auth/landlord_login.htm";
        return;
    }

    const user = userResult.data;

    const profileResult =
        await getProfile(user.id);

    if (!profileResult.success) {
        console.error(profileResult.error);
        return;
    }

    const profile = profileResult.data || {};

    avatar.src =
        profile.avatar_url ||
        "../assets/images/default-avatar.png";

    avatar.onerror = () => {
        avatar.src =
            "../assets/images/default-avatar.png";
    };

    setText(
        "landlordName",
        profile.full_name || user.user_metadata?.full_name
    );

    setText(
        "businessNameDisplay",
        profile.business_name
    );

    setText(
        "fullName",
        profile.full_name
    );

    setText(
        "email",
        user.email
    );

    setText(
        "phone",
        profile.phone
    );

    setText(
        "gender",
        profile.gender
    );

    setText(
        "dateOfBirth",
        formatDate(profile.date_of_birth)
    );

    setText(
        "state",
        profile.state
    );

    setText(
        "businessName",
        profile.business_name
    );

    setText(
        "businessDescription",
        profile.business_description
    );

    setText(
        "cacNumber",
        profile.cac_number
    );

    setText(
        "emailStatus",
        user.email_confirmed_at
            ? "Verified"
            : "Not verified"
    );

    setText(
        "phoneStatus",
        profile.phone
            ? "Provided"
            : "Not provided"
    );

    setText(
        "memberSince",
        formatDate(
            profile.created_at ||
            user.created_at
        )
    );
}

init();