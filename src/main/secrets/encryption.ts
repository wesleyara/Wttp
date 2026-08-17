/**
 * Único ponto que toca `electron.safeStorage` — como `config/appDataDir.ts`, existe só
 * para que `store.ts` receba essa capacidade por parâmetro e continue testável com
 * Vitest puro, sem subir o Electron. `safeStorage` é o que Electron chama de "keychain
 * do SO": Keychain no macOS, DPAPI no Windows, libsecret/kwallet no Linux — a chave de
 * cifragem é gerenciada por eles, não por nós.
 */

import { safeStorage } from "electron";

export interface SecretEncryption {
  isAvailable(): boolean;
  encrypt(value: string): string;
  decrypt(value: string): string;
}

export const osKeychainEncryption: SecretEncryption = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: value => safeStorage.encryptString(value).toString("base64"),
  decrypt: value => safeStorage.decryptString(Buffer.from(value, "base64")),
};
