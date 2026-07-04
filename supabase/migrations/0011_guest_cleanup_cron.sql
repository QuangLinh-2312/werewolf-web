-- =====================================================================
-- 0011_guest_cleanup_cron.sql
-- Tự động dọn dẹp anonymous (guest) users không còn hoạt động
-- Yêu cầu: pg_cron extension (Supabase đã có sẵn trên paid plans)
-- =====================================================================

-- Bật pg_cron nếu chưa có
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------
-- FUNCTION: cleanup_stale_guest_users
-- Xoá anonymous users đã tạo > 24h và không đang chơi game nào
-- profiles sẽ tự xoá theo nhờ ON DELETE CASCADE trên auth.users
-- ---------------------------------------------------------------------
create or replace function public.cleanup_stale_guest_users()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  -- Xoá anonymous users đã hơn 24h và không là host của phòng đang chơi
  -- và không đang là game_player trong session chưa kết thúc
  with stale_guests as (
    select au.id
    from auth.users au
    where au.is_anonymous = true
      and au.created_at < now() - interval '24 hours'
      -- Không là host phòng đang active
      and au.id not in (
        select host_id from public.rooms
        where status in ('lobby', 'playing')
      )
      -- Không đang trong session chưa kết thúc
      and au.id not in (
        select gp.profile_id
        from public.game_players gp
        join public.game_sessions gs on gs.id = gp.session_id
        where gs.phase <> 'game_over'
          and gs.ended_at is null
      )
  )
  delete from auth.users
  where id in (select id from stale_guests);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------
-- CRON JOB: Chạy mỗi ngày lúc 3:00 AM UTC
-- ---------------------------------------------------------------------
select cron.schedule(
  'cleanup-stale-guest-users',       -- tên job (unique)
  '0 3 * * *',                        -- cron expression: 3AM mỗi ngày
  $$ select public.cleanup_stale_guest_users(); $$
);

-- ---------------------------------------------------------------------
-- GHI CHÚ:
-- Để xem các cron jobs đang chạy:
--   select * from cron.job;
-- Để xem lịch sử chạy:
--   select * from cron.job_run_details order by start_time desc limit 20;
-- Để xoá job:
--   select cron.unschedule('cleanup-stale-guest-users');
-- Để chạy thủ công ngay:
--   select public.cleanup_stale_guest_users();
-- ---------------------------------------------------------------------
