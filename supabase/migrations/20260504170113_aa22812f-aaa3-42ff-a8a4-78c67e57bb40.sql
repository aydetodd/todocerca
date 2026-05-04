REVOKE EXECUTE ON FUNCTION public.save_private_route_trace(uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_private_route_trace(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_private_route_trace(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_private_route_trace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_private_route_by_token(uuid) TO anon, authenticated;