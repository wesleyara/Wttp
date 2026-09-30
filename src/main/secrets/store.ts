/**
 * Segredos de environment (EP-04-T06) — arch-docs/file-format.md §5: uma variável
 * `secret: true` nunca tem valor no YAML; o valor real vive aqui, sob a chave
 * `wttp:<workspaceId>:<env>:<name>` que quem chama constrói e passa como `key` — a
 * store só sabe guardar/ler pares chave-valor de um workspace, não conhece o
 * vocabulário de environment/variável.
 *
 * Guardado em `<root>/.wttp/secrets.json` (arch-docs/file-format.md §1) — gitignored.
 * Quando `encryption.isAvailable()` (backend do SO via `safeStorage` — Keychain,
 * DPAPI, libsecret/kwallet), cada valor é cifrado antes de tocar o disco e o arquivo
 * marca `encrypted: true`. Sem isso disponível (ex: Linux sem libsecret), grava em
 * texto puro e marca `encrypted: false` — `getSecretStorageStatus` é o que deixa quem
 * chama (a UI de environments, EP-06) avisar que esse fallback é menos seguro.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";

import { writeFileAtomic } from "../storage/fsAtomic";
import { osKeychainEncryption, type SecretEncryption } from "./encryption";

const LOCAL_DIR = ".wttp";
const SECRETS_FILE = "secrets.json";

interface SecretsFile {
  /** Como os valores abaixo estão codificados — decide se `decrypt` entra na leitura. */
  encrypted: boolean;
  values: Record<string, string>;
}

const EMPTY_FILE: SecretsFile = { encrypted: false, values: {} };

function secretsPath(root: string): string {
  return join(root, LOCAL_DIR, SECRETS_FILE);
}

async function readSecretsFile(root: string): Promise<SecretsFile> {
  try {
    const raw = await fs.readFile(secretsPath(root), "utf-8");
    return { ...EMPTY_FILE, ...(JSON.parse(raw) as Partial<SecretsFile>) };
  } catch {
    return EMPTY_FILE;
  }
}

async function writeSecretsFile(root: string, data: SecretsFile): Promise<void> {
  await writeFileAtomic(secretsPath(root), JSON.stringify(data, null, 2));
}

export interface SecretStorageStatus {
  encrypted: boolean;
}

/** `encrypted: false` significa que os segredos deste processo estão indo para disco em texto puro. */
export function getSecretStorageStatus(
  encryption: SecretEncryption = osKeychainEncryption,
): SecretStorageStatus {
  return { encrypted: encryption.isAvailable() };
}

export async function getSecret(
  root: string,
  key: string,
  encryption: SecretEncryption = osKeychainEncryption,
): Promise<string | null> {
  const file = await readSecretsFile(root);
  const stored = file.values[key];
  if (stored === undefined) return null;
  if (!file.encrypted) return stored;

  try {
    return encryption.decrypt(stored);
  } catch {
    // Valor cifrado numa chave de SO que já não existe (ex: keychain resetado) —
    // trata como ausente em vez de derrubar quem chamou.
    return null;
  }
}

export async function setSecret(
  root: string,
  key: string,
  value: string,
  encryption: SecretEncryption = osKeychainEncryption,
): Promise<void> {
  const file = await readSecretsFile(root);
  const encrypted = encryption.isAvailable();

  if (!encrypted) {
    console.warn(
      `wttp: OS keychain unavailable, storing secret "${key}" in plaintext at ${secretsPath(root)}`,
    );
  }

  file.encrypted = encrypted;
  file.values[key] = encrypted ? encryption.encrypt(value) : value;

  await writeSecretsFile(root, file);
}

/** Remove uma chave — usado tanto por `secret:delete` quanto quando a variável dona dela é apagada. */
export async function deleteSecret(root: string, key: string): Promise<void> {
  const file = await readSecretsFile(root);
  if (!(key in file.values)) return;

  delete file.values[key];
  await writeSecretsFile(root, file);
}

/** Renomeia chaves em bloco (`from` → `to`), preservando o valor já cifrado — usado quando o arquivo de um environment muda de `path`. */
export async function moveSecrets(
  root: string,
  moves: { from: string; to: string }[],
): Promise<void> {
  const file = await readSecretsFile(root);
  let changed = false;
  for (const { from, to } of moves) {
    if (!(from in file.values)) continue;
    file.values[to] = file.values[from];
    delete file.values[from];
    changed = true;
  }
  if (changed) await writeSecretsFile(root, file);
}
