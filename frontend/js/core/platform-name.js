import { supabase } from "../api.js";

/* =========================================
   PLATFORM NAME
   Replaces the brand name "ResiHub" with the name saved in
   Platform Settings. Covers visible text, labels and the
   page title, so the header, footer and body all change.
========================================= */

const BRAND = "ResiHub";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);
const LABEL_ATTRIBUTES = ["aria-label", "alt", "title", "placeholder"];

let appliedName = BRAND;

async function fetchPlatformName() {
    try {
        const { data, error } = await supabase.rpc("get_public_platform_name");
        if (error || typeof data !== "string" || !data.trim()) return BRAND;
        return data.trim();
    } catch (error) {
        return BRAND;
    }
}

function replaceAll(text, from, to) {
    return text.split(from).join(to);
}

export async function applyPlatformName() {
    const name = await fetchPlatformName();

    if (name === appliedName) return;

    // Text inside the page, skipping scripts, form fields and similar
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
            return node.nodeValue.includes(BRAND) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
    });

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => {
        node.nodeValue = replaceAll(node.nodeValue, BRAND, name);
    });

    // Labels such as aria-label and alt text
    document.querySelectorAll("*").forEach((element) => {
        LABEL_ATTRIBUTES.forEach((attribute) => {
            const value = element.getAttribute(attribute);
            if (value && value.includes(BRAND)) {
                element.setAttribute(attribute, replaceAll(value, BRAND, name));
            }
        });
    });

    if (document.title.includes(BRAND)) {
        document.title = replaceAll(document.title, BRAND, name);
    }

    appliedName = name;
}