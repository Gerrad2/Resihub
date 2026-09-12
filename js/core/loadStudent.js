import { loadComponents } from "./components.js";


/**
 * Load the student application layout.
 */
export async function loadStudentLayout() {
    return loadComponents([
        {
            file: "../components/student_header.htm",
            elementId: "header",
        },

        {
            file: "../components/student_footer.htm",
            elementId: "footer",
        },
    ]);
}
