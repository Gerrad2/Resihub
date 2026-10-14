-- Prevent browser-controlled role escalation.
create or replace function public.resihub_create_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    case when lower(coalesce(new.raw_user_meta_data ->> 'role', '')) = 'landlord' then 'landlord' else 'student' end,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.resihub_block_role_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    raise exception 'Profile roles can only be changed by a controlled administrator process';
  end if;
  return new;
end;
$$;

drop trigger if exists resihub_block_profile_role_change on public.profiles;
create trigger resihub_block_profile_role_change before update on public.profiles for each row execute function public.resihub_block_role_change();

drop policy if exists "resihub property media upload" on storage.objects;
drop policy if exists "resihub property media update" on storage.objects;
drop policy if exists "resihub property media delete" on storage.objects;
create policy "resihub property media upload" on storage.objects for insert to authenticated
with check (
  bucket_id = 'property-media'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'image/webp')
  and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 5242880
);
create policy "resihub property media update" on storage.objects for update to authenticated
using (bucket_id = 'property-media' and owner_id = auth.uid()::text and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'property-media' and owner_id = auth.uid()::text and (storage.foldername(name))[1] = auth.uid()::text);
create policy "resihub property media delete" on storage.objects for delete to authenticated
using (bucket_id = 'property-media' and owner_id = auth.uid()::text and (storage.foldername(name))[1] = auth.uid()::text);
