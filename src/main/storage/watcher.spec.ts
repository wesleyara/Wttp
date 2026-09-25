import type { WorkspaceChangedEvent } from "@shared";

import { EventEmitter } from "node:events";
import { promises as fs, watch as watchFs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeFileAtomic } from "./fsAtomic";
import { watchWorkspace, type WorkspaceWatcher } from "./watcher";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, watch: vi.fn(actual.watch) };
});

let root: string;
let watcher: WorkspaceWatcher | null;

/**
 * No macOS, `fs.watch` usa FSEvents, que entrega eventos com atraso: a criação da pasta
 * temporária e do `wttp.yaml` logo acima ainda chegam a um watcher ligado milissegundos
 * depois, e os testes de "não emite evento" falhavam no CI (`macos-latest`) com
 * `changedPaths: ["wttp-watcher-XXXX", "wttp.yaml"]`. Esperar esses eventos do setup
 * assentarem antes de cada teste ligar o watcher; Linux (inotify) e Windows não têm esse
 * atraso, então não pagam a espera.
 */
const FS_EVENTS_SETTLE_MS = process.platform === "darwin" ? 500 : 0;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "wttp-watcher-"));
  await fs.writeFile(join(root, "wttp.yaml"), "wttp: 1\nname: My API\n", "utf-8");
  if (FS_EVENTS_SETTLE_MS > 0)
    await new Promise(resolve => setTimeout(resolve, FS_EVENTS_SETTLE_MS));
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

  it("reporta erro assíncrono do FSWatcher via onError em vez de lançar", async () => {
    const fakeFsWatcher = new EventEmitter() as unknown as ReturnType<typeof watchFs>;
    fakeFsWatcher.close = vi.fn();
    vi.mocked(watchFs).mockReturnValueOnce(fakeFsWatcher);

    const onChange = vi.fn<(event: WorkspaceChangedEvent) => void>();
    const onError = vi.fn<(error: Error) => void>();
    watcher = watchWorkspace(root, onChange, onError);

    const enospc = Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
    expect(() => (fakeFsWatcher as unknown as EventEmitter).emit("error", enospc)).not.toThrow();

    expect(onError).toHaveBeenCalledWith(enospc);
    expect(fakeFsWatcher.close).toHaveBeenCalled();
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
