export interface TcbVaultPlugin {
  read(options: { scope: string; cardId: string }): Promise<{ payload: string | null }>;
  write(options: { scope: string; cardId: string; payload: string; expectedHash: string | null }): Promise<void>;
}
export declare const TcbVault: TcbVaultPlugin;