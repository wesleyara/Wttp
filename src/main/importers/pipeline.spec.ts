import type { FolderFile, RequestFile } from "@shared";

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Importer, NormalizedImport } from "./types";

import { createNode, readNode, scanWorkspace } from "../storage/tree";
import { detectImportFormat, previewImport, runImport } from "./pipeline";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "wttp-import-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/** Formato de mentira só para exercitar a infra — nenhum formato real depende disto. */
function fakeImporter(overrides: Partial<Importer> = {}): Importer {
  return {
    format: "postman",
    detect: content => content.startsWith("FAKE:"),
    parse: content => content.slice("FAKE:".length),
    normalize: (parsed): NormalizedImport => ({
      name: "Imported collection",
      children: [
        {
          kind: "folder",
          name: "Users",
          children: [
            {
              kind: "request",
              name: "Get user",
              method: "GET",
              url: `https://api.example.com/${String(parsed)}`,
              headers: [{ name: "Accept", value: "application/json", enabled: true }],
            },
          ],
        },
      ],
      environments: [
        {
          name: "Production",
          variables: [{ name: "base_url", value: "https://api.example.com", enabled: true }],
        },
      ],
      notConverted: [
        { path: "Get user > preRequest script", reason: "pm.sendRequest sem equivalente" },
      ],
    }),
    ...overrides,
  };
}

describe("detectImportFormat", () => {
  it("reconhece o formato pelo conteúdo através do importador registrado", () => {
    const format = detectImportFormat("FAKE:users", "collection.json", [fakeImporter()]);
    expect(format).toBe("postman");
  });

  it("devolve null quando nenhum importador reconhece o conteúdo", () => {
    const format = detectImportFormat("not a known format", undefined, [fakeImporter()]);
    expect(format).toBeNull();
  });
});

describe("runImport", () => {
  it("grava a árvore normalizada via storage/tree e devolve o relatório", async () => {
    const report = await runImport(
      { format: "postman", content: "FAKE:users", root, targetPath: "" },
      [fakeImporter()],
    );

    expect(report).toEqual({
      createdFolders: 2, // pasta raiz "Imported collection" + "Users"
      createdRequests: 1,
      createdEnvironments: 1,
      notConverted: [
        { path: "Get user > preRequest script", reason: "pm.sendRequest sem equivalente" },
      ],
    });

    const tree = await scanWorkspace(root);
    const rootFolder = tree.children[0];
    expect(rootFolder.kind).toBe("folder");
    expect(rootFolder.name).toBe("Imported collection");

    const usersFolder = rootFolder.kind === "folder" ? rootFolder.children[0] : undefined;
    expect(usersFolder?.name).toBe("Users");

    const request =
      usersFolder?.kind === "folder" ? (usersFolder.children[0] as { path: string }) : undefined;
    expect(request).toBeDefined();

    const requestNode = await readNode(root, request!.path);
    expect((requestNode.data as RequestFile).url).toBe("https://api.example.com/users");
    expect((requestNode.data as RequestFile).headers).toEqual([
      { name: "Accept", value: "application/json", enabled: true },
    ]);

    const environmentFiles = await fs.readdir(join(root, "environments"));
    expect(environmentFiles).toHaveLength(1);

    const usersFolderData = (await readNode(root, usersFolder!.path)).data as FolderFile | null;
    expect(usersFolderData?.name).toBe("Users");
  });

  it("adicionar um formato novo não muda a infraestrutura — dois formatos convivem no mesmo registro", async () => {
    const otherFormat = fakeImporter({
      format: "curl",
      detect: content => content.startsWith("OTHER:"),
    });

    const report = await runImport(
      { format: "curl", content: "OTHER:orders", root, targetPath: "" },
      [fakeImporter(), otherFormat],
    );

    expect(report.createdRequests).toBe(1);
  });

  it("formato sem importador registrado falha com erro claro, não escreve nada", async () => {
    await expect(
      runImport({ format: "openapi", content: "whatever", root, targetPath: "" }, [fakeImporter()]),
    ).rejects.toMatchObject({ code: "IMPORT_FORMAT_UNRECOGNIZED" });

    const entries = await fs.readdir(root).catch(() => []);
    expect(entries).toEqual([]);
  });

  it("conteúdo que o parser não reconhece falha com erro claro em vez de importar lixo", async () => {
    const brokenImporter = fakeImporter({
      detect: () => true,
      parse: () => {
        throw new Error("unexpected token");
      },
    });

    await expect(
      runImport({ format: "postman", content: "garbage", root, targetPath: "" }, [brokenImporter]),
    ).rejects.toMatchObject({ code: "IMPORT_FORMAT_UNRECOGNIZED" });
  });
});

