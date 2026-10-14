"""Secure FastAPI service for the ResiHub browser application."""

from __future__ import annotations

import asyncio
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
from decimal import Decimal
from typing import Annotated, Any

import asyncpg
import httpx
import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_db_url: str
    supabase_db_username: str
    supabase_db_password: str
    supabase_jwt_issuer: str = "https://clyksbctnzyreiujzinr.supabase.co/auth/v1"
    resihub_allowed_origins: str = "http://localhost:5500,http://127.0.0.1:5500"
    resihub_rate_limit: int = 120

    @property
    def origins(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.resihub_allowed_origins.split(",") if origin.strip()]

    @property
    def database_url(self) -> str:
        return self.supabase_db_url.removeprefix("jdbc:")


settings = Settings()


class PropertyPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    university_id: uuid.UUID | None = None
    title: Annotated[str, Field(min_length=1, max_length=160)]
    description: Annotated[str | None, Field(max_length=5000)] = None
    property_type: Annotated[str, Field(min_length=1, max_length=80)]
    address: Annotated[str, Field(min_length=1, max_length=250)]
    area: Annotated[str, Field(min_length=1, max_length=120)]
    base_price: Annotated[
        Decimal,
        Field(ge=0, validation_alias=AliasChoices("price", "basePrice", "base_price")),
    ]

    @field_validator("title", "property_type", "address", "area")
    @classmethod
    def non_blank(cls, value: str) -> str:
        if not value:
            raise ValueError("must not be blank")
        return value


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID


class TimedCache:
    def __init__(self, ttl_seconds: int = 120, max_entries: int = 500) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self.values: dict[str, tuple[float, Any]] = {}
        self.lock = asyncio.Lock()

    async def get(self, key: str) -> Any | None:
        async with self.lock:
            item = self.values.get(key)
            if item and item[0] > time.monotonic():
                return item[1]
            self.values.pop(key, None)
            return None

    async def set(self, key: str, value: Any) -> None:
        async with self.lock:
            if len(self.values) >= self.max_entries:
                self.values.pop(next(iter(self.values)))
            self.values[key] = (time.monotonic() + self.ttl_seconds, value)

    async def clear(self) -> None:
        async with self.lock:
            self.values.clear()


public_listing_cache = TimedCache()
jwks_cache: dict[str, Any] = {"expires_at": 0.0, "keys": {}}
jwks_lock = asyncio.Lock()
rate_limit_windows: defaultdict[str, deque[float]] = defaultdict(deque)
rate_limit_lock = asyncio.Lock()


async def get_jwks() -> dict[str, Any]:
    if jwks_cache["expires_at"] > time.monotonic():
        return jwks_cache["keys"]
    async with jwks_lock:
        if jwks_cache["expires_at"] > time.monotonic():
            return jwks_cache["keys"]
        url = f"{settings.supabase_jwt_issuer.rstrip('/')}/.well-known/jwks.json"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(status_code=503, detail="Authentication service is temporarily unavailable") from exc
        keys = {key["kid"]: jwt.PyJWK.from_dict(key).key for key in data.get("keys", []) if key.get("kid")}
        if not keys:
            raise HTTPException(status_code=503, detail="Authentication signing keys are unavailable")
        jwks_cache.update({"expires_at": time.monotonic() + 3600, "keys": keys})
        return keys


