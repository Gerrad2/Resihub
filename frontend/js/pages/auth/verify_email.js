import { initPageModule } from "../page-module.js";

export function init() {
    initPageModule({ area: "auth", page: "verify_email" });
}

init();