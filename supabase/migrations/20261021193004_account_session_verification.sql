-- Additive only: do not change the runtime row, auth records, account IDs or keys.
create schema if not exists tatada_private;
revoke all on schema tatada_private from public, anon, authenticated;
grant usage on schema tatada_private to service_role;
-- auth.sessions is intentionally not granted to API roles. This narrow helper
-- returns only the existence and creation time of the caller-verified session.
create or replace function tatada_private.auth_session_active(p_user uuid,p_session uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')='service_role'
 then coalesce((select jsonb_build_object('active',true,'createdAt',extract(epoch from s.created_at)*1000)
 from auth.sessions s where s.id=p_session and s.user_id=p_user and (s.not_after is null or s.not_after>now())),'{"active":false}'::jsonb)
 else '{"active":false}'::jsonb end;
$$;
revoke all on function tatada_private.auth_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function tatada_private.auth_session_active(uuid,uuid) to service_role;
create or replace function public.tatada_auth_session_active(p_user uuid,p_session uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select tatada_private.auth_session_active(p_user,p_session);
$$;
revoke all on function public.tatada_auth_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tatada_auth_session_active(uuid,uuid) to service_role;
