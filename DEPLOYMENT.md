# ResiHub Launch Checklist

## Required account settings

1. In Supabase Authentication, enable email confirmation and set the production Site URL plus the exact password-reset URL: `https://YOUR_DOMAIN/auth/reset_password.htm`.
2. Add the production domain to Supabase Authentication redirect URLs.
3. Set `RESIHUB_ALLOWED_ORIGINS` to only `https://YOUR_DOMAIN`; remove localhost before launch.
4. For Render, use `render.yaml` to create the `resihub-api` and `resihub-web` services. Enter `SUPABASE_DB_URL`, `SUPABASE_DB_USERNAME`, `SUPABASE_DB_PASSWORD`, and `RESIHUB_ALLOWED_ORIGINS` in Render's protected environment settings. Keep those private values out of Git. The API runs on Python/FastAPI.
5. After Render provides the static-site URL, set `RESIHUB_ALLOWED_ORIGINS` to that exact HTTPS URL and redeploy the API.

## Operational checks before public launch

- Create separate student and landlord test accounts and verify that each cannot reach the other role’s pages.
- Promote an administrator only with a controlled SQL operation, never through browser registration.
- Test signup confirmation, password reset, listing creation, photo upload, booking, messages, and logout on mobile.
- Run Lighthouse against the deployed HTTPS site and fix remaining accessibility, performance, and SEO findings.
- Enable Supabase backups, review database logs, and configure an uptime monitor for `/actuator/health/readiness`.