describe("runImport com resolutions (EP-08-T07 — para dentro de pasta existente)", () => {
  it("sem conflito, grava os filhos direto em targetPath, sem pasta-raiz nova", async () => {
    const report = await runImport(
      { format: "postman", content: "FAKE:users", root, targetPath: "", resolutions: [] },
      [fakeImporter()],
    );

    expect(report.createdFolders).toBe(1); // só "Users" — sem pasta "Imported collection" envolvendo
    const tree = await scanWorkspace(root);
    expect(tree.children.map(node => node.name)).toEqual(["Users"]);
  });

  it("conflito com action 'skip' não cria nem apaga nada", async () => {
    await createNode(root, "", "folder", "Users");

    const report = await runImport(
      {
        format: "postman",
        content: "FAKE:users",
        root,
        targetPath: "",
        resolutions: [{ index: 0, action: "skip" }],
      },
      [fakeImporter()],
    );

    expect(report.createdFolders).toBe(0);
    expect(report.createdRequests).toBe(0);
    const tree = await scanWorkspace(root);
    expect(tree.children).toHaveLength(1);
    const usersFolder = tree.children[0];
    expect(usersFolder.kind === "folder" ? usersFolder.children : null).toEqual([]);
  });

  it("conflito com action 'rename' preserva o existente e cria o importado com o novo nome", async () => {
    await createNode(root, "", "folder", "Users");

    const report = await runImport(
      {
        format: "postman",
        content: "FAKE:users",
        root,
        targetPath: "",
        resolutions: [{ index: 0, action: "rename", newName: "Users (imported)" }],
      },
      [fakeImporter()],
    );

    expect(report.createdFolders).toBe(1);
    expect(report.createdRequests).toBe(1);
    const tree = await scanWorkspace(root);
    const names = tree.children.map(node => node.name).sort();
    expect(names).toEqual(["Users", "Users (imported)"]);
  });

  it("conflito com action 'replace' apaga o existente antes de criar o importado", async () => {
    const existing = await createNode(root, "", "folder", "Users");
    await createNode(root, existing.path, "request", "Old request");

    const report = await runImport(
      {
        format: "postman",
        content: "FAKE:users",
        root,
        targetPath: "",
        resolutions: [{ index: 0, action: "replace" }],
      },
      [fakeImporter()],
    );

    expect(report.createdFolders).toBe(1);
    expect(report.createdRequests).toBe(1);
    const tree = await scanWorkspace(root);
    expect(tree.children).toHaveLength(1);
    const usersFolder = tree.children[0];
    const childNames =
      usersFolder.kind === "folder" ? usersFolder.children.map(child => child.name) : [];
    expect(childNames).toEqual(["Get user"]); // "Old request" foi substituída, não convive com ela
  });

  it("metadados de nível de collection viram entrada no relatório em vez de perdidos em silêncio", async () => {
    const importerWithRootMetadata = fakeImporter({
      normalize: () => ({
        name: "Imported collection",
        variables: [{ name: "token", value: "abc", enabled: true }],
        children: [],
        environments: [],
        notConverted: [],
      }),
    });

    const report = await runImport(
      { format: "postman", content: "FAKE:x", root, targetPath: "", resolutions: [] },
      [importerWithRootMetadata],
    );

    expect(report.notConverted).toEqual([
      {
        path: "Imported collection",
        reason: "collection-level variables not applied when importing into an existing folder",
      },
    ]);
  });
});

describe("previewImport", () => {
  it("devolve a árvore normalizada sem gravar nada em disco (EP-08-T06)", async () => {
    const preview = previewImport({ format: "postman", content: "FAKE:users" }, [fakeImporter()]);

    expect(preview).toEqual({
      name: "Imported collection",
      children: [
        {
          kind: "folder",
          name: "Users",
          children: [{ kind: "request", name: "Get user", method: "GET" }],
        },
      ],
      environments: [{ name: "Production", variableCount: 1 }],
      notConverted: [
        { path: "Get user > preRequest script", reason: "pm.sendRequest sem equivalente" },
      ],
    });

    const entries = await fs.readdir(root).catch(() => []);
    expect(entries).toEqual([]);
  });

  it("formato sem importador registrado falha com erro claro", () => {
    expect(() =>
      previewImport({ format: "openapi", content: "whatever" }, [fakeImporter()]),
    ).toThrow(expect.objectContaining({ code: "IMPORT_FORMAT_UNRECOGNIZED" }));
  });
});
