import { supabase } from "./api.js";

const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const BACKEND_URL = window.RESIHUB_API_URL || (isLocal ? "http://localhost:8080" : "https://resihub-api.onrender.com");

export async function backendRequest(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body) headers.set("Content-Type", "application/json");
    if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);

    const response = await fetch(`${BACKEND_URL}${path}`, { ...options, headers });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "The request could not be completed.");
    return response.status === 204 ? null : response.json();
}
