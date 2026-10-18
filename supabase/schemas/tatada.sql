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
