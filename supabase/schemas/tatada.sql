create table public.tatada_runtime (
  id smallint primary key check (id = 1),
  state jsonb not null default '{}'::jsonb,
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.tatada_runtime enable row level security;
revoke all on public.tatada_runtime from public, anon, authenticated;
grant select, insert, update on public.tatada_runtime to service_role;
insert into public.tatada_runtime(id) values (1);

create function public.tatada_acquire(p_token uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare current_row public.tatada_runtime%rowtype;
  abandoned boolean;
begin
  select * into current_row from public.tatada_runtime where id = 1 for update;
  if current_row.lease_token is not null and current_row.lease_until > now() then
    return jsonb_build_object('busy', true);
  end if;
  abandoned := current_row.lease_token is not null;
  update public.tatada_runtime set lease_token = p_token, lease_until = now() + interval '90 seconds' where id = 1;
  return jsonb_build_object('state', current_row.state, 'recovered', abandoned);
end $$;

create function public.tatada_save(p_token uuid, p_state jsonb) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  update public.tatada_runtime set state = p_state, updated_at = now(), lease_until = now() + interval '90 seconds'
  where id = 1 and lease_token = p_token and lease_until > now();
  return found;
end $$;

create function public.tatada_release(p_token uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  update public.tatada_runtime set lease_token = null, lease_until = null where id = 1 and lease_token = p_token;
  return found;
end $$;

revoke execute on function public.tatada_acquire(uuid) from public, anon, authenticated;
revoke execute on function public.tatada_save(uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.tatada_release(uuid) from public, anon, authenticated;
grant execute on function public.tatada_acquire(uuid) to service_role;
grant execute on function public.tatada_save(uuid,jsonb) to service_role;
grant execute on function public.tatada_release(uuid) to service_role;

-- Additive only: do not change the runtime row, auth records, account IDs or keys.
create schema if not exists tatada_private;
revoke all on schema tatada_private from public, anon, authenticated;
grant usage on schema tatada_private to service_role;
-- auth.sessions is intentionally not granted to API roles. This narrow helper
-- returns only the existence and creation time of the caller-verified session.
-- Dedicated Tatada prototype: no self-registration, ten active invited UIDs.
-- No password or password verifier is copied into this table.
create table tatada_private.prototype_invites (
 user_id uuid primary key references auth.users(id) on delete cascade,
 slot smallint unique check(slot between 1 and 10),
 invited_at timestamptz not null default clock_timestamp(),
 session_not_before timestamptz not null default clock_timestamp(),
 requires_password_change boolean not null default true,
 password_changed_at timestamptz,
 reset_nonce text not null
);
alter table tatada_private.prototype_invites enable row level security;
revoke all on tatada_private.prototype_invites from public,anon,authenticated;
grant select on tatada_private.prototype_invites to service_role;

-- Auth Admin applies app_metadata AFTER inserting the user in one transaction.
-- Check the final row at commit, never NEW's initial provider-only metadata.
-- Public signup cannot supply trusted app_metadata; user_metadata is ignored.
create function tatada_private.guard_prototype_signup()
returns trigger language plpgsql security definer set search_path='' as $$
declare account auth.users%rowtype;
begin
 select * into account from auth.users where id=new.id;
 if not found then return new;end if;
 if account.raw_app_meta_data->>'tatada_prototype' is distinct from 'true'
 or coalesce(account.encrypted_password,'')=''
 or coalesce(account.raw_app_meta_data->>'tatada_password_reset','')!~'^[0-9a-fA-F-]{36}$' then
  raise exception 'Invite-only prototype: administrator provisioning required';
 end if;
 return new;
end;
$$;
revoke all on function tatada_private.guard_prototype_signup() from public,anon,authenticated;
create constraint trigger tatada_prototype_signup after insert on auth.users
 deferrable initially deferred for each row execute function tatada_private.guard_prototype_signup();

-- Narrow Auth trigger: trusted administrative marker changes admit/revoke/reset.
-- Auth updates invalidate old sessions. Only the service completion RPC clears the gate.
create function tatada_private.track_prototype_password()
returns trigger language plpgsql security definer set search_path='' as $$
declare chosen smallint; invitation tatada_private.prototype_invites%rowtype;
begin
 perform pg_advisory_xact_lock(177804,10);
 select * into invitation from tatada_private.prototype_invites where user_id=new.id for update;
 if new.raw_app_meta_data->>'tatada_prototype' is distinct from 'true' then
  update tatada_private.prototype_invites set slot=null where user_id=new.id;
  return new;
 end if;
 if coalesce(new.encrypted_password,'')='' or coalesce(new.raw_app_meta_data->>'tatada_password_reset','')!~'^[0-9a-fA-F-]{36}$' then
  raise exception 'Administrator must supply a fresh password-reset nonce';
 end if;
 if invitation.slot is null then
  select n into chosen from generate_series(1,10) n
   where not exists(select 1 from tatada_private.prototype_invites i where i.slot=n) order by n limit 1;
  if chosen is null then raise exception 'The prototype is limited to ten active invited accounts';end if;
  insert into tatada_private.prototype_invites(user_id,slot,reset_nonce)
   values(new.id,chosen,new.raw_app_meta_data->>'tatada_password_reset')
   on conflict(user_id) do update set slot=excluded.slot,reset_nonce=excluded.reset_nonce,
    session_not_before=clock_timestamp(),requires_password_change=true,password_changed_at=null;
 elsif new.raw_app_meta_data->>'tatada_password_reset' is distinct from invitation.reset_nonce then
  update tatada_private.prototype_invites set reset_nonce=new.raw_app_meta_data->>'tatada_password_reset',
   session_not_before=clock_timestamp(),requires_password_change=true,password_changed_at=null where user_id=new.id;
 elsif tg_op='UPDATE' and new.encrypted_password is distinct from old.encrypted_password and coalesce(new.encrypted_password,'')<>'' then
  update tatada_private.prototype_invites set password_changed_at=clock_timestamp(),session_not_before=clock_timestamp() where user_id=new.id;
 end if;
 return new;
end;
$$;
revoke all on function tatada_private.track_prototype_password() from public,anon,authenticated;
create trigger tatada_prototype_password after insert or update of raw_app_meta_data,encrypted_password on auth.users
for each row execute function tatada_private.track_prototype_password();

-- Existing public invoker wrapper and its service-only grants stay in place.
create or replace function tatada_private.auth_session_active(p_user uuid,p_session uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')='service_role'
 then coalesce((select jsonb_build_object('active',true,'invited',true,
  'requiresPasswordChange',i.requires_password_change,'resetNonce',i.reset_nonce,'passwordChangedAt',i.password_changed_at,'createdAt',extract(epoch from s.created_at)*1000)
 from auth.sessions s join tatada_private.prototype_invites i on i.user_id=s.user_id
 join auth.users u on u.id=s.user_id
 where s.id=p_session and s.user_id=p_user and i.slot is not null
 and u.raw_app_meta_data->>'tatada_prototype'='true'
 and s.created_at>=i.session_not_before and(s.not_after is null or s.not_after>now())), '{"active":false}'::jsonb)
 else '{"active":false}'::jsonb end;
$$;

-- Called only after the backend receives a successful Auth updateUser response.
-- A login-time encryption rewrite, direct client update or changed reset nonce
-- cannot complete this step. No password/hash is copied or exposed by the RPC.
create function tatada_private.complete_password_change(p_user uuid,p_session uuid,p_nonce text,p_changed_before timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then return false;end if;
 update tatada_private.prototype_invites i set requires_password_change=false
 where i.user_id=p_user and i.slot is not null and i.requires_password_change
 and i.reset_nonce=p_nonce and i.password_changed_at is not null
 and i.password_changed_at is distinct from p_changed_before
 and exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p_user and(s.not_after is null or s.not_after>now()));
 return found;
end;
$$;
revoke all on function tatada_private.complete_password_change(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function tatada_private.complete_password_change(uuid,uuid,text,timestamptz) to service_role;
create function public.tatada_complete_password_change(p_user uuid,p_session uuid,p_nonce text,p_changed_before timestamptz)
returns boolean language sql volatile security invoker set search_path='' as $$
 select tatada_private.complete_password_change(p_user,p_session,p_nonce,p_changed_before);
$$;
revoke all on function public.tatada_complete_password_change(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.tatada_complete_password_change(uuid,uuid,text,timestamptz) to service_role;
revoke all on function tatada_private.auth_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function tatada_private.auth_session_active(uuid,uuid) to service_role;
create or replace function public.tatada_auth_session_active(p_user uuid,p_session uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select tatada_private.auth_session_active(p_user,p_session);
$$;
revoke all on function public.tatada_auth_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tatada_auth_session_active(uuid,uuid) to service_role;
