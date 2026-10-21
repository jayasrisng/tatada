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

revoke all on function tatada_private.auth_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function tatada_private.auth_session_active(uuid,uuid) to service_role;

-- Old API builds do not understand the password gate. Fail closed through their
-- old RPC while the candidate is verified, and if an old API is rolled back.
create or replace function public.tatada_auth_session_active(p_user uuid,p_session uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select '{"active":false}'::jsonb;
$$;
revoke all on function public.tatada_auth_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tatada_auth_session_active(uuid,uuid) to service_role;
create function public.tatada_prototype_session_active(p_user uuid,p_session uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select tatada_private.auth_session_active(p_user,p_session);
$$;
revoke all on function public.tatada_prototype_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tatada_prototype_session_active(uuid,uuid) to service_role;

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

-- Private beta: ten reserved tester slots plus one separately bootstrapped owner.
alter table tatada_private.prototype_invites drop constraint prototype_invites_slot_check;
alter table tatada_private.prototype_invites add column role text not null default 'tester' check(role in('owner','tester'));
alter table tatada_private.prototype_invites add constraint prototype_role_slot check(slot is null or(role='owner' and slot=0)or(role='tester' and slot between 1 and 10));
create unique index prototype_one_owner on tatada_private.prototype_invites(role) where role='owner';
create table tatada_private.beta_invitations(
 id uuid primary key default gen_random_uuid(), token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'),
 role text not null check(role in('owner','tester')),slot smallint not null check(slot between 0 and 10),
 state text not null default 'pending' check(state in('pending','claiming','claimed','revoked','expired')),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 claim_nonce uuid,user_id uuid references auth.users(id) on delete set null,claimed_at timestamptz,attempts integer not null default 0,
 check((role='owner' and slot=0)or(role='tester' and slot between 1 and 10))
);
create unique index beta_reserved_slot on tatada_private.beta_invitations(slot) where state in('pending','claiming','claimed');
create index beta_invitation_user on tatada_private.beta_invitations(user_id);
alter table tatada_private.beta_invitations enable row level security;
revoke all on tatada_private.beta_invitations from public,anon,authenticated;
create table tatada_private.beta_feedback(
 id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),category text not null,severity text not null check(severity in('normal','critical')),
 status text not null default 'open' check(status in('open','resolved')),message text not null check(length(message) between 5 and 2000),
 page text not null check(length(page)<=80),version text not null check(length(version)<=60),device text not null check(device in('phone','desktop'))
);
create index beta_feedback_user_time on tatada_private.beta_feedback(user_id,created_at desc);
alter table tatada_private.beta_feedback enable row level security;
revoke all on tatada_private.beta_feedback from public,anon,authenticated;

-- This service-only transaction is the sole invitation/feedback storage API.
-- p_actor is supplied by the backend after authoritative JWT/session verification.
create function tatada_private.beta(p_action text,p_actor uuid,p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare chosen smallint; row tatada_private.beta_invitations%rowtype; entry_id uuid;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then return '{"error":"denied"}';end if;
 perform pg_advisory_xact_lock(177804,10);
 update tatada_private.beta_invitations set state='expired' where state in('pending','claiming') and expires_at<=clock_timestamp();
 if p_action in('bootstrap','create') then
  if p_action='bootstrap' then
   if exists(select 1 from tatada_private.prototype_invites where role='owner') or exists(select 1 from tatada_private.beta_invitations where role='owner' and state not in('expired','revoked')) then return '{"error":"owner_exists"}';end if;
   chosen=0;
  else
   if not exists(select 1 from tatada_private.prototype_invites where user_id=p_actor and role='owner' and slot=0 and not requires_password_change) then return '{"error":"owner_required"}';end if;
   select n into chosen from generate_series(1,10)n where not exists(select 1 from tatada_private.prototype_invites i where i.slot=n) and not exists(select 1 from tatada_private.beta_invitations b where b.slot=n and b.state in('pending','claiming','claimed')) order by n limit 1;
   if chosen is null then return '{"error":"capacity"}';end if;
  end if;
  insert into tatada_private.beta_invitations(token_hash,role,slot,expires_at) values(p_args->>'hash',case when chosen=0 then 'owner' else 'tester' end,chosen,clock_timestamp()+case when chosen=0 then interval '30 minutes' else interval '24 hours' end) returning * into row;
  return jsonb_build_object('id',row.id,'slot',row.slot,'expiresAt',row.expires_at);
 elsif p_action in('inspect','begin','failed') then
  select * into row from tatada_private.beta_invitations where token_hash=p_args->>'hash' for update;
  if p_action='failed' then
   update tatada_private.beta_invitations set state='pending',claim_nonce=null where id=row.id and state='claiming' and claim_nonce=(p_args->>'nonce')::uuid;
   return '{"ok":true}';
  end if;
  if row.id is null or row.state<>'pending' or row.attempts>=8 or row.expires_at<=clock_timestamp() then return '{"error":"invalid_invitation"}';end if;
  if p_action='begin' then update tatada_private.beta_invitations set state='claiming',claim_nonce=(p_args->>'nonce')::uuid,attempts=attempts+1 where id=row.id;end if;
  return jsonb_build_object('id',row.id,'role',row.role,'expiresAt',row.expires_at);
 elsif p_action='feedback' then
  if not exists(select 1 from tatada_private.prototype_invites where user_id=p_actor and slot is not null and not requires_password_change) then return '{"error":"denied"}';end if;
  if(select count(*) from tatada_private.beta_feedback where user_id=p_actor and created_at>clock_timestamp()-interval '1 hour')>=5 then return '{"error":"rate"}';end if;
  if(select count(*) from tatada_private.beta_feedback)>=500 then return '{"error":"capacity"}';end if;
  insert into tatada_private.beta_feedback(user_id,category,severity,message,page,version,device) values(p_actor,p_args->>'category',p_args->>'severity',p_args->>'message',p_args->>'page',p_args->>'version',p_args->>'device') returning id into entry_id;
  return jsonb_build_object('id',entry_id);
 end if;
 if not exists(select 1 from tatada_private.prototype_invites where user_id=p_actor and role='owner' and slot=0 and not requires_password_change) then return '{"error":"owner_required"}';end if;
 if p_action='list' then
  return jsonb_build_object('invitations',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'slot',b.slot,'state',b.state,'expiresAt',b.expires_at,'userId',b.user_id)order by b.created_at desc) from tatada_private.beta_invitations b where role='tester'),'[]'::jsonb),
   'feedback',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'createdAt',f.created_at,'slot',i.slot,'category',f.category,'severity',f.severity,'status',f.status,'message',f.message,'page',f.page,'version',f.version,'device',f.device) order by f.created_at desc) from tatada_private.beta_feedback f left join tatada_private.prototype_invites i on i.user_id=f.user_id),'[]'::jsonb));
 elsif p_action='revoke' then
  select * into row from tatada_private.beta_invitations where id=(p_args->>'id')::uuid and role='tester' for update;
  if row.id is null then return '{"error":"invalid_invitation"}';end if;
  update tatada_private.beta_invitations set state='revoked' where id=row.id;
  update tatada_private.prototype_invites set slot=null,session_not_before=clock_timestamp() where user_id=row.user_id and role='tester';
  return '{"ok":true}';
 elsif p_action='resolve' then
  update tatada_private.beta_feedback set status=case when p_args->>'status'='open' then 'open' else 'resolved' end where id=(p_args->>'id')::uuid;
  return jsonb_build_object('ok',found);
 end if;
 return '{"error":"invalid_action"}';
