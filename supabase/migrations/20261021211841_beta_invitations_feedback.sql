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
