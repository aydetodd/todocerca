import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceFingerprint, getDeviceName, getDeviceType } from "@/lib/deviceFingerprint";
import { useAuth } from "@/hooks/useAuth";

type Status = "loading" | "ok" | "blocked" | "no_user";

interface BlockedInfo {
  device_name: string | null;
  device_type: string | null;
  last_seen_at: string;
}

/**
 * Sesión única por usuario (bloqueo duro).
 * Si el usuario ya tiene sesión activa en otro dispositivo, este se bloquea.
 */
export function useSingleSession() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [blockedInfo, setBlockedInfo] = useState<BlockedInfo | null>(null);

  const claimSession = useCallback(async () => {
    if (!user) {
      setStatus("no_user");
      return;
    }

    const fp = getDeviceFingerprint();
    const deviceName = getDeviceName();
    const deviceType = getDeviceType();

    try {
      // Buscar sesión activa
      const { data: existing, error: selErr } = await supabase
        .from("active_sessions")
        .select("device_fingerprint, device_name, device_type, last_seen_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (selErr) {
        console.error("[useSingleSession] select error", selErr);
        setStatus("ok"); // No bloquear por error de red
        return;
      }

      if (!existing) {
        // No hay sesión: reclamar este dispositivo
        const { error: insErr } = await supabase.from("active_sessions").insert({
          user_id: user.id,
          device_fingerprint: fp,
          device_name: deviceName,
          device_type: deviceType,
          user_agent: navigator.userAgent,
        });
        if (insErr) {
          console.error("[useSingleSession] insert error", insErr);
        }
        setStatus("ok");
        return;
      }

      if (existing.device_fingerprint === fp) {
        // Mismo dispositivo: actualizar last_seen
        await supabase
          .from("active_sessions")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("user_id", user.id);
        setStatus("ok");
      } else {
        // Otro dispositivo: bloquear
        setBlockedInfo({
          device_name: existing.device_name,
          device_type: existing.device_type,
          last_seen_at: existing.last_seen_at,
        });
        setStatus("blocked");
      }
    } catch (e) {
      console.error("[useSingleSession] exception", e);
      setStatus("ok");
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) {
      setStatus("loading");
      return;
    }
    claimSession();
  }, [authLoading, claimSession]);

  // Heartbeat cada 60s para mantener last_seen actualizado
  useEffect(() => {
    if (status !== "ok" || !user) return;
    const interval = setInterval(() => {
      supabase
        .from("active_sessions")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .then(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [status, user]);

  // Realtime: si otro dispositivo toma la sesión, este se bloquea automáticamente
  useEffect(() => {
    if (!user || status !== "ok") return;
    const fp = getDeviceFingerprint();
    const channel = supabase
      .channel(`active_session_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "active_sessions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newFp = (payload.new as any)?.device_fingerprint;
          if (newFp && newFp !== fp) {
            setBlockedInfo({
              device_name: (payload.new as any).device_name,
              device_type: (payload.new as any).device_type,
              last_seen_at: (payload.new as any).last_seen_at,
            });
            setStatus("blocked");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, status]);

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  return { status, blockedInfo, signOut: handleSignOut, recheck: claimSession };
}
