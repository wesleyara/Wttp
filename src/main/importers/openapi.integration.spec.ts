import type { FolderNode, RequestFile, RequestNode, WorkspaceNode } from "@shared";

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readNode, scanWorkspace } from "../storage/tree";
import { detectImportFormat, runImport } from "./index";
import { openapiImporter } from "./openapi";

/**
 * Fixtures reais: as duas variantes públicas do "Swagger Petstore" citadas como exemplo
 * pelo próprio critério de aceite desta task.
 * - `petstore-3.0.4.json`: petstore3.swagger.io/api/v3/openapi.json — OpenAPI 3.0.4,
 *   JSON, 19 operações com `tags`, dois security schemes (`api_key`/apiKey e
 *   `petstore_auth`/oauth2), server com URL relativa ("/api/v3").
 * - `petstore-expanded-3.0.0.yaml`: OAI/OpenAPI-Specification, examples/v3.0 (MIT),
 *   OpenAPI 3.0.0, YAML, 4 operações **sem** `tags` (cobre o fallback de agrupamento
 *   pelo primeiro segmento do path) e schemas com `$ref` (`Pet`, `Error`).
 */
const jsonFixturePath = join(__dirname, "__fixtures__", "petstore-3.0.4.json");
const yamlFixturePath = join(__dirname, "__fixtures__", "petstore-expanded-3.0.0.yaml");

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "wttp-import-openapi-"));
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

describe("openapi registrado no pipeline de import por padrão", () => {
  it("import:detect reconhece a fixture JSON sem registro manual em teste", async () => {
    const content = await fs.readFile(jsonFixturePath, "utf-8");
    expect(detectImportFormat(content)).toBe("openapi");
  });

  it("import:detect reconhece a fixture YAML", async () => {
    const content = await fs.readFile(yamlFixturePath, "utf-8");
    expect(detectImportFormat(content)).toBe("openapi");
  });
});

describe("Petstore (JSON, com tags) importa com todos os endpoints", () => {
  it("cria as 19 operações agrupadas em pet/store/user", async () => {
    const content = await fs.readFile(jsonFixturePath, "utf-8");
    const report = await runImport({ format: "openapi", content, root, targetPath: "" });

    expect(report.createdRequests).toBe(19);

    const tree = await scanWorkspace(root);
    const rootFolder = tree.children[0] as FolderNode;
    expect(countRequests(rootFolder.children)).toBe(19);
    expect(rootFolder.children.map(child => child.name).sort()).toEqual(["pet", "store", "user"]);
  });

  it("cada servidor vira um environment (server com URL relativa incluso)", async () => {
    const content = await fs.readFile(jsonFixturePath, "utf-8");
    await runImport({ format: "openapi", content, root, targetPath: "" });

    const environmentFiles = await fs.readdir(join(root, "environments"));
    expect(environmentFiles).toHaveLength(1);
  });

  it("body gerado a partir do schema é JSON válido e coerente com os exemplos da spec", async () => {
    const content = await fs.readFile(jsonFixturePath, "utf-8");
    await runImport({ format: "openapi", content, root, targetPath: "" });

    const tree = await scanWorkspace(root);
    const rootFolder = tree.children[0] as FolderNode;
    const petGroup = findByName(rootFolder.children, "pet") as FolderNode;
    const addPet = findByName(petGroup.children, "Add a new pet to the store.") as
      RequestNode | undefined;
    expect(addPet).toBeDefined();

    const data = (await readNode(root, addPet!.path)).data as RequestFile;
    expect(data.body?.type).toBe("json");
    const body = JSON.parse((data.body as { json: string }).json);
    expect(body).toMatchObject({ id: 10, name: "doggie", status: "available" });
  });

  it("apiKey converte para auth efetiva; oauth2 sem equivalente entra no relatório", async () => {
    const content = await fs.readFile(jsonFixturePath, "utf-8");
    const report = await runImport({ format: "openapi", content, root, targetPath: "" });

    const tree = await scanWorkspace(root);
    const rootFolder = tree.children[0] as FolderNode;
    const storeGroup = findByName(rootFolder.children, "store") as FolderNode;
    const inventory = findByName(storeGroup.children, "Returns pet inventories by status.") as
      RequestNode | undefined;
    expect(inventory).toBeDefined();
    const data = (await readNode(root, inventory!.path)).data as RequestFile;
    expect(data.auth).toEqual({
      type: "apikey",
      apikey: { key: "api_key", value: "{{api_key}}", in: "header" },
    });

    expect(report.notConverted.some(item => item.reason.includes("petstore_auth"))).toBe(true);
  });
});

describe("Petstore expanded (YAML, sem tags) usa o fallback de agrupamento", () => {
  it("agrupa as 4 operações em uma única pasta pelo primeiro segmento do path", async () => {
    const content = await fs.readFile(yamlFixturePath, "utf-8");
    const report = await runImport({ format: "openapi", content, root, targetPath: "" });

    expect(report.createdRequests).toBe(4);
    expect(report.createdEnvironments).toBe(1);

    const tree = await scanWorkspace(root);
    const rootFolder = tree.children[0] as FolderNode;
    expect(rootFolder.children.map(child => child.name)).toEqual(["pets"]);
  });

  it("resolve $ref de components.schemas no body gerado", async () => {
    const content = await fs.readFile(yamlFixturePath, "utf-8");
    await runImport({ format: "openapi", content, root, targetPath: "" });

    const tree = await scanWorkspace(root);
    const rootFolder = tree.children[0] as FolderNode;
    const petsGroup = findByName(rootFolder.children, "pets") as FolderNode;
    const addPet = findByName(petsGroup.children, "addPet") as RequestNode | undefined;
    expect(addPet).toBeDefined();

    const data = (await readNode(root, addPet!.path)).data as RequestFile;
    expect(data.body?.type).toBe("json");
    expect(() => JSON.parse((data.body as { json: string }).json)).not.toThrow();
  });

  it("teste de snapshot sobre a árvore normalizada", async () => {
    const content = await fs.readFile(yamlFixturePath, "utf-8");
    expect(openapiImporter.normalize(openapiImporter.parse(content))).toMatchSnapshot();
  });
});
