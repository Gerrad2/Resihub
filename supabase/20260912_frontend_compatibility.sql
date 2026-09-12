-- ResiHub frontend compatibility migration for project clyksbctnzyreiujzinr.
-- This keeps the original properties schema intact and adds the tables used by the current browser app.

create extension if not exists pgcrypto;

alter table public.universities add column if not exists logo_url text;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'landlord', 'admin')),
  full_name text, avatar_url text, phone text, university text, department text, faculty text,
  matric_number text, level text, state text, address text, business_name text,
  business_description text, cac_number text, date_of_birth date, gender text,
  emergency_name text, emergency_phone text, emergency_relationship text,
  email_notifications boolean not null default true, sms_notifications boolean not null default false,
  marketing_emails boolean not null default false, inspection_notifications boolean not null default true,
  listing_visibility boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references public.profiles(id) on delete cascade,
  university_id uuid references public.universities(id) on delete set null,
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text, price numeric(12, 2) not null check (price >= 0),
  property_type text not null, area text not null, address text, phone text,
  bedrooms integer check (bedrooms >= 0), bathrooms integer check (bathrooms >= 0),
  property_size numeric(10, 2) check (property_size >= 0), available_rooms integer check (available_rooms >= 0),
  amenities jsonb not null default '{}'::jsonb,
  availability_status text not null default 'available' check (availability_status in ('available', 'unavailable', 'booked')),
  publication_status text not null default 'draft' check (publication_status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.listing_images (
  id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.listings(id) on delete cascade,
  image_url text not null, display_order integer not null default 0 check (display_order >= 0), created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade, created_at timestamptz not null default now(),
  unique(student_id, listing_id)
);

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete cascade,
  landlord_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  inspection_date timestamptz, message text, status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.listing_reviews (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade, rating integer not null check (rating between 1 and 5),
  comment text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(student_id, listing_id)
);

create index if not exists listings_browse_idx on public.listings(publication_status, availability_status, university_id, area, price);
create index if not exists listing_images_listing_idx on public.listing_images(listing_id, display_order);
create index if not exists favorites_student_idx on public.favorites(student_id, created_at desc);
create index if not exists bookings_student_idx on public.booking_requests(student_id, created_at desc);
create index if not exists bookings_landlord_idx on public.booking_requests(landlord_id, created_at desc);

create or replace function public.resihub_set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.resihub_create_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, role, full_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'student'), nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists resihub_profiles_updated_at on public.profiles;
drop trigger if exists resihub_listings_updated_at on public.listings;
drop trigger if exists resihub_bookings_updated_at on public.booking_requests;
drop trigger if exists resihub_reviews_updated_at on public.listing_reviews;
drop trigger if exists resihub_auth_user_created on auth.users;
create trigger resihub_profiles_updated_at before update on public.profiles for each row execute function public.resihub_set_updated_at();
create trigger resihub_listings_updated_at before update on public.listings for each row execute function public.resihub_set_updated_at();
create trigger resihub_bookings_updated_at before update on public.booking_requests for each row execute function public.resihub_set_updated_at();
create trigger resihub_reviews_updated_at before update on public.listing_reviews for each row execute function public.resihub_set_updated_at();
create trigger resihub_auth_user_created after insert on auth.users for each row execute function public.resihub_create_profile();

insert into public.profiles (id, role, full_name)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'role', ''), 'student'), nullif(u.raw_user_meta_data ->> 'full_name', '')
from auth.users u
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.favorites enable row level security;
alter table public.booking_requests enable row level security;
alter table public.listing_reviews enable row level security;

drop policy if exists "resihub profiles read" on public.profiles;
drop policy if exists "resihub profiles insert" on public.profiles;
drop policy if exists "resihub profiles update" on public.profiles;
create policy "resihub profiles read" on public.profiles for select to authenticated using (true);
create policy "resihub profiles insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "resihub profiles update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "resihub listings read" on public.listings;
drop policy if exists "resihub listings create" on public.listings;
drop policy if exists "resihub listings update" on public.listings;
drop policy if exists "resihub listings delete" on public.listings;
create policy "resihub listings read" on public.listings for select using (publication_status = 'published' or landlord_id = auth.uid());
create policy "resihub listings create" on public.listings for insert to authenticated with check (landlord_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role in ('landlord', 'admin')));
create policy "resihub listings update" on public.listings for update to authenticated using (landlord_id = auth.uid()) with check (landlord_id = auth.uid());
create policy "resihub listings delete" on public.listings for delete to authenticated using (landlord_id = auth.uid());

drop policy if exists "resihub listing images read" on public.listing_images;
drop policy if exists "resihub listing images manage" on public.listing_images;
create policy "resihub listing images read" on public.listing_images for select using (exists (select 1 from public.listings l where l.id = listing_id and (l.publication_status = 'published' or l.landlord_id = auth.uid())));
create policy "resihub listing images manage" on public.listing_images for all to authenticated using (exists (select 1 from public.listings l where l.id = listing_id and l.landlord_id = auth.uid())) with check (exists (select 1 from public.listings l where l.id = listing_id and l.landlord_id = auth.uid()));

drop policy if exists "resihub favorites manage" on public.favorites;
create policy "resihub favorites manage" on public.favorites for all to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists "resihub bookings read" on public.booking_requests;
drop policy if exists "resihub bookings create" on public.booking_requests;
drop policy if exists "resihub bookings update" on public.booking_requests;
create policy "resihub bookings read" on public.booking_requests for select to authenticated using (student_id = auth.uid() or landlord_id = auth.uid());
create policy "resihub bookings create" on public.booking_requests for insert to authenticated with check (student_id = auth.uid() and exists (select 1 from public.listings l where l.id = listing_id and l.landlord_id = landlord_id and l.publication_status = 'published'));
create policy "resihub bookings update" on public.booking_requests for update to authenticated using (student_id = auth.uid() or landlord_id = auth.uid()) with check (student_id = auth.uid() or landlord_id = auth.uid());

drop policy if exists "resihub reviews read" on public.listing_reviews;
drop policy if exists "resihub reviews create" on public.listing_reviews;
drop policy if exists "resihub reviews update" on public.listing_reviews;
drop policy if exists "resihub reviews delete" on public.listing_reviews;
create policy "resihub reviews read" on public.listing_reviews for select using (true);
create policy "resihub reviews create" on public.listing_reviews for insert to authenticated with check (student_id = auth.uid() and exists (select 1 from public.booking_requests b where b.student_id = auth.uid() and b.listing_id = listing_id and b.status = 'approved'));
create policy "resihub reviews update" on public.listing_reviews for update to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "resihub reviews delete" on public.listing_reviews for delete to authenticated using (student_id = auth.uid());

insert into storage.buckets (id, name, public) values ('property-media', 'property-media', true) on conflict (id) do update set public = excluded.public;
drop policy if exists "resihub property media upload" on storage.objects;
drop policy if exists "resihub property media update" on storage.objects;
drop policy if exists "resihub property media delete" on storage.objects;
create policy "resihub property media upload" on storage.objects for insert to authenticated with check (bucket_id = 'property-media' and owner_id = auth.uid()::text);
create policy "resihub property media update" on storage.objects for update to authenticated using (bucket_id = 'property-media' and owner_id = auth.uid()::text) with check (bucket_id = 'property-media' and owner_id = auth.uid()::text);
create policy "resihub property media delete" on storage.objects for delete to authenticated using (bucket_id = 'property-media' and owner_id = auth.uid()::text);
