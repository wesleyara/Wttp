import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SecretEncryption } from "../secrets/encryption";

import { getSecret } from "../secrets/store";
import { removeEnvironment, saveEnvironment } from "./environments";
import { getEnvironment } from "./tree";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "wttp-environments-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function fakeEncryption(available = true): SecretEncryption {
  return {
    isAvailable: () => available,
    encrypt: value => Buffer.from(`enc:${value}`, "utf-8").toString("base64"),
    decrypt: value => Buffer.from(value, "base64").toString("utf-8").replace(/^enc:/, ""),
  };
}

describe("saveEnvironment — criação", () => {
  it("cria o arquivo com variáveis não secretas gravadas normalmente", async () => {
    const created = await saveEnvironment(
      {
        root,
        name: "dev",
        variables: [{ name: "base_url", value: "https://dev.example.com", enabled: true }],
      },
      fakeEncryption(),
    );

    expect(created.data.variables).toEqual([
      { name: "base_url", value: "https://dev.example.com", enabled: true, description: undefined },
    ]);

    const onDisk = await fs.readFile(join(root, "environments", created.path), "utf-8");
    expect(onDisk).toContain("https://dev.example.com");
  });

  it("uma variável secreta nunca grava o valor no YAML — vai para o keychain", async () => {
    const encryption = fakeEncryption();
    const created = await saveEnvironment(
      {
        root,
        name: "dev",
        variables: [{ name: "api_key", value: "s3cr3t", enabled: true, secret: true }],
      },
      encryption,
    );

    const onDisk = await fs.readFile(join(root, "environments", created.path), "utf-8");
    expect(onDisk).not.toContain("s3cr3t");
    expect(onDisk).toContain("secret: true");

    const stored = await getSecret(root, `wttp:${root}:${created.path}:api_key`, encryption);
    expect(stored).toBe("s3cr3t");
  });
});

describe("saveEnvironment — atualização", () => {
  it("value: undefined numa variável secreta preserva o segredo já salvo", async () => {
    const encryption = fakeEncryption();
    const created = await saveEnvironment(
      {
        root,
        name: "dev",
        variables: [{ name: "api_key", value: "s3cr3t", enabled: true, secret: true }],
      },
      encryption,
    );

    await saveEnvironment(
      {
        root,
        path: created.path,
        name: "dev",
        variables: [{ name: "api_key", enabled: true, secret: true }],
      },
      encryption,
    );

    const stored = await getSecret(root, `wttp:${root}:${created.path}:api_key`, encryption);
    expect(stored).toBe("s3cr3t");
  });

  it("value: '' explícito apaga o segredo", async () => {
    const encryption = fakeEncryption();
    const created = await saveEnvironment(
      {
        root,
        name: "dev",
        variables: [{ name: "api_key", value: "s3cr3t", enabled: true, secret: true }],
      },
      encryption,
    );

    await saveEnvironment(
      {
        root,
        path: created.path,
        name: "dev",
        variables: [{ name: "api_key", value: "", enabled: true, secret: true }],
      },
      encryption,
    );

    const stored = await getSecret(root, `wttp:${root}:${created.path}:api_key`, encryption);
    expect(stored).toBeNull();
  });

  it("remover a linha de uma variável secreta apaga o segredo órfão", async () => {
    const encryption = fakeEncryption();
    const created = await saveEnvironment(
      {
        root,
        name: "dev",
        variables: [{ name: "api_key", value: "s3cr3t", enabled: true, secret: true }],
      },
      encryption,
    );

    await saveEnvironment({ root, path: created.path, name: "dev", variables: [] }, encryption);

    const stored = await getSecret(root, `wttp:${root}:${created.path}:api_key`, encryption);
    expect(stored).toBeNull();
  });

  it("renomear o environment não muda o path do arquivo nem a chave do segredo", async () => {
    const encryption = fakeEncryption();
    const created = await saveEnvironment(
      {
        root,
        name: "dev",
        variables: [{ name: "api_key", value: "s3cr3t", enabled: true, secret: true }],
      },
      encryption,
    );

    const renamed = await saveEnvironment(
      {
        root,
        path: created.path,
        name: "development",
        variables: [{ name: "api_key", enabled: true, secret: true }],
      },
      encryption,
    );

    expect(renamed.path).toBe(created.path);
    const stored = await getSecret(root, `wttp:${root}:${created.path}:api_key`, encryption);
    expect(stored).toBe("s3cr3t");
  });

  it("variável não secreta sem value explícito é rejeitada", async () => {
    const created = await saveEnvironment({ root, name: "dev", variables: [] }, fakeEncryption());

    await expect(
      saveEnvironment(
        {
          root,
          path: created.path,
          name: "dev",
          variables: [{ name: "base_url", enabled: true }],
        },
        fakeEncryption(),
      ),
    ).rejects.toThrow();
  });
});

describe("removeEnvironment", () => {
  it("apaga o arquivo e os segredos de todas as variáveis secretas", async () => {
    const encryption = fakeEncryption();
    const created = await saveEnvironment(
      {
        root,
        name: "dev",
        variables: [{ name: "api_key", value: "s3cr3t", enabled: true, secret: true }],
      },
      encryption,
    );

    await removeEnvironment(root, created.path);

    expect(await getEnvironment(root, created.path)).toBeNull();
    expect(await getSecret(root, `wttp:${root}:${created.path}:api_key`, encryption)).toBeNull();
  });
});
