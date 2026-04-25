import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceFingerprint, getDeviceName, getDeviceType } from "@/lib/deviceFingerprint";
import { useAuth } from "@/hooks/useAuth";

type Status = "loading" | "trusted" | "needs_verification" | "no_user";

export function useDeviceVerification() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [deviceType] = useState(getDeviceType());

  const checkDevice = useCallback(async () => {
    if (!user) {
      setStatus("no_user");
      return;
    }

    // Las computadoras no requieren verificación SMS
    if (deviceType === "desktop") {
      setStatus("trusted");
      return;
    }

    const fp = getDeviceFingerprint();

    try {
      const { data, error } = await supabase
        .from("trusted_devices")
        .select("id, is_active")
        .eq("user_id", user.id)
        .eq("device_fingerprint", fp)
        .eq("is_active", true)
        .maybeSingle();

      if (error) {
        console.error("[useDeviceVerification] check error", error);
        // Fallback: no bloquear por error de red
        setStatus("trusted");
        return;
      }

      if (data) {
        // Actualizar last_seen en background
        supabase
          .from("trusted_devices")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", data.id)
          .then(() => {});
        setStatus("trusted");
      } else {
        // Migración suave: si el usuario no tiene NINGÚN dispositivo registrado todavía,
        // asumimos que es un usuario existente y registramos este como confiable.
        const { count } = await supabase
          .from("trusted_devices")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);

        if ((count ?? 0) === 0) {
          await supabase.from("trusted_devices").insert({
            user_id: user.id,
            device_fingerprint: fp,
            device_name: getDeviceName(),
            device_type: deviceType,
            user_agent: navigator.userAgent,
          });
          setStatus("trusted");
        } else {
          setStatus("needs_verification");
        }
      }
    } catch (e) {
      console.error("[useDeviceVerification] exception", e);
      setStatus("trusted");
    }
  }, [user, deviceType]);

  useEffect(() => {
    if (authLoading) {
      setStatus("loading");
      return;
    }
    checkDevice();
  }, [authLoading, checkDevice]);

  return { status, deviceType, recheck: checkDevice };
}
