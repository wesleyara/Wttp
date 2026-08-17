import type { FolderNode, RequestNode } from "@shared";

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeFileAtomic } from "./fsAtomic";
import { resolveWorkspacePath } from "./paths";
import { slugify, uniqueSlugName } from "./slug";
import { deleteNode, initWorkspace, moveNode, readNode, scanWorkspace, writeNode } from "./tree";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "wttp-workspace-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function writeYaml(relPath: string, contents: string): Promise<void> {
  const absPath = join(root, relPath);
  await fs.mkdir(join(absPath, ".."), { recursive: true });
  await fs.writeFile(absPath, contents, "utf-8");
}

const workspaceYaml = "wttp: 1\nname: My API\n";

const requestYaml = (name: string, seq: number): string =>
  `wttp: 1\nname: ${name}\nseq: ${seq}\nmethod: GET\nurl: "{{base_url}}/${name}"\n`;

const folderYaml = (name: string, seq: number): string => `wttp: 1\nname: ${name}\nseq: ${seq}\n`;

describe("scanWorkspace", () => {
  it("monta a árvore recursiva, ordenada por seq", async () => {
    await writeYaml("wttp.yaml", workspaceYaml);
    await writeYaml("users/folder.yaml", folderYaml("Users", 2));
    await writeYaml("users/list-users.req.yaml", requestYaml("List users", 2));
    await writeYaml("users/admin/folder.yaml", folderYaml("Admin", 1));
    await writeYaml("auth/folder.yaml", folderYaml("Auth", 1));
    await writeYaml("auth/login.req.yaml", requestYaml("Login", 2));
    await writeYaml("auth/refresh-token.req.yaml", requestYaml("Refresh token", 1));

    const tree = await scanWorkspace(root);

    expect(tree.data?.name).toBe("My API");
    expect(tree.children.map(node => node.name)).toEqual(["Auth", "Users"]);

    const auth = tree.children[0] as FolderNode;
    expect(auth.children.map(node => node.name)).toEqual(["Refresh token", "Login"]);

    const users = tree.children[1] as FolderNode;
    expect(users.children.map(node => node.name)).toEqual(["Admin", "List users"]);
  });

  it("ignora .wttp/ e environments/ como filhos da árvore", async () => {
    await writeYaml("wttp.yaml", workspaceYaml);
    await writeYaml("environments/dev.yaml", "wttp: 1\nname: dev\n");
    await fs.mkdir(join(root, ".wttp"), { recursive: true });
    await fs.writeFile(join(root, ".wttp", "secrets.json"), "{}", "utf-8");

    const tree = await scanWorkspace(root);

    expect(tree.children).toEqual([]);
    expect(tree.environments).toHaveLength(1);
    expect(tree.environments[0].name).toBe("dev");
  });

  it("marca um nó inválido sem derrubar o resto da árvore", async () => {
    await writeYaml("wttp.yaml", workspaceYaml);
    await writeYaml("broken.req.yaml", "wttp: 1\nname: Broken\nseq: 1\nmethod: GETT\nurl: /x\n");
    await writeYaml("ok.req.yaml", requestYaml("Ok", 2));

    const tree = await scanWorkspace(root);
    const broken = tree.children.find(node => node.path === "broken.req.yaml") as RequestNode;
    const ok = tree.children.find(node => node.path === "ok.req.yaml") as RequestNode;

    expect(broken.data).toBeNull();
    expect(broken.issues?.[0].message).toContain("method");
    expect(ok.data?.name).toBe("Ok");
  });

  it("workspace com 500 requests carrega em menos de 1s", async () => {
    await writeYaml("wttp.yaml", workspaceYaml);
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 500; i++) {
      writes.push(writeYaml(`req-${i}.req.yaml`, requestYaml(`Request ${i}`, i)));
    }
    await Promise.all(writes);

    const start = performance.now();
    const tree = await scanWorkspace(root);
    const elapsed = performance.now() - start;

    expect(tree.children).toHaveLength(500);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe("readNode / writeNode", () => {
  it("lê e regrava uma request preservando o conteúdo", async () => {
    await writeYaml("wttp.yaml", workspaceYaml);
    await writeYaml("login.req.yaml", requestYaml("Login", 1));

    const node = (await readNode(root, "login.req.yaml")) as RequestNode;
    expect(node.data?.name).toBe("Login");

    await writeNode(root, "login.req.yaml", node);
    const raw = await fs.readFile(join(root, "login.req.yaml"), "utf-8");
    expect(raw).toContain("name: Login");
  });

  it("grava atomicamente: nunca deixa o destino num estado parcial", async () => {
    await writeYaml("wttp.yaml", workspaceYaml);
    const target = join(root, "atomic.req.yaml");
    await fs.writeFile(target, "original", "utf-8");

    await writeFileAtomic(target, "conteúdo completo novo");

    const entries = await fs.readdir(root);
    expect(entries.some(name => name.includes(".tmp-"))).toBe(false);
    expect(await fs.readFile(target, "utf-8")).toBe("conteúdo completo novo");
  });

  it("preserva o arquivo original se a escrita falhar antes do rename", async () => {
    const target = join(root, "keep.req.yaml");
    await fs.writeFile(target, "valor original", "utf-8");

    const originalWriteFile = fs.writeFile;
    const spy = (): Promise<void> => Promise.reject(new Error("disk full"));
    Object.assign(fs, { writeFile: spy });
    try {
      await expect(writeFileAtomic(target, "valor novo")).rejects.toThrow("disk full");
    } finally {
      Object.assign(fs, { writeFile: originalWriteFile });
    }

    expect(await fs.readFile(target, "utf-8")).toBe("valor original");
  });

  it("recusa sobrescrever um arquivo alterado externamente depois da leitura", async () => {
    await writeYaml("wttp.yaml", workspaceYaml);
    await writeYaml("login.req.yaml", requestYaml("Login", 1));

    const node = (await readNode(root, "login.req.yaml")) as RequestNode;

    // Simula um `git checkout`/editor externo mexendo no arquivo depois da leitura.
    await writeYaml("login.req.yaml", requestYaml("Login externo", 1));
    const target = join(root, "login.req.yaml");
    const stat = await fs.stat(target);
    await fs.utimes(target, stat.atime, new Date(stat.mtimeMs + 60_000));

    await expect(writeNode(root, "login.req.yaml", node)).rejects.toThrow(/changed on disk/);
    expect(await fs.readFile(target, "utf-8")).toContain("Login externo");
  });

  it("permite escrever um nó que nunca foi lido antes (criação)", async () => {
    await writeYaml("wttp.yaml", workspaceYaml);
    const node: RequestNode = {
      kind: "request",
      path: "new.req.yaml",
      name: "New",
      seq: 1,
      data: { wttp: 1, name: "New", seq: 1, method: "GET", url: "https://example.com" },
    };

    await writeNode(root, "new.req.yaml", node);
    expect(await fs.readFile(join(root, "new.req.yaml"), "utf-8")).toContain("name: New");
  });
});

describe("moveNode", () => {
  it("reordena só os irmãos entre a posição antiga e a nova", async () => {
    await writeYaml("wttp.yaml", workspaceYaml);
    await writeYaml("a.req.yaml", requestYaml("A", 1));
    await writeYaml("b.req.yaml", requestYaml("B", 2));
    await writeYaml("c.req.yaml", requestYaml("C", 3));
    await writeYaml("d.req.yaml", requestYaml("D", 4));

    // Move "D" (seq 4) para a posição 2 — só B e C (entre a posição antiga e a nova)
    // deveriam ganhar um novo seq; A não deveria ser regravado.
    const aBefore = await fs.readFile(join(root, "a.req.yaml"), "utf-8");

    await moveNode(root, "d.req.yaml", "d.req.yaml", 2);

    const tree = await scanWorkspace(root);
    expect(tree.children.map(node => node.name)).toEqual(["A", "D", "B", "C"]);

    const aAfter = await fs.readFile(join(root, "a.req.yaml"), "utf-8");
    expect(aAfter).toBe(aBefore);
  });

  it("move entre pastas e fecha o buraco na origem", async () => {
    await writeYaml("wttp.yaml", workspaceYaml);
    await writeYaml("auth/folder.yaml", folderYaml("Auth", 1));
    await writeYaml("auth/login.req.yaml", requestYaml("Login", 1));
    await writeYaml("auth/logout.req.yaml", requestYaml("Logout", 2));
    await writeYaml("users/folder.yaml", folderYaml("Users", 2));
    await writeYaml("users/list.req.yaml", requestYaml("List", 1));

    await moveNode(root, "auth/login.req.yaml", "users/login.req.yaml", 1);

    const tree = await scanWorkspace(root);
    const auth = tree.children.find(node => node.name === "Auth") as FolderNode;
    const users = tree.children.find(node => node.name === "Users") as FolderNode;

    expect(auth.children.map(node => node.name)).toEqual(["Logout"]);
    expect((auth.children[0] as RequestNode).data?.seq).toBe(1);
    expect(users.children.map(node => node.name)).toEqual(["Login", "List"]);
  });
});

describe("deleteNode", () => {
  it("remove um arquivo de request", async () => {
    await writeYaml("wttp.yaml", workspaceYaml);
    await writeYaml("login.req.yaml", requestYaml("Login", 1));

    await deleteNode(root, "login.req.yaml");

    await expect(fs.access(join(root, "login.req.yaml"))).rejects.toThrow();
  });

  it("remove uma pasta e tudo dentro dela", async () => {
    await writeYaml("wttp.yaml", workspaceYaml);
    await writeYaml("auth/folder.yaml", folderYaml("Auth", 1));
    await writeYaml("auth/login.req.yaml", requestYaml("Login", 1));

    await deleteNode(root, "auth");

    await expect(fs.access(join(root, "auth"))).rejects.toThrow();
  });
});

describe("initWorkspace", () => {
  it("cria wttp.yaml, environments/ e .gitignore com .wttp/", async () => {
    const tree = await initWorkspace(root, "My API");

    expect(tree.data?.name).toBe("My API");
    const gitignore = await fs.readFile(join(root, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".wttp/");
    await expect(fs.access(join(root, "environments"))).resolves.toBeUndefined();
  });
});

describe("resolveWorkspacePath", () => {
  it("resolve um caminho dentro da raiz", () => {
    expect(resolveWorkspacePath(root, "fixtures/avatar.png")).toBe(
      join(root, "fixtures", "avatar.png"),
    );
  });

  it("recusa um caminho que escapa da raiz com ../", () => {
    expect(() => resolveWorkspacePath(root, "../../etc/passwd")).toThrow(/escapes/);
  });

  it("recusa um caminho absoluto fora da raiz", () => {
    expect(() => resolveWorkspacePath(root, "/etc/passwd")).toThrow(/escapes/);
  });
});

describe("slug", () => {
  it("gera um slug legível a partir do nome", () => {
    expect(slugify("Login de usuário")).toBe("login-de-usuario");
    expect(slugify("   ")).toBe("untitled");
  });

  it("resolve colisão com sufixo numérico", () => {
    const existing = new Set(["login.req.yaml"]);
    const first = uniqueSlugName("Login", ".req.yaml", name => existing.has(name));
    existing.add(first);
    const second = uniqueSlugName("Login", ".req.yaml", name => existing.has(name));

    expect(first).toBe("login-2.req.yaml");
    expect(second).toBe("login-3.req.yaml");
  });
});
