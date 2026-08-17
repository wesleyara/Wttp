import type { WorkspaceChangedEvent } from "@shared";

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeFileAtomic } from "./fsAtomic";
import { watchWorkspace, type WorkspaceWatcher } from "./watcher";

let root: string;
let watcher: WorkspaceWatcher | null;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "wttp-watcher-"));
  await fs.writeFile(join(root, "wttp.yaml"), "wttp: 1\nname: My API\n", "utf-8");
  watcher = null;
});

afterEach(async () => {
  watcher?.close();
  await fs.rm(root, { recursive: true, force: true });
});

/** Espera até `onChange` disparar ou o timeout vencer — evita apostar num delay fixo. */
async function waitForChange(spy: ReturnType<typeof vi.fn>): Promise<void> {
  const deadline = Date.now() + 2000;
  while (spy.mock.calls.length === 0 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

describe("watchWorkspace", () => {
  it("reconcilia e emite a árvore quando um arquivo muda fora do app", async () => {
    const onChange = vi.fn<(event: WorkspaceChangedEvent) => void>();
    watcher = watchWorkspace(root, onChange);

    await fs.writeFile(
      join(root, "external.req.yaml"),
      "wttp: 1\nname: External\nseq: 1\nmethod: GET\nurl: https://x\n",
      "utf-8",
    );

    await waitForChange(onChange);

    expect(onChange).toHaveBeenCalledTimes(1);
    const event = onChange.mock.calls[0][0];
    expect(event.changedPaths).toContain("external.req.yaml");
    expect(event.tree.children.map(node => node.name)).toContain("External");
  });

  it("não emite evento para uma escrita feita pelo próprio app", async () => {
    const onChange = vi.fn<(event: WorkspaceChangedEvent) => void>();
    watcher = watchWorkspace(root, onChange);

    await writeFileAtomic(
      join(root, "own.req.yaml"),
      "wttp: 1\nname: Own\nseq: 1\nmethod: GET\nurl: https://x\n",
    );

    // Dá tempo do watcher processar o evento de fs, se algum chegar — não deve.
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignora mudanças dentro de .wttp/", async () => {
    const onChange = vi.fn<(event: WorkspaceChangedEvent) => void>();
    watcher = watchWorkspace(root, onChange);

    await fs.mkdir(join(root, ".wttp"), { recursive: true });
    await fs.writeFile(join(root, ".wttp", "ui-state.json"), "{}", "utf-8");

    await new Promise(resolve => setTimeout(resolve, 500));
    expect(onChange).not.toHaveBeenCalled();
  });
});
