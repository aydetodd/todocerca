import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useBackgroundTracking } from "@/hooks/useBackgroundTracking";
import { LocationPermissionGuide } from "@/components/LocationPermissionGuide";

const STORAGE_KEY = "todocerca.selectedTrackingGroupId";

type UserStatus = "available" | "busy" | "offline" | null;

/**
 * Mantiene el envío de ubicación del grupo activo (tracking_member_locations)
 * aun cuando el usuario navega fuera de /tracking-gps.
 */
export const GlobalGroupTracking = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<UserStatus>(null);

  const isSubscriptionActive = useMemo(() => {
    const s = (subscriptionStatus ?? "").toLowerCase();
    return s === "active" || s === "activa";
  }, [subscriptionStatus]);

  const isTrackingEnabled = useMemo(() => {
    const reasons: string[] = [];
    if (!userId) reasons.push("sin userId");
    if (!groupId) reasons.push("sin groupId");
    if (!isSubscriptionActive) reasons.push(`suscripción no activa (${subscriptionStatus})`);
    if (userStatus === "offline") reasons.push("estado offline");
    
    const enabled = reasons.length === 0;
    
    // Log de diagnóstico siempre visible
    console.log('[GlobalGroupTracking] ===== DIAGNÓSTICO =====');
    console.log('[GlobalGroupTracking] userId:', userId);
    console.log('[GlobalGroupTracking] groupId:', groupId);
    console.log('[GlobalGroupTracking] subscriptionStatus:', subscriptionStatus);
    console.log('[GlobalGroupTracking] isSubscriptionActive:', isSubscriptionActive);
    console.log('[GlobalGroupTracking] userStatus:', userStatus);
    console.log('[GlobalGroupTracking] isTrackingEnabled:', enabled);
    if (!enabled) console.log('[GlobalGroupTracking] Razones deshabilitado:', reasons.join(', '));
    console.log('[GlobalGroupTracking] =======================');
    
    return enabled;
  }, [userId, groupId, isSubscriptionActive, userStatus, subscriptionStatus]);

  // En nativo, este hook enciende BackgroundGeolocation + foreground service.
  // En web, el hook no hace nada (y abajo usamos navigator.geolocation).
  const { showPermissionGuide, closePermissionGuide } = useBackgroundTracking(isTrackingEnabled, groupId);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setUserId(null);
            setGroupId(null);
            setSubscriptionStatus(null);
            setUserStatus(null);
          }
          return;
        }

        if (!cancelled) setUserId(user.id);

        // Estado (available/busy/offline)
        const { data: profile } = await supabase
          .from("profiles")
          .select("estado")
          .eq("user_id", user.id)
          .single();

        if (!cancelled) setUserStatus((profile?.estado as UserStatus) ?? null);

        // Grupos donde soy miembro
        const { data: memberships } = await supabase
          .from("tracking_group_members")
          .select("group_id")
          .eq("user_id", user.id);

        const groupIds = (memberships || []).map((m) => m.group_id);
        if (groupIds.length === 0) {
          if (!cancelled) {
            setGroupId(null);
            setSubscriptionStatus(null);
          }
          return;
        }

        // Elegir grupo:
        // 1) el guardado en localStorage (si existe y aún soy miembro)
        // 2) si no hay guardado, priorizar uno con suscripción activa
        // 3) fallback al primero
        let chosenGroupId: string | null = null;
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored && groupIds.includes(stored)) chosenGroupId = stored;
        } catch {
          // ignore
        }

        // Traer estados de suscripción para priorizar un grupo activo
        const { data: groupRows } = await supabase
          .from("tracking_groups")
          .select("id, subscription_status")
          .in("id", groupIds);

        if (!chosenGroupId) {
          const activeRow = (groupRows || []).find((g) => {
            const s = (g.subscription_status ?? "").toLowerCase();
            return s === "active" || s === "activa";
          });
          if (activeRow) chosenGroupId = activeRow.id;
        }

        if (!chosenGroupId) chosenGroupId = groupIds[0];

        const chosenSubscriptionStatus =
          (groupRows || []).find((g) => g.id === chosenGroupId)?.subscription_status ?? null;

        if (!cancelled) {
          setGroupId(chosenGroupId);
          setSubscriptionStatus(chosenSubscriptionStatus);
        }
      } catch (e) {
        console.error('[GlobalGroupTracking] Error cargando contexto:', e);
      }
    };

    load();

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    const onGroupChanged = () => {
      load();
    };

    window.addEventListener(
      "todocerca:tracking-group-changed",
      onGroupChanged as unknown as EventListener
    );

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      window.removeEventListener(
        "todocerca:tracking-group-changed",
        onGroupChanged as unknown as EventListener
      );
    };
  }, []);

  // Reaccionar en tiempo real a cambios de estado del usuario
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("global_group_tracking_profile")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const estado = (payload.new as any)?.estado as UserStatus | undefined;
          setUserStatus(estado ?? null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // En web (PWA), enviar ubicación aunque el usuario no esté en /tracking-gps
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (!isTrackingEnabled || !userId || !groupId) return;

    let watchId: number | null = null;
    let lastUpdateTime = 0;
    const MIN_UPDATE_INTERVAL = 3000;

    if (!navigator.geolocation) return;

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) return;
        lastUpdateTime = now;

        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;

        supabase
          .from("tracking_member_locations")
          .upsert(
            {
              user_id: userId,
              group_id: groupId,
              latitude,
              longitude,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,group_id" }
          )
          .then(() => {
            // noop
          });
      },
      () => {
        // noop
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [isTrackingEnabled, userId, groupId]);

  return <LocationPermissionGuide open={showPermissionGuide} onClose={closePermissionGuide} />;
};
