-- Les fonctions de déclencheur ne s'appellent pas depuis l'API (audit de sécurité Supabase, 23.10.2026).
revoke execute on function public.tg_qg_items_avant() from public, anon, authenticated;
revoke execute on function public.tg_qg_items_journal() from public, anon, authenticated;
