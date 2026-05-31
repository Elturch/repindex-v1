
REVOKE EXECUTE ON FUNCTION public.claim_next_sweep_queue_item(text, text, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_expired_sweep_locks() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_sweep_queue_item(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_sweep_queue_item(uuid, text) FROM PUBLIC, anon, authenticated;
