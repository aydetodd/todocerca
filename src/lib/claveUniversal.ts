import { supabase } from "@/integrations/supabase/client";

/** Clave universal: 5 números que sirven para entrar, abrir geocercas y activar SOS. */
export const CLAVE_LENGTH = 5;

export const esClaveUniversal = (valor: string) => /^\d{5}$/.test(valor);

/**
 * Supabase exige mínimo 6 caracteres, así que la clave de 5 números
 * se convierte internamente en una contraseña más larga. El usuario
 * nunca ve esta transformación: solo teclea sus 5 números.
 */
export const claveToPassword = (clave: string) => `QaRd-${clave}-TC`;

/** Al iniciar sesión probamos la clave nueva y, por compatibilidad, la contraseña vieja. */
export const passwordVariants = (entrada: string) =>
  esClaveUniversal(entrada) ? [claveToPassword(entrada), entrada] : [entrada];

/** Verifica la clave universal del usuario actual (para geocercas, SOS, etc.). */
export async function verificarClaveUniversal(clave: string): Promise<boolean> {
  if (!esClaveUniversal(clave)) return false;
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) return false;
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: claveToPassword(clave),
  });
  return !error;
}
