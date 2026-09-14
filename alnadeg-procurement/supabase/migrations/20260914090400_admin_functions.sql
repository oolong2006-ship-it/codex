-- =====================================================================
-- 5/5 — دوال الخادم: التفعيل، تحديد المعدل، تسجيل الدخول
-- تُستدعى من Edge Functions بمفتاح الخدمة، ولا تُكشف للمتصفح.
-- =====================================================================

-- ---------------------------------------------------------------------
-- تحديد معدل الطلبات — نافذة زمنية منزلقة بسيطة
-- ترجع true إذا كانت المحاولة مسموحة
-- ---------------------------------------------------------------------
create or replace function app.rate_limit_hit(
  p_bucket text, p_identifier text,
  p_window_seconds integer default 900, p_max_hits integer default 10
) returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  w_start timestamptz := date_trunc('second', now())
                         - make_interval(secs => (extract(epoch from now())::bigint % p_window_seconds));
  current_hits integer;
begin
  delete from app.rate_limits where window_start < now() - interval '1 day';

  insert into app.rate_limits (bucket, identifier, window_start, hits)
  values (p_bucket, p_identifier, w_start, 1)
  on conflict (bucket, identifier, window_start)
    do update set hits = app.rate_limits.hits + 1
  returning hits into current_hits;

  return current_hits <= p_max_hits;
end;
$fn$;

