# ResiHub API

This Spring Boot service is the security boundary between the ResiHub browser application and Supabase. The frontend supplies a Supabase access token; the API verifies it using the project's published signing keys. Authorization then comes from `public.users.role` and ownership checks in the database.

## Local setup

1. Copy `.env.example` to a private `.env` file outside source control and fill in the database pooler URL, username, and password from Supabase.
2. Set the allowed origins to the exact local or deployed site addresses.
3. Start with `mvn spring-boot:run` after Maven is installed.

The service never accepts database credentials or a Supabase secret key from the frontend. Do not put either in JavaScript.

## Browser contract

The browser calls `/api/v1/public/properties` for public listings. Signed-in landlord actions call `/api/v1/landlord/properties` with `Authorization: Bearer <Supabase access token>`. The API verifies the token, role, request shape, and property ownership before a database change is permitted.
