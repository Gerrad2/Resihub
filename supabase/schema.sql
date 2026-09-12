-- ResiHub 2.0 initial database schema. Run once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create type public.user_role as enum ('student', 'landlord', 'admin');
create type public.listing_status as enum ('draft', 'published', 'archived');
create type public.availability_status as enum ('available', 'unavailable', 'booked');
create type public.booking_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'student', full_name text, avatar_url text, phone text,
  university text, department text, faculty text, matric_number text, level text, state text, address text,
  business_name text, business_description text, cac_number text, date_of_birth date, gender text,
  emergency_name text, emergency_phone text, emergency_relationship text,
  email_notifications boolean not null default true, sms_notifications boolean not null default false,
  marketing_emails boolean not null default false, inspection_notifications boolean not null default true,
  listing_visibility boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.universities (
  id uuid primary key default gen_random_uuid(), name text not null unique, location text, city text, state text,
  description text, logo_url text, image_url text, student_population integer check (student_population >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(), landlord_id uuid not null references public.profiles(id) on delete cascade,
  university_id uuid references public.universities(id) on delete set null, title text not null, description text,
  price numeric(12,2) not null check (price >= 0), property_type text not null, area text not null, address text, phone text,
  bedrooms integer check (bedrooms >= 0), bathrooms integer check (bathrooms >= 0), property_size numeric(10,2) check (property_size >= 0),
  available_rooms integer check (available_rooms >= 0), amenities jsonb not null default '{}'::jsonb,
  availability_status public.availability_status not null default 'available',
  publication_status public.listing_status not null default 'draft',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.listings(id) on delete cascade,
  image_url text not null, display_order integer not null default 0 check (display_order >= 0), created_at timestamptz not null default now()
);

create table public.favorites (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade, created_at timestamptz not null default now(), unique(student_id, listing_id)
);

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete cascade,
  landlord_id uuid not null references public.profiles(id) on delete cascade, listing_id uuid not null references public.listings(id) on delete cascade,
  inspection_date timestamptz, message text, status public.booking_status not null default 'pending',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(), sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade, listing_id uuid references public.listings(id) on delete set null,
  message text not null check(char_length(trim(message)) > 0), is_read boolean not null default false, created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, message text not null, type text not null default 'info', link text, is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade, rating integer not null check(rating between 1 and 5), comment text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(student_id, listing_id)
);

create index listings_browse_idx on public.listings(publication_status, availability_status, university_id, area, price);
create index listing_images_listing_idx on public.listing_images(listing_id, display_order);
create index bookings_student_idx on public.booking_requests(student_id, created_at desc);
create index bookings_landlord_idx on public.booking_requests(landlord_id, created_at desc);
create index notifications_user_idx on public.notifications(user_id, is_read, created_at desc);
create index reviews_listing_idx on public.reviews(listing_id, created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql security invoker set search_path = public as $$ begin new.updated_at = now(); return new; end; $$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin
  insert into public.profiles(id, role, full_name) values(new.id, coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'student'), nullif(new.raw_user_meta_data ->> 'full_name', '')) on conflict(id) do nothing; return new;
end; $$;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger universities_updated_at before update on public.universities for each row execute procedure public.set_updated_at();
create trigger listings_updated_at before update on public.listings for each row execute procedure public.set_updated_at();
create trigger bookings_updated_at before update on public.booking_requests for each row execute procedure public.set_updated_at();
create trigger reviews_updated_at before update on public.reviews for each row execute procedure public.set_updated_at();
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.universities enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.favorites enable row level security;
alter table public.booking_requests enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reviews enable row level security;