end;
$$;
revoke all on function tatada_private.beta(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function tatada_private.beta(text,uuid,jsonb) to service_role;
create function public.tatada_beta(p_action text,p_actor uuid,p_args jsonb)returns jsonb language sql volatile security invoker set search_path='' as $$select tatada_private.beta(p_action,p_actor,p_args);$$;
revoke all on function public.tatada_beta(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.tatada_beta(text,uuid,jsonb) to service_role;

create or replace function tatada_private.track_prototype_password()
returns trigger language plpgsql security definer set search_path='' as $$
declare chosen smallint; invitation tatada_private.prototype_invites%rowtype; link tatada_private.beta_invitations%rowtype;
begin
 perform pg_advisory_xact_lock(177804,10);
 select * into invitation from tatada_private.prototype_invites where user_id=new.id for update;
 if new.raw_app_meta_data->>'tatada_prototype' is distinct from 'true' then update tatada_private.prototype_invites set slot=null where user_id=new.id;return new;end if;
 if coalesce(new.encrypted_password,'')='' or coalesce(new.raw_app_meta_data->>'tatada_password_reset','')!~'^[0-9a-fA-F-]{36}$' then raise exception 'Administrator must supply a fresh password-reset nonce';end if;
 if invitation.user_id is null and new.raw_app_meta_data ? 'tatada_beta_invitation' then
  select * into link from tatada_private.beta_invitations where id=(new.raw_app_meta_data->>'tatada_beta_invitation')::uuid and claim_nonce=(new.raw_app_meta_data->>'tatada_beta_claim')::uuid and state='claiming' and expires_at>clock_timestamp() for update;
  if link.id is null then raise exception 'Invalid invitation claim';end if;
  -- The password is chosen by the claim holder; no temporary-password step.
  insert into tatada_private.prototype_invites(user_id,slot,role,reset_nonce,requires_password_change)values(new.id,link.slot,link.role,new.raw_app_meta_data->>'tatada_password_reset',false);
  update tatada_private.beta_invitations set state='claimed',user_id=new.id,claimed_at=clock_timestamp() where id=link.id;
 elsif invitation.slot is null then
  -- Revocation survives Auth login/hash refresh. Only a fresh admin reset nonce
  -- can explicitly reprovision a previously admitted account.
  if invitation.user_id is not null and new.raw_app_meta_data->>'tatada_password_reset'=invitation.reset_nonce then return new;end if;
  if invitation.role='owner' then chosen=0;else
   select n into chosen from generate_series(1,10)n where not exists(select 1 from tatada_private.prototype_invites i where i.slot=n)and not exists(select 1 from tatada_private.beta_invitations b where b.slot=n and b.state in('pending','claiming','claimed')and b.expires_at>clock_timestamp())order by n limit 1;
  end if;
  if chosen is null then raise exception 'The prototype is limited to ten active invited accounts';end if;
  insert into tatada_private.prototype_invites(user_id,slot,role,reset_nonce)values(new.id,chosen,coalesce(invitation.role,'tester'),new.raw_app_meta_data->>'tatada_password_reset')on conflict(user_id)do update set slot=excluded.slot,reset_nonce=excluded.reset_nonce,session_not_before=clock_timestamp(),requires_password_change=true,password_changed_at=null;
 elsif new.raw_app_meta_data->>'tatada_password_reset' is distinct from invitation.reset_nonce then
  update tatada_private.prototype_invites set reset_nonce=new.raw_app_meta_data->>'tatada_password_reset',session_not_before=clock_timestamp(),requires_password_change=true,password_changed_at=null where user_id=new.id;
 elsif tg_op='UPDATE' and new.encrypted_password is distinct from old.encrypted_password then
  update tatada_private.prototype_invites set password_changed_at=clock_timestamp(),session_not_before=clock_timestamp() where user_id=new.id;
 end if;
 return new;
end;
$$;
create or replace function tatada_private.auth_session_active(p_user uuid,p_session uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')='service_role'
 then coalesce((select jsonb_build_object('active',true,'invited',true,'role',i.role,'requiresPasswordChange',i.requires_password_change,'resetNonce',i.reset_nonce,'passwordChangedAt',i.password_changed_at,'createdAt',extract(epoch from s.created_at)*1000)
 from auth.sessions s join tatada_private.prototype_invites i on i.user_id=s.user_id join auth.users u on u.id=s.user_id
 where s.id=p_session and s.user_id=p_user and i.slot is not null and u.raw_app_meta_data->>'tatada_prototype'='true' and s.created_at>=i.session_not_before and(s.not_after is null or s.not_after>now())),'{"active":false}'::jsonb)else '{"active":false}'::jsonb end;
$$;
