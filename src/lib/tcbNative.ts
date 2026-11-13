import { Capacitor } from "@capacitor/core";
import { TcbVault } from "@todocerca/tcb-vault";
import { TcbBackupStore, type TcbBackupContext } from "./tcbBackup";

/** Remote preview/web/PWA cannot access the vault. No browser storage fallback. */
export function createNativeTcbBackup(context: TcbBackupContext): TcbBackupStore {
  const localOrigin = typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (!Capacitor.isNativePlatform() || !localOrigin || !Capacitor.isPluginAvailable("TcbVault")) {
    throw new Error("TCB requiere la aplicación instalada con la bóveda nativa disponible.");
  }
  return new TcbBackupStore(TcbVault, context);
}