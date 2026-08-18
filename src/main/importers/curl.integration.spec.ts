import type { RequestFile } from "@shared";

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readNode, scanWorkspace } from "../storage/tree";
import { detectImportFormat, runImport } from "./index";

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
