-- app_events の INSERT ポリシー（authenticated）で auth.uid() が行ごとに
-- 再評価されるのを防ぐ（Supabase Performance Advisor: auth_rls_initplan）。
-- (select auth.uid()) にすると初期化プランで一度だけ評価され、スケール時の性能が改善する。
-- 挙動は変わらない（本人 or user_id NULL のみ挿入可）。DROP せず ALTER で無停止に差し替える。
alter policy "insert events (authed)" on public.app_events
  with check (user_id is null or user_id = (select auth.uid()));
