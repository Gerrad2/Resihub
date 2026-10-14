# ResiHub API

The ResiHub backend is a FastAPI service. It verifies Supabase access tokens using the project's published JWKS, checks the user's database role and property ownership, and uses parameterized PostgreSQL queries through a small connection pool.

## Local setup

1. Copy `.env.example` to a private `.env` file and enter the Supabase pooler details.
2. Set `RESIHUB_ALLOWED_ORIGINS` to the exact site URL(s) that may call the API.
3. Create a virtual environment, install `requirements.txt`, then run `uvicorn app.main:app --reload`.

The public endpoint is `GET /api/v1/public/properties`. Landlord endpoints require `Authorization: Bearer <Supabase access token>` and are available at `/api/v1/landlord/properties`.

Health checks are exposed at `/actuator/health/readiness` for Render compatibility.