-- ---------------------------------------------------------------------
-- إنشاء رمز تفعيل — يُخزَّن الهاش فقط، ولا يُخزَّن الرمز نفسه أبدًا
-- ---------------------------------------------------------------------
create or replace function app.create_activation_token(
  p_token_hash text, p_full_name text, p_phone text,
  p_role text default 'super_admin', p_location_code text default 'CN-06',
  p_hours integer default 24
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare new_id uuid; norm text;
begin
  norm := app.normalize_saudi_phone(p_phone);
  if norm is null then
    raise exception 'INVALID_PHONE' using hint = 'رقم الجوال غير صحيح';
  end if;

  -- إبطال أي رموز مفتوحة سابقة لنفس الغرض والرقم
  update public.activation_tokens
     set used_at = now()
   where phone = norm and used_at is null and purpose = 'super_admin_activation';

  insert into public.activation_tokens
    (token_hash, purpose, full_name, phone, role, location_code, expires_at)
  values
    (p_token_hash, 'super_admin_activation', p_full_name, norm, p_role, p_location_code,
     now() + make_interval(hours => p_hours))
  returning id into new_id;

  insert into public.audit_logs (action, entity_type, entity_id, details)
  values ('activation.token_created', 'activation_token', new_id::text,
          jsonb_build_object('phone', norm, 'role', p_role, 'expires_hours', p_hours));

  return new_id;
end;
$fn$;

-- ---------------------------------------------------------------------
-- فحص رمز التفعيل دون استهلاكه (لصفحة التفعيل)
-- ---------------------------------------------------------------------
create or replace function app.peek_activation_token(p_token_hash text)
returns table (valid boolean, reason text, full_name text, phone text, role text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare t public.activation_tokens;
begin
  select * into t from public.activation_tokens where token_hash = p_token_hash;

  if t is null then
    return query select false, 'NOT_FOUND'::text, null::text, null::text, null::text; return;
  end if;
  if t.used_at is not null then
    return query select false, 'ALREADY_USED'::text, null::text, null::text, null::text; return;
  end if;
  if t.expires_at < now() then
    return query select false, 'EXPIRED'::text, null::text, null::text, null::text; return;
  end if;

  return query select true, 'OK'::text, t.full_name, t.phone, t.role;
end;
$fn$;

-- ---------------------------------------------------------------------
-- حجز الرمز ذرّيًا — يضمن استخدامًا واحدًا فقط حتى مع طلبات متزامنة
-- ---------------------------------------------------------------------
create or replace function app.claim_activation_token(p_token_hash text)
returns public.activation_tokens
language plpgsql
security definer
set search_path = ''
as $fn$
declare t public.activation_tokens;
begin
  update public.activation_tokens
     set used_at = now()
   where token_hash = p_token_hash
     and used_at is null
     and expires_at > now()
  returning * into t;

  if t is null then
    raise exception 'TOKEN_INVALID'
      using hint = 'رابط التفعيل غير صالح أو منتهي الصلاحية أو مستخدم مسبقًا';
  end if;
  return t;
end;
$fn$;

-- تحرير الحجز إذا فشل إنشاء المستخدم بعد الحجز
create or replace function app.release_activation_token(p_token_hash text)
returns void
language sql
security definer
set search_path = ''
as $fn$
  update public.activation_tokens set used_at = null
   where token_hash = p_token_hash and used_by is null;
$fn$;

-- ---------------------------------------------------------------------
-- إنهاء التفعيل: ربط الرمز بالمستخدم وإنشاء ملفه
-- ---------------------------------------------------------------------
create or replace function app.complete_activation(
  p_token_hash text, p_user_id uuid, p_full_name text, p_phone text
) returns public.profiles
language plpgsql
security definer
set search_path = ''
as $fn$
declare t public.activation_tokens; lid uuid; p public.profiles;
begin
  select * into t from public.activation_tokens where token_hash = p_token_hash;
  if t is null then
    raise exception 'TOKEN_INVALID' using hint = 'رمز التفعيل غير صالح';
  end if;

  select id into lid from public.locations where code = t.location_code;
  if lid is null then
    select id into lid from public.locations where name_ar = 'الإدارة المركزية' limit 1;
  end if;

  insert into public.profiles
    (id, full_name, phone, role, location_id, job_title, is_active, must_change_password)
  values
    (p_user_id, p_full_name, app.normalize_saudi_phone(p_phone), t.role, lid,
     'مدير النظام', true, false)
  on conflict (id) do update
    set full_name = excluded.full_name, phone = excluded.phone,
        role = excluded.role, location_id = excluded.location_id, is_active = true
  returning * into p;

  update public.activation_tokens set used_by = p_user_id where id = t.id;

  insert into public.audit_logs (actor_id, actor_name, actor_role, action, entity_type, entity_id, location_id, details)
  values (p_user_id, p_full_name, t.role, 'activation.completed', 'profile', p_user_id::text, lid,
          jsonb_build_object('phone', app.normalize_saudi_phone(p_phone), 'role', t.role));

  return p;
end;
$fn$;

-- ---------------------------------------------------------------------
-- تسجيل آخر دخول (يستدعيه العميل بعد نجاح الدخول)
-- ---------------------------------------------------------------------
create or replace function app.record_login()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare me public.profiles;
begin
  update public.profiles set last_login_at = now()
   where id = (select auth.uid()) returning * into me;
  if me.id is not null then
    insert into public.audit_logs (actor_id, actor_name, actor_role, action, entity_type, entity_id, location_id)
    values (me.id, me.full_name, me.role, 'auth.login', 'profile', me.id::text, me.location_id);
  end if;
end;
$fn$;

create or replace function public.record_login()
returns void
language plpgsql security definer set search_path = ''
as $fn$ begin perform app.record_login(); end; $fn$;

revoke all on function public.record_login() from public, anon;
grant execute on function public.record_login() to authenticated;

-- ---------------------------------------------------------------------
-- تسجيل عملية إدارية في سجل التدقيق (من Edge Functions)
-- ---------------------------------------------------------------------
create or replace function app.log_admin_action(
  p_actor uuid, p_action text, p_entity_type text, p_entity_id text,
  p_details jsonb default '{}'::jsonb, p_ip text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare a public.profiles;
begin
  select * into a from public.profiles where id = p_actor;
  insert into public.audit_logs
    (actor_id, actor_name, actor_role, action, entity_type, entity_id, location_id, details, ip_address)
  values (p_actor, a.full_name, a.role, p_action, p_entity_type, p_entity_id,
          a.location_id, coalesce(p_details, '{}'::jsonb), p_ip);
end;
$fn$;

-- هذه الدوال لمفتاح الخدمة فقط — لا تُمنح لأي دور عميل
revoke all on function
  app.rate_limit_hit(text, text, integer, integer),
  app.create_activation_token(text, text, text, text, text, integer),
  app.peek_activation_token(text),
  app.claim_activation_token(text),
  app.release_activation_token(text),
  app.complete_activation(text, uuid, text, text),
  app.log_admin_action(uuid, text, text, text, jsonb, text)
from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- أغلفة public لمسار مفتاح الخدمة فقط
-- PostgREST يصل إلى سكيما public وحدها، لذا نكشف أغلفة رفيعة
-- ونمنحها للدور service_role حصرًا — ممنوعة على anon و authenticated.
-- ---------------------------------------------------------------------
create or replace function public.rate_limit_hit(
  p_bucket text, p_identifier text, p_window_seconds integer, p_max_hits integer)
returns boolean language plpgsql security definer set search_path = ''
as $fn$ begin
  return app.rate_limit_hit(p_bucket, p_identifier, p_window_seconds, p_max_hits);
end; $fn$;

create or replace function public.peek_activation_token(p_token_hash text)
returns table (valid boolean, reason text, full_name text, phone text, role text)
language plpgsql security definer set search_path = ''
as $fn$ begin
  return query select * from app.peek_activation_token(p_token_hash);
end; $fn$;

create or replace function public.claim_activation_token(p_token_hash text)
returns public.activation_tokens
language plpgsql security definer set search_path = ''
as $fn$ begin return app.claim_activation_token(p_token_hash); end; $fn$;

create or replace function public.release_activation_token(p_token_hash text)
returns void language plpgsql security definer set search_path = ''
as $fn$ begin perform app.release_activation_token(p_token_hash); end; $fn$;

create or replace function public.complete_activation(
  p_token_hash text, p_user_id uuid, p_full_name text, p_phone text)
returns public.profiles
language plpgsql security definer set search_path = ''
as $fn$ begin
  return app.complete_activation(p_token_hash, p_user_id, p_full_name, p_phone);
end; $fn$;

create or replace function public.create_activation_token(
  p_token_hash text, p_full_name text, p_phone text,
  p_role text default 'super_admin', p_location_code text default 'CN-06',
  p_hours integer default 24)
returns uuid language plpgsql security definer set search_path = ''
as $fn$ begin
  return app.create_activation_token(p_token_hash, p_full_name, p_phone,
                                     p_role, p_location_code, p_hours);
end; $fn$;

create or replace function public.log_admin_action(
  p_actor uuid, p_action text, p_entity_type text, p_entity_id text,
  p_details jsonb default '{}'::jsonb, p_ip text default null)
returns void language plpgsql security definer set search_path = ''
as $fn$ begin
  perform app.log_admin_action(p_actor, p_action, p_entity_type, p_entity_id, p_details, p_ip);
end; $fn$;

-- هذه الأغلفة ممنوعة على المتصفح تمامًا
revoke all on function
  public.rate_limit_hit(text, text, integer, integer),
  public.peek_activation_token(text),
  public.claim_activation_token(text),
  public.release_activation_token(text),
  public.complete_activation(text, uuid, text, text),
  public.create_activation_token(text, text, text, text, text, integer),
  public.log_admin_action(uuid, text, text, text, jsonb, text)
from public, anon, authenticated;

grant execute on function
  public.rate_limit_hit(text, text, integer, integer),
  public.peek_activation_token(text),
  public.claim_activation_token(text),
  public.release_activation_token(text),
  public.complete_activation(text, uuid, text, text),
  public.create_activation_token(text, text, text, text, text, integer),
  public.log_admin_action(uuid, text, text, text, jsonb, text)
to service_role;