create policy "profiles readable to signed-in users" on public.profiles for select to authenticated using (true);
create policy "users update their profile" on public.profiles for update to authenticated using(id = auth.uid()) with check(id = auth.uid());
create policy "users create their profile" on public.profiles for insert to authenticated with check(id = auth.uid());
create policy "universities public" on public.universities for select using(true);
create policy "admins manage universities" on public.universities for all to authenticated using((select role from public.profiles where id = auth.uid()) = 'admin') with check((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "published listings public" on public.listings for select using(publication_status = 'published' or landlord_id = auth.uid() or (select role from public.profiles where id = auth.uid()) = 'admin');
create policy "landlords create listings" on public.listings for insert to authenticated with check(landlord_id = auth.uid() and (select role from public.profiles where id = auth.uid()) = 'landlord');
create policy "owners update listings" on public.listings for update to authenticated using(landlord_id = auth.uid() or (select role from public.profiles where id = auth.uid()) = 'admin') with check(landlord_id = auth.uid() or (select role from public.profiles where id = auth.uid()) = 'admin');
create policy "owners delete listings" on public.listings for delete to authenticated using(landlord_id = auth.uid() or (select role from public.profiles where id = auth.uid()) = 'admin');
create policy "visible listing images" on public.listing_images for select using(exists(select 1 from public.listings where listings.id = listing_images.listing_id and (listings.publication_status = 'published' or listings.landlord_id = auth.uid() or (select role from public.profiles where id = auth.uid()) = 'admin')));
create policy "owners manage listing images" on public.listing_images for all to authenticated using(exists(select 1 from public.listings where listings.id = listing_images.listing_id and (listings.landlord_id = auth.uid() or (select role from public.profiles where id = auth.uid()) = 'admin'))) with check(exists(select 1 from public.listings where listings.id = listing_images.listing_id and (listings.landlord_id = auth.uid() or (select role from public.profiles where id = auth.uid()) = 'admin')));
create policy "students manage favorites" on public.favorites for all to authenticated using(student_id = auth.uid()) with check(student_id = auth.uid());
create policy "participants read bookings" on public.booking_requests for select to authenticated using(student_id = auth.uid() or landlord_id = auth.uid() or (select role from public.profiles where id = auth.uid()) = 'admin');
create policy "students create bookings" on public.booking_requests for insert to authenticated with check(student_id = auth.uid() and exists(select 1 from public.listings where listings.id = listing_id and listings.landlord_id = landlord_id));
create policy "participants update bookings" on public.booking_requests for update to authenticated using(student_id = auth.uid() or landlord_id = auth.uid() or (select role from public.profiles where id = auth.uid()) = 'admin') with check(student_id = auth.uid() or landlord_id = auth.uid() or (select role from public.profiles where id = auth.uid()) = 'admin');
create policy "participants read messages" on public.messages for select to authenticated using(sender_id = auth.uid() or receiver_id = auth.uid());
create policy "users send messages" on public.messages for insert to authenticated with check(sender_id = auth.uid());
create policy "receivers update messages" on public.messages for update to authenticated using(receiver_id = auth.uid()) with check(receiver_id = auth.uid());
create policy "users read notifications" on public.notifications for select to authenticated using(user_id = auth.uid());
create policy "users update notifications" on public.notifications for update to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());
create policy "reviews public" on public.reviews for select using(true);
create policy "students create reviews" on public.reviews for insert to authenticated with check(student_id = auth.uid() and exists(select 1 from public.booking_requests where booking_requests.student_id = auth.uid() and booking_requests.listing_id = reviews.listing_id and booking_requests.status = 'approved'));
create policy "students update reviews" on public.reviews for update to authenticated using(student_id = auth.uid()) with check(student_id = auth.uid());
create policy "students delete reviews" on public.reviews for delete to authenticated using(student_id = auth.uid());

-- Listing photos are stored separately from the table records above.
insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true)
on conflict (id) do update set public = excluded.public;

create policy "landlords upload listing images" on storage.objects for insert to authenticated
with check (bucket_id = 'listing-images' and owner_id = auth.uid());
create policy "landlords update listing images" on storage.objects for update to authenticated
using (bucket_id = 'listing-images' and owner_id = auth.uid())
with check (bucket_id = 'listing-images' and owner_id = auth.uid());
create policy "landlords delete listing images" on storage.objects for delete to authenticated
using (bucket_id = 'listing-images' and owner_id = auth.uid());
