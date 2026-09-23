-- =====================================================================
-- تعيين أول مدير للنظام — يُنفَّذ مرة واحدة من Supabase → SQL Editor
-- بعد إنشاء حسابك من Authentication → Users → Add user.
-- غيّر البريد أدناه إلى بريدك ثم اضغط Run.
-- =====================================================================
update public.profiles
   set role = 'admin', is_active = true, full_name = coalesce(nullif(full_name, ''), 'مدير النظام')
 where email = lower('YOUR-EMAIL@example.com')
returning id, email, role;