async def require_user(authorization: Annotated[str | None, Header()] = None) -> CurrentUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="A bearer token is required")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        header = jwt.get_unverified_header(token)
        key = (await get_jwks()).get(header.get("kid"))
        if key is None:
            jwks_cache["expires_at"] = 0.0
            key = (await get_jwks()).get(header.get("kid"))
        if key is None:
            raise jwt.InvalidTokenError("Unknown signing key")
        claims = jwt.decode(token, key, algorithms=[header.get("alg", "")], audience="authenticated", issuer=settings.supabase_jwt_issuer, options={"require": ["exp", "sub"]})
        return CurrentUser(uuid.UUID(claims["sub"]))
    except (jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token") from exc


async def require_role(conn: asyncpg.Connection, user: CurrentUser, *roles: str) -> str:
    role = await conn.fetchval("select role from public.profiles where id = $1", user.id)
    if role not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission for this action")
    return role


async def require_owner(conn: asyncpg.Connection, user: CurrentUser, property_id: uuid.UUID) -> None:
    role = await require_role(conn, user, "landlord", "admin")
    if role == "admin":
        return
    owner = await conn.fetchval("select exists(select 1 from public.listings where id = $1 and landlord_id = $2)", property_id, user.id)
    if not owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this property")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await asyncpg.create_pool(dsn=settings.database_url, user=settings.supabase_db_username, password=settings.supabase_db_password, min_size=1, max_size=10, command_timeout=5, server_settings={"application_name": "resihub-api"})
    yield
    await app.state.pool.close()


app = FastAPI(title="ResiHub API", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=False, allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type", "X-Request-Id"], expose_headers=["X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining"], max_age=3600)


@app.middleware("http")
async def security_and_rate_limit(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))[:128]
    if request.method != "OPTIONS" and not request.url.path.startswith("/actuator/"):
        route = request.url.path.split("/")[3] if len(request.url.path.split("/")) > 3 else request.url.path
        client = request.client.host if request.client else "unknown"
        now = time.monotonic()
        async with rate_limit_lock:
            hits = rate_limit_windows[f"{client}:{route}"]
            while hits and hits[0] <= now - 60:
                hits.popleft()
            hits.append(now)
            remaining = max(0, settings.resihub_rate_limit - len(hits))
            blocked = len(hits) > settings.resihub_rate_limit
        if blocked:
            return JSONResponse({"error": "Too many requests. Try again shortly."}, status_code=429, headers={"Retry-After": "60", "X-Request-Id": request_id, "X-RateLimit-Limit": str(settings.resihub_rate_limit), "X-RateLimit-Remaining": "0"})
    else:
        remaining = settings.resihub_rate_limit
    response = await call_next(request)
    response.headers.update({"X-Request-Id": request_id, "X-RateLimit-Limit": str(settings.resihub_rate_limit), "X-RateLimit-Remaining": str(remaining), "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()"})
    return response


@app.exception_handler(asyncpg.PostgresError)
async def database_error_handler(_: Request, __: asyncpg.PostgresError):
    return JSONResponse({"detail": "The service is temporarily unavailable"}, status_code=503)


@app.get("/actuator/health")
@app.get("/actuator/health/readiness")
async def health(request: Request):
    await request.app.state.pool.fetchval("select 1")
    return {"status": "UP"}


PUBLIC_PROPERTIES_QUERY = """
select p.id, p.title, p.description, p.property_type, p.address, p.area, p.price, p.university_id, p.created_at, u.name as university_name,
coalesce(json_agg(json_build_object('id', i.id, 'image_url', i.image_url, 'display_order', i.display_order) order by i.display_order) filter (where i.id is not null), '[]'::json) as images
from public.listings p left join public.universities u on u.id = p.university_id left join public.listing_images i on i.listing_id = p.id where p.publication_status = 'published'
"""


@app.get("/api/v1/public/properties")
async def browse_properties(request: Request, response: Response, university_id: uuid.UUID | None = None, limit: int = 12):
    safe_limit = min(50, max(1, limit))
    cache_key = f"{university_id or 'all'}:{safe_limit}"
    data = await public_listing_cache.get(cache_key)
    if data is None:
        query, arguments = PUBLIC_PROPERTIES_QUERY, []
        if university_id:
            query += " and p.university_id = $1"
            arguments.append(university_id)
        query += f" group by p.id, u.name order by p.created_at desc limit ${len(arguments) + 1}"
        arguments.append(safe_limit)
        async with request.app.state.pool.acquire() as conn:
            data = [dict(row) for row in await conn.fetch(query, *arguments)]
        await public_listing_cache.set(cache_key, data)
    response.headers["Cache-Control"] = "public, max-age=120"
    return data


@app.get("/api/v1/landlord/properties")
async def landlord_properties(request: Request, user: CurrentUser = Depends(require_user)):
    async with request.app.state.pool.acquire() as conn:
        role = await require_role(conn, user, "landlord", "admin")
        query = "select id, title, description, property_type, address, area, price, publication_status, created_at, updated_at from public.listings"
        rows = await conn.fetch(f"{query} order by created_at desc" if role == "admin" else f"{query} where landlord_id = $1 order by created_at desc", *(() if role == "admin" else (user.id,)))
    return [dict(row) for row in rows]


@app.post("/api/v1/landlord/properties", status_code=status.HTTP_201_CREATED)
async def create_property(request: Request, payload: PropertyPayload, user: CurrentUser = Depends(require_user)):
    async with request.app.state.pool.acquire() as conn:
        await require_role(conn, user, "landlord", "admin")
        row = await conn.fetchrow("insert into public.listings (landlord_id, university_id, title, description, property_type, address, area, price, publication_status) values ($1, $2, $3, $4, $5, $6, $7, $8, 'draft') returning id, title, publication_status, created_at", user.id, payload.university_id, payload.title, payload.description, payload.property_type, payload.address, payload.area, payload.base_price)
    await public_listing_cache.clear()
    return dict(row)


@app.patch("/api/v1/landlord/properties/{property_id}")
async def update_property(request: Request, property_id: uuid.UUID, payload: PropertyPayload, user: CurrentUser = Depends(require_user)):
    async with request.app.state.pool.acquire() as conn:
        await require_owner(conn, user, property_id)
        row = await conn.fetchrow("update public.listings set university_id = $1, title = $2, description = $3, property_type = $4, address = $5, area = $6, price = $7, updated_at = now() where id = $8 returning id, title, publication_status, updated_at", payload.university_id, payload.title, payload.description, payload.property_type, payload.address, payload.area, payload.base_price, property_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Property not found")
    await public_listing_cache.clear()
    return dict(row)
