-- ファネル計測用イベントテーブル
-- 適用方法: Supabase ダッシュボード → SQL Editor にこのファイルの内容を貼り付けて実行
--（または supabase CLI: supabase db push）

create table if not exists public.app_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  device_id  text,
  user_id    uuid,
  event      text not null check (char_length(event) <= 64),
  props      jsonb not null default '{}'::jsonb
);

create index if not exists app_events_event_created_idx on public.app_events (event, created_at);
create index if not exists app_events_device_idx on public.app_events (device_id, created_at);

alter table public.app_events enable row level security;

-- 挿入のみ許可（読み取りはダッシュボード/サービスロールのみ）
drop policy if exists "insert events (anon)" on public.app_events;
create policy "insert events (anon)" on public.app_events
  for insert to anon
  with check (user_id is null);

drop policy if exists "insert events (authed)" on public.app_events;
create policy "insert events (authed)" on public.app_events
  for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

-- ▼ ファネル集計の例（SQL Editor でそのまま使えます）
-- select event, count(distinct device_id) as devices, count(*) as total
-- from app_events
-- where created_at > now() - interval '7 days'
-- group by event
-- order by devices desc;
