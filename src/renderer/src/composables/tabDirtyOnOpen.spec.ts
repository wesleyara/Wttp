import type { RequestFile, RequestNode } from "@shared";

import { useRequestStore } from "@renderer/stores/request";
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { createPinia, setActivePinia } from "pinia";
import { storeToRefs } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAutoContentType } from "./useAutoContentType";
import { useUrlQuerySync } from "./useUrlQuerySync";

/**
 * Reproduz, sem montar DOM, exatamente o que `RequestUrlBar`/`RequestConfigTabs` fazem
 * com a fachada de `useRequestStore` — os dois compõem `useUrlQuerySync`/
 * `useAutoContentType` sobre os refs da aba ativa. O bug relatado (abrir ou trocar de
 * aba já mostra "mudanças não salvas") vinha desses watchers escrevendo de volta
 * incondicionalmente sempre que a aba ativa trocava, mesmo sem edição nenhuma do
 * usuário.
 */
function wireComponentWatchers(): void {
  const store = useRequestStore();
  const { url, query, pathParams, headers, body } = storeToRefs(store);
  useUrlQuerySync(url, query, pathParams);
  useAutoContentType(body, headers);
}

const ROOT = "/workspace";

// Formato exatamente como vem do disco (docs/file-format.md): campos default (aqui,
// `description` vazio) somem do YAML — só reaparecem como `""` quando o código em
// memória os reconstrói. Query já embutida na URL, Content-Type já correto no header,
// path param já com valor — nada aqui deveria mudar ao só abrir a aba.
function jsonRequestFile(name: string): RequestFile {
  return {
    wttp: 1,
    name,
    seq: 1,
    method: "POST",
    url: "{{base_url}}/auth/login/:id?verbose=true",
    pathParams: [{ name: "id", value: "{{user_id}}", enabled: true }],
    query: [{ name: "verbose", value: "true", enabled: true }],
    headers: [{ name: "Content-Type", value: "application/json", enabled: true }],
    body: { type: "json", json: "{}" },
  };
}

function plainGetRequestFile(name: string): RequestFile {
  return { wttp: 1, name, seq: 1, method: "GET", url: "{{base_url}}/posts" };
}

function requestNode(path: string, data: RequestFile): RequestNode {
  return { kind: "request", path, name: data.name, seq: 1, data };
}

const files: Record<string, RequestFile> = {};
const nodeRead = vi.fn(async ({ path }: { path: string }) => requestNode(path, files[path]));
const nodeWrite = vi.fn(async () => {});
const setUiState = vi.fn(async () => {});

beforeEach(() => {
  setActivePinia(createPinia());
  nodeRead.mockClear();
  nodeWrite.mockClear();
  setUiState.mockClear();

  files["json.req.yaml"] = jsonRequestFile("json");
  files["plain.req.yaml"] = plainGetRequestFile("plain");

  vi.stubGlobal("window", {
    wttp: {
      node: { read: nodeRead, write: nodeWrite },
      workspace: { setUiState, getUiState: vi.fn(), rescan: vi.fn() },
      http: { send: vi.fn(), cancel: vi.fn() },
      dialog: { saveFile: vi.fn() },
      env: { list: vi.fn(async () => []) },
      secret: { get: vi.fn(async () => null) },
      variables: {
        resolveText: vi.fn(async () => ({ value: "", unresolved: [], used: [] })),
        resolveRequest: vi.fn(),
      },
    },
  });

  const workspace = useWorkspaceStore();
  workspace.tree = { root: ROOT, data: { wttp: 1, name: "Test" }, environments: [], children: [] };
});

describe("abrir/trocar de aba não marca suja (regressão)", () => {
  it("abrir uma única aba com query/pathParams/content-type já salvos não marca suja", async () => {
    wireComponentWatchers();
    const tabs = useRequestTabsStore();

    await tabs.openPinned("json.req.yaml");

    expect(tabs.active?.dirty).toBe(false);
  });

  it("abrir uma segunda aba não marca a primeira nem a nova como suja", async () => {
    wireComponentWatchers();
    const tabs = useRequestTabsStore();

    await tabs.openPinned("json.req.yaml");
    expect(tabs.active?.dirty).toBe(false);

    await tabs.openPinned("plain.req.yaml");
    expect(tabs.active?.dirty).toBe(false);
    expect(tabs.tabs.find(t => t.path === "json.req.yaml")?.dirty).toBe(false);
  });

  it("alternar entre as duas abas repetidamente nunca marca nenhuma suja", async () => {
    wireComponentWatchers();
    const tabs = useRequestTabsStore();

    await tabs.openPinned("json.req.yaml");
    await tabs.openPinned("plain.req.yaml");

    for (let i = 0; i < 4; i++) {
      tabs.activate("json.req.yaml");
      tabs.activate("plain.req.yaml");
    }

    expect(tabs.tabs.every(t => !t.dirty)).toBe(true);
  });

  it("uma query param desabilitada sobrevive a trocar de aba e voltar (regressão)", async () => {
    files["json.req.yaml"] = {
      ...jsonRequestFile("json"),
      query: [
        { name: "verbose", value: "true", enabled: true },
        { name: "off", value: "x", enabled: false },
      ],
    };

    wireComponentWatchers();
    const tabs = useRequestTabsStore();

    await tabs.openPinned("json.req.yaml");
    await tabs.openPinned("plain.req.yaml");
    tabs.activate("json.req.yaml");

    const jsonTab = tabs.tabs.find(t => t.path === "json.req.yaml" && t.kind === "request");
    expect(jsonTab?.kind === "request" ? jsonTab.query : undefined).toEqual([
      { name: "verbose", value: "true", enabled: true },
      { name: "off", value: "x", enabled: false },
    ]);
  });
});
