import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SecretEncryption } from "./encryption";

import { deleteSecret, getSecret, getSecretStorageStatus, setSecret } from "./store";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "wttp-secrets-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/** Backend falso — não depende de `electron.safeStorage`, então roda em Vitest puro. */
function fakeEncryption(available: boolean): SecretEncryption {
  return {
    isAvailable: () => available,
    encrypt: value => Buffer.from(`enc:${value}`, "utf-8").toString("base64"),
    decrypt: value => Buffer.from(value, "base64").toString("utf-8").replace(/^enc:/, ""),
  };
}

describe("secret store", () => {
  it("grava cifrado e lê de volta o mesmo valor quando o backend do SO está disponível", async () => {
    const encryption = fakeEncryption(true);
    await setSecret(root, "wttp:abc:dev:api_key", "s3cr3t", encryption);

    const raw = await fs.readFile(join(root, ".wttp", "secrets.json"), "utf-8");
    expect(raw).not.toContain("s3cr3t");
    expect(JSON.parse(raw).encrypted).toBe(true);

    expect(await getSecret(root, "wttp:abc:dev:api_key", encryption)).toBe("s3cr3t");
  });

  it("cai para texto puro quando o backend não está disponível, e o status reporta isso", async () => {
    const encryption = fakeEncryption(false);
    await setSecret(root, "wttp:abc:dev:api_key", "s3cr3t", encryption);

    const raw = await fs.readFile(join(root, ".wttp", "secrets.json"), "utf-8");
    expect(JSON.parse(raw)).toEqual({
      encrypted: false,
      values: { "wttp:abc:dev:api_key": "s3cr3t" },
    });

    expect(getSecretStorageStatus(encryption)).toEqual({ encrypted: false });
  });

  it("avisa no console quando cai para o fallback em texto puro", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await setSecret(root, "wttp:abc:dev:api_key", "s3cr3t", fakeEncryption(false));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("plaintext"));
    } finally {
      warn.mockRestore();
    }
  });

  it("nunca escreve o segredo em outro lugar do workspace além de .wttp/secrets.json", async () => {
    await setSecret(root, "wttp:abc:dev:api_key", "s3cr3t", fakeEncryption(true));
    expect(await fs.readdir(root)).toEqual([".wttp"]);
  });

  it("remove a entrada ao deletar", async () => {
    const encryption = fakeEncryption(true);
    await setSecret(root, "wttp:abc:dev:api_key", "s3cr3t", encryption);

    await deleteSecret(root, "wttp:abc:dev:api_key");

    expect(await getSecret(root, "wttp:abc:dev:api_key", encryption)).toBeNull();
  });

  it("deletar uma chave inexistente não lança", async () => {
    await expect(deleteSecret(root, "never-set")).resolves.toBeUndefined();
  });

  it("retorna null para uma chave nunca gravada", async () => {
    expect(await getSecret(root, "unknown", fakeEncryption(true))).toBeNull();
  });
});
