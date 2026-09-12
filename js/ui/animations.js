export function initAnimations() {
    const progress = document.getElementById("scrollProgress");
    if (progress) {
        const update = () => {
            const height = document.documentElement.scrollHeight - innerHeight;
            progress.style.width = `${height > 0 ? Math.min(100, (scrollY / height) * 100) : 0}%`;
        };
        update();
        addEventListener("scroll", update, { passive: true });
    }
    const reveal = [...document.querySelectorAll(".reveal")];
    if (!reveal.length) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
        reveal.forEach((element) => element.classList.add("revealed"));
        return;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
        }
    }), { threshold: 0.12 });
    reveal.forEach((element) => observer.observe(element));
}
