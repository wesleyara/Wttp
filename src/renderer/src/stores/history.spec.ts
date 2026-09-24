import type { HistoryEntry } from "@shared";

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useHistoryStore } from "./history";
import { useWorkspaceStore } from "./workspace";

const ROOT = "/workspace";

const list = vi.fn<(payload: { root: string; path: string }) => Promise<HistoryEntry[]>>(
  async () => [],
);
const clear = vi.fn(async () => {});

beforeEach(() => {
  setActivePinia(createPinia());
  list.mockClear();
  list.mockImplementation(async () => []);
  clear.mockClear();

  vi.stubGlobal("window", {
    wttp: {
      history: { list, clear, append: vi.fn() },
      workspace: { setUiState: vi.fn(async () => {}) },
    },
  });

  const workspace = useWorkspaceStore();
  workspace.tree = { root: ROOT, data: { wttp: 1, name: "Test" }, environments: [], children: [] };
});

describe("useHistoryStore", () => {
  it("loadFor busca o histórico da request e guarda o path atual", async () => {
    const entries: HistoryEntry[] = [
      {
        id: "1",
        at: "2026-01-01T00:00:00.000Z",
        request: {
          method: "GET",
          url: "https://example.com",
          query: [],
          headers: [],
          body: { type: "none" },
        },
        response: {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: [],
          charset: "utf-8",
          size: { headersSent: 0, bodySent: 0, headersReceived: 0, bodyReceived: 0 },
          timing: { dns: 0, connect: 0, tls: 0, ttfb: 0, download: 0, total: 0 },
          body: "{}",
          bodyTruncated: false,
        },
      },
    ];
    list.mockResolvedValueOnce(entries);

    const history = useHistoryStore();
    await history.loadFor("a.req.yaml");

    expect(list).toHaveBeenCalledWith({ root: ROOT, path: "a.req.yaml" });
    expect(history.entries).toEqual(entries);
    expect(history.path).toBe("a.req.yaml");
  });

  it("loadFor com path nulo esvazia sem chamar o IPC", async () => {
    const history = useHistoryStore();
    await history.loadFor("a.req.yaml");
    await history.loadFor(null);

    expect(history.entries).toEqual([]);
    expect(list).toHaveBeenCalledOnce();
  });

  it("clear apaga o histórico da request atual e esvazia local", async () => {
    const history = useHistoryStore();
    await history.loadFor("a.req.yaml");

    await history.clear();

    expect(clear).toHaveBeenCalledWith({ root: ROOT, path: "a.req.yaml" });
    expect(history.entries).toEqual([]);
  });

  it("clear sem request carregada é um no-op", async () => {
    const history = useHistoryStore();
    await history.clear();
    expect(clear).not.toHaveBeenCalled();
  });

  it("loadFor limpa entries na hora, antes do IPC resolver — nunca mostra a request errada por um instante", async () => {
    list.mockResolvedValueOnce([
      {
        id: "1",
        at: "2026-01-01T00:00:00.000Z",
        request: {
          method: "GET",
          url: "https://example.com/a",
          query: [],
          headers: [],
          body: { type: "none" },
        },
        response: {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: [],
          charset: "utf-8",
          size: { headersSent: 0, bodySent: 0, headersReceived: 0, bodyReceived: 0 },
          timing: { dns: 0, connect: 0, tls: 0, ttfb: 0, download: 0, total: 0 },
          body: "{}",
          bodyTruncated: false,
        },
      },
    ]);
    const history = useHistoryStore();
    await history.loadFor("a.req.yaml");
    expect(history.entries).toHaveLength(1);

    let entriesWhenListCalled: unknown;
    list.mockImplementationOnce(async () => {
      entriesWhenListCalled = history.entries;
      return [];
    });

    await history.loadFor("b.req.yaml");

    expect(entriesWhenListCalled).toEqual([]);
  });

  it("keeps the diff's ignored paths per request in ui-state, so they come back next session (#49)", async () => {
    const history = useHistoryStore();
    const workspace = useWorkspaceStore();
    await history.loadFor("a.req.yaml");

    history.addDiffIgnore("$.meta.timestamp");
    history.addDiffIgnore("header:Date");
    history.addDiffIgnore("$.meta.timestamp");
    expect(history.diffIgnores).toEqual(["$.meta.timestamp", "header:Date"]);
    expect(workspace.uiState.responseDiffIgnores).toEqual({
      "a.req.yaml": ["$.meta.timestamp", "header:Date"],
    });

    // Outra request tem a sua própria lista.
    await history.loadFor("b.req.yaml");
    expect(history.diffIgnores).toEqual([]);

    // "Próxima sessão": o ui-state lido do disco devolve a lista.
    workspace.uiState = { ...workspace.uiState };
    await history.loadFor("a.req.yaml");
    expect(history.diffIgnores).toEqual(["$.meta.timestamp", "header:Date"]);

    history.removeDiffIgnore("$.meta.timestamp");
    history.removeDiffIgnore("header:Date");
    expect(workspace.uiState.responseDiffIgnores).toEqual({});
  });
});
