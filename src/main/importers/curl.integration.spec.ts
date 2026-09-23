import type { RequestFile } from "@shared";

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readNode, scanWorkspace } from "../storage/tree";
import { curlImporter } from "./curl";
import { detectImportFormat, runImport } from "./index";

/**
 * Fixture real: exemplo "Get a repository" da própria documentação REST da GitHub
 * (docs.github.com/en/rest/repos/repos, aba cURL) — satisfaz "fixture real por
 * formato com teste de snapshot" (arch-docs/conventions.md §Testes) sem depender de acesso
 * de rede a uma API de verdade neste ambiente.
 */
const fixturePath = join(__dirname, "__fixtures__", "github-get-repo.curl.txt");

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "wttp-import-curl-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("cURL registrado no pipeline de import por padrão", () => {
  it("import:detect reconhece um comando cURL sem precisar de registro manual em teste", () => {
    expect(detectImportFormat("curl https://api.example.com/users")).toBe("curl");
  });

  it("import:run grava a request via storage/tree, sem o formato saber disso", async () => {
    const report = await runImport({
      format: "curl",
      content: "curl -X POST https://api.example.com/users -d 'a=1'",
      root,
      targetPath: "",
    });

    expect(report.createdRequests).toBe(1);

    const tree = await scanWorkspace(root);
    const rootFolder = tree.children[0];
    expect(rootFolder.kind).toBe("folder");
    const requestNode = rootFolder.kind === "folder" ? rootFolder.children[0] : undefined;
    expect(requestNode).toBeDefined();

    const read = await readNode(root, requestNode!.path);
    expect((read.data as RequestFile).url).toBe("https://api.example.com/users");
    expect((read.data as RequestFile).method).toBe("POST");
  });
});

describe("comando real copiado da documentação da GitHub REST API", () => {
  it("import:detect reconhece a fixture, sem registro manual em teste", async () => {
    const content = await fs.readFile(fixturePath, "utf-8");
    expect(detectImportFormat(content)).toBe("curl");
  });

  it("importa método, URL, headers e auth corretamente", async () => {
    const content = await fs.readFile(fixturePath, "utf-8");
    const report = await runImport({ format: "curl", content, root, targetPath: "" });

    expect(report.createdRequests).toBe(1);

    const tree = await scanWorkspace(root);
    const rootFolder = tree.children[0];
    expect(rootFolder.kind).toBe("folder");
    const requestNode = rootFolder.kind === "folder" ? rootFolder.children[0] : undefined;
    expect(requestNode).toBeDefined();

    const data = (await readNode(root, requestNode!.path)).data as RequestFile;
    expect(data.method).toBe("GET");
    expect(data.url).toBe("https://api.github.com/repos/octocat/hello-world");
    expect(data.headers).toEqual([
      { name: "Accept", value: "application/vnd.github+json", enabled: true },
      { name: "Authorization", value: "Bearer YOUR-TOKEN", enabled: true },
      { name: "X-GitHub-Api-Version", value: "2022-11-28", enabled: true },
    ]);
  });

  it("normaliza para a mesma árvore de sempre (snapshot)", async () => {
    const content = await fs.readFile(fixturePath, "utf-8");
    const parsed = curlImporter.parse(content);
    expect(curlImporter.normalize(parsed)).toMatchSnapshot();
  });
});
