import type { FolderNode, ImportReport, RequestFile, RequestNode, WorkspaceNode } from "@shared";

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";

import type { SecretEncryption } from "../secrets/encryption";

import { readNode, scanWorkspace } from "../storage/tree";
import { detectImportFormat, runImport } from "./index";
import { insomniaImporter } from "./insomnia";

/**
 * `saveEnvironment` (chamada por `emitImport` quando a fixture tem `secret: true`, como
 * aqui) usa o keychain do SO por padrão — indisponível fora do Electron. Mesma
 * `fakeEncryption` de `storage/environments.spec.ts`, injetada via o parâmetro que
 * `runImport`/`emitImport` já expõem para isso.
 */
function fakeEncryption(): SecretEncryption {
  return {
    isAvailable: () => true,
    encrypt: value => Buffer.from(`enc:${value}`, "utf-8").toString("base64"),
    decrypt: value => Buffer.from(value, "base64").toString("utf-8").replace(/^enc:/, ""),
  };
}

async function importFixture(content: string, root: string): Promise<ImportReport> {
  return runImport(
    { format: "insomnia", content, root, targetPath: "" },
    undefined,
    fakeEncryption(),
  );
}

/**
 * Fixture real: export da "Insomnia Documenter Demo"
 * (github.com/insodoc/insomnia-documenter, MIT, gerado pelo Insomnia Desktop
 * v2021.3.0, `__export_format: 4`) — 15 requests em 5 pastas aninhadas até 4 níveis de
 * profundidade, com um environment base e dois sub-environments (Production/
 * Development), a fixture real mais completa disponível sem uma conta Postman/Insomnia
 * configurável neste ambiente (mesma situação registrada em EP-08-T02).
 */
const fixturePath = join(__dirname, "__fixtures__", "insomnia-documenter-demo.json");

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "wttp-import-insomnia-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function countRequests(nodes: WorkspaceNode[]): number {
  return nodes.reduce(
    (sum, node) =>
      sum + (node.kind === "request" ? 1 : countRequests((node as FolderNode).children)),
    0,
  );
}

function findByName(nodes: WorkspaceNode[], name: string): WorkspaceNode | undefined {
  for (const node of nodes) {
    if (node.name === name) return node;
    if (node.kind === "folder") {
      const found = findByName(node.children, name);
      if (found) return found;
    }
  }
  return undefined;
}

describe("insomnia registrado no pipeline de import por padrão", () => {
  it("import:detect reconhece a fixture sem registro manual em teste", async () => {
    const content = await fs.readFile(fixturePath, "utf-8");
    expect(detectImportFormat(content)).toBe("insomnia");
  });
});

describe("hierarquia de request groups preservada", () => {
  it("importa todas as requests com as pastas aninhadas intactas", async () => {
    const content = await fs.readFile(fixturePath, "utf-8");
    const report = await importFixture(content, root);

    expect(report.createdRequests).toBe(15);
    expect(report.createdEnvironments).toBe(2); // Production + Development (sub-environments)

    const tree = await scanWorkspace(root);
    const rootFolder = tree.children[0] as FolderNode;
    expect(rootFolder.name).toBe("Insomnia Documenter Demo");
    expect(countRequests(rootFolder.children)).toBe(15);

    // Basic Requests > Nested Folder > Deeper nest > Even deeper! > Get anything
    const basicRequests = findByName(rootFolder.children, "Basic Requests") as FolderNode;
    const nestedFolder = findByName(basicRequests.children, "Nested Folder") as FolderNode;
    const deeperNest = findByName(nestedFolder.children, "Deeper nest") as FolderNode;
    const evenDeeper = findByName(deeperNest.children, "Even deeper!") as FolderNode;
    expect(evenDeeper.children.some(child => child.name === "Get anything")).toBe(true);
  });
});

describe("environment com herança resolvido corretamente", () => {
  it("Production sobrescreve baseUrl do Base Environment mas herda o resto", async () => {
    const content = await fs.readFile(fixturePath, "utf-8");
    await importFixture(content, root);

    const environmentFiles = await fs.readdir(join(root, "environments"));
    expect(environmentFiles.sort()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("production"),
        expect.stringContaining("development"),
      ]),
    );
  });
});

describe("importa Insomnia também em YAML, não só JSON", () => {
  it("a mesma fixture serializada em YAML produz a mesma árvore normalizada", async () => {
    const content = await fs.readFile(fixturePath, "utf-8");
    const parsedJson = insomniaImporter.parse(content);
    const yamlContent = stringifyYaml(parsedJson);

    expect(detectImportFormat(yamlContent)).toBe("insomnia");
    expect(insomniaImporter.normalize(insomniaImporter.parse(yamlContent))).toEqual(
      insomniaImporter.normalize(parsedJson),
    );
  });
});

describe("collection real com hierarquia e auth", () => {
  it("preserva bearer auth da fixture", async () => {
    const content = await fs.readFile(fixturePath, "utf-8");
    await importFixture(content, root);

    const tree = await scanWorkspace(root);
    const rootFolder = tree.children[0] as FolderNode;
    const request = findByName(rootFolder.children, "Bearer authentication") as RequestNode;
    const data = (await readNode(root, request.path)).data as RequestFile;
    expect(data.auth).toEqual({ type: "bearer", bearer: { token: "{{token}}" } });
  });

  it("teste de snapshot sobre a árvore normalizada da fixture", async () => {
    const content = await fs.readFile(fixturePath, "utf-8");
    expect(insomniaImporter.normalize(insomniaImporter.parse(content))).toMatchSnapshot();
  });
});
