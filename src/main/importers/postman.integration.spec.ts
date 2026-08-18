import type { FolderNode, RequestFile, RequestNode, WorkspaceNode } from "@shared";

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readNode, scanWorkspace } from "../storage/tree";
import { detectImportFormat, runImport } from "./index";
import { postmanImporter } from "./postman";

/**
 * Fixture real: export do Postman da "Auth0 Management API" collection
 * (github.com/auth0/postman-collections, schema v2.1.0), 69 requests em 17 pastas —
 * satisfaz o critério de aceite "collection real com mais de 50 requests importa com a
 * hierarquia preservada" sem depender de acesso à aplicação desktop do Postman neste
 * ambiente (headless, sem conta Postman configurável).
 */
const fixturePath = join(__dirname, "__fixtures__", "auth0-management-api.postman_collection.json");

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "wttp-import-postman-"));
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

describe("postman registrado no pipeline de import por padrão", () => {
  it("import:detect reconhece a fixture pelo schema, sem registro manual em teste", async () => {
    const content = await fs.readFile(fixturePath, "utf-8");
    expect(detectImportFormat(content)).toBe("postman");
  });
});

describe("collection real com mais de 50 requests", () => {
  it("importa com a hierarquia preservada", async () => {
    const content = await fs.readFile(fixturePath, "utf-8");
    const report = await runImport({ format: "postman", content, root, targetPath: "" });

    expect(report.createdRequests).toBeGreaterThan(50);
    expect(report.createdRequests).toBe(69);
    expect(report.createdFolders).toBe(18); // pasta raiz "Auth0 Management API" + 17 subpastas
    expect(report.createdEnvironments).toBe(0);

    const tree = await scanWorkspace(root);
    const rootFolder = tree.children[0] as FolderNode;
    expect(rootFolder.kind).toBe("folder");
    expect(rootFolder.name).toBe("Auth0 Management API");
    expect(countRequests(rootFolder.children)).toBe(69);

    const clientsFolder = findByName(rootFolder.children, "Clients") as FolderNode | undefined;
    expect(clientsFolder?.kind).toBe("folder");
    expect(clientsFolder?.children.some(child => child.name === "Get a client")).toBe(true);
  });

  it("preserva path params extraídos de :id na URL", async () => {
    const content = await fs.readFile(fixturePath, "utf-8");
    await runImport({ format: "postman", content, root, targetPath: "" });

    const tree = await scanWorkspace(root);
    const rootFolder = tree.children[0] as FolderNode;
    const request = findByName(rootFolder.children, "Delete a client") as RequestNode | undefined;
    expect(request).toBeDefined();

    const data = (await readNode(root, request!.path)).data as RequestFile;
    expect(data.url).toBe("https://{{auth0_domain}}/api/v2/clients/:id");
    expect(data.pathParams).toEqual([{ name: "id", value: "", enabled: true }]);
    expect(data.headers).toEqual([
      { name: "Authorization", value: "Bearer {{auth0_token}}", enabled: true },
    ]);
  });

  it("normaliza para a mesma árvore de sempre (snapshot)", async () => {
    const content = await fs.readFile(fixturePath, "utf-8");
    const parsed = postmanImporter.parse(content);
    expect(postmanImporter.normalize(parsed)).toMatchSnapshot();
  });
});
