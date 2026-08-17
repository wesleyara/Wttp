import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `recentWorkspaces.ts` chama `appDataDir()`, que por sua vez chama `app.getPath` do
// Electron — fora do runtime do Electron isso não existe, então mockamos o módulo
// inteiro para devolver um diretório temporário real (mesmo padrão usado por
// `config/jsonFile.spec.ts`, só que sem poder injetar o diretório por parâmetro aqui).
let userDataDir: string;

vi.mock("electron", () => ({
  app: { getPath: () => userDataDir },
}));

const { listRecentWorkspacesWithStatus, removeRecentWorkspace, touchRecentWorkspace } =
  await import("./recentWorkspaces");

describe("recentWorkspaces", () => {
  let existingWorkspace: string;

  beforeEach(async () => {
    userDataDir = await fs.mkdtemp(join(tmpdir(), "wttp-userdata-"));
    existingWorkspace = await fs.mkdtemp(join(tmpdir(), "wttp-workspace-"));
  });

  afterEach(async () => {
    await fs.rm(userDataDir, { recursive: true, force: true });
    await fs.rm(existingWorkspace, { recursive: true, force: true });
  });

  it("marca missing: true para uma entrada cuja pasta foi removida do disco", async () => {
    const removedPath = join(tmpdir(), "wttp-does-not-exist-anymore");
    await touchRecentWorkspace(existingWorkspace, "Existing");
    await touchRecentWorkspace(removedPath, "Removed");

    const entries = await listRecentWorkspacesWithStatus();

    expect(entries.find(e => e.path === existingWorkspace)?.missing).toBe(false);
    expect(entries.find(e => e.path === removedPath)?.missing).toBe(true);
  });

  it("não some sozinha — a entrada continua na lista até removeRecentWorkspace", async () => {
    const removedPath = join(tmpdir(), "wttp-does-not-exist-either");
    await touchRecentWorkspace(removedPath, "Removed");

    const beforeRemoval = await listRecentWorkspacesWithStatus();
    expect(beforeRemoval.some(e => e.path === removedPath)).toBe(true);

    const afterRemoval = await removeRecentWorkspace(removedPath);
    expect(afterRemoval.some(e => e.path === removedPath)).toBe(false);
  });
});
