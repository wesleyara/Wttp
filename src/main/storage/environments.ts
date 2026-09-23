/**
 * Orquestra CRUD de environment (EP-06-T02) por cima de `tree.ts` (leitura/escrita do
 * YAML) e `secrets/store.ts` (valor real de uma variável `secret: true`) — as duas
 * metades da regra "segredo jamais em YAML" de arch-docs/file-format.md §5. Módulo puro o
 * bastante para Vitest: recebe `encryption` por parâmetro do mesmo jeito que
 * `secrets/store.ts`, nunca chama `electron.safeStorage` direto.
 */

import type { EnvironmentFile, EnvironmentListItem, EnvironmentVariable } from "@shared";

import { DomainError } from "../ipc/errors";
import { osKeychainEncryption, type SecretEncryption } from "../secrets/encryption";
import { deleteSecret, setSecret } from "../secrets/store";
import { CURRENT_SCHEMA_VERSION } from "./migrations/registry";
import { createEnvironment, deleteEnvironment, getEnvironment, writeEnvironment } from "./tree";

/**
 * `wttp:<workspaceId>:<env>:<name>` (arch-docs/file-format.md §5) — `workspaceId` é a raiz
 * do workspace, `env` é o `path` do arquivo (estável, não o `name` editável).
 */
export function buildSecretKey(root: string, envPath: string, varName: string): string {
  return `wttp:${root}:${envPath}:${varName}`;
}

export interface SaveEnvironmentVariableInput {
  name: string;
  enabled: boolean;
  description?: string;
  secret?: boolean;
  /**
   * Valor em texto puro. Para uma variável secreta, `undefined` significa "não
   * alterada nesta edição" — mantém o segredo já salvo; string vazia explícita apaga
   * o segredo. Para uma variável não secreta é sempre obrigatório.
   */
  value?: string;
}

export interface SaveEnvironmentInput {
  root: string;
  /** Ausente = cria um environment novo. */
  path?: string;
  name: string;
  variables: SaveEnvironmentVariableInput[];
}

async function applySecrets(
  root: string,
  path: string,
  previous: EnvironmentVariable[] | undefined,
  inputs: SaveEnvironmentVariableInput[],
  encryption: SecretEncryption,
): Promise<EnvironmentVariable[]> {
  const previousSecretNames = new Set(
    (previous ?? []).filter(variable => variable.secret).map(variable => variable.name),
  );

  const nextVariables: EnvironmentVariable[] = [];
  const keepSecretNames = new Set<string>();

  for (const input of inputs) {
    if (!input.secret) {
      if (input.value === undefined) {
        throw new DomainError(
          "INVALID_PAYLOAD",
          `variable "${input.name}" is not secret and requires a value`,
          input.name,
        );
      }
      nextVariables.push({
        name: input.name,
        value: input.value,
        enabled: input.enabled,
        description: input.description,
      });
      continue;
    }

    keepSecretNames.add(input.name);
    const key = buildSecretKey(root, path, input.name);
    if (input.value !== undefined) {
      if (input.value.length > 0) await setSecret(root, key, input.value, encryption);
      else await deleteSecret(root, key);
    }
    // `undefined` = variável secreta não tocada nesta edição — o valor já gravado no
    // keychain permanece intacto.

    nextVariables.push({
      name: input.name,
      value: "",
      enabled: input.enabled,
      description: input.description,
      secret: true,
    });
  }

  // Variáveis secretas que existiam antes e não estão mais na lista — a linha foi
  // apagada na UI, o segredo órfão vai junto.
  await Promise.all(
    [...previousSecretNames]
      .filter(name => !keepSecretNames.has(name))
      .map(name => deleteSecret(root, buildSecretKey(root, path, name))),
  );

  return nextVariables;
}

/** Cria ou atualiza um environment, roteando variáveis `secret: true` para o keychain — nunca para o YAML. */
export async function saveEnvironment(
  input: SaveEnvironmentInput,
  encryption: SecretEncryption = osKeychainEncryption,
): Promise<EnvironmentListItem> {
  if (input.path === undefined) {
    const created = await createEnvironment(input.root, input.name);
    const variables = await applySecrets(
      input.root,
      created.path,
      undefined,
      input.variables,
      encryption,
    );
    const data: EnvironmentFile = { wttp: CURRENT_SCHEMA_VERSION, name: input.name, variables };
    return writeEnvironment(input.root, created.path, data);
  }

  const existing = await getEnvironment(input.root, input.path);
  if (!existing) {
    throw new DomainError("ENOENT", `environment not found: "${input.path}"`, input.path);
  }

  const variables = await applySecrets(
    input.root,
    input.path,
    existing.data.variables,
    input.variables,
    encryption,
  );
  const data: EnvironmentFile = { ...existing.data, name: input.name, variables };
  return writeEnvironment(input.root, input.path, data);
}

/** Apaga um environment e todos os segredos das suas variáveis `secret: true` — `deleteSecret` não precisa de `encryption`, só `setSecret`/`getSecret` (decifrar). */
export async function removeEnvironment(root: string, path: string): Promise<void> {
  const existing = await getEnvironment(root, path);
  if (existing) {
    await Promise.all(
      (existing.data.variables ?? [])
        .filter(variable => variable.secret)
        .map(variable => deleteSecret(root, buildSecretKey(root, path, variable.name))),
    );
  }
  await deleteEnvironment(root, path);
}
