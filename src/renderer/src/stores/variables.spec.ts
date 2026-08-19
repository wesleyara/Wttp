import type { AuthConfig, FolderNode, WorkspaceTree } from "@shared";

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEnvironmentStore } from "./environment";
import { useVariablesStore } from "./variables";
import { useWorkspaceStore } from "./workspace";

const ROOT = "/workspace";

type AuthLike = AuthConfig | undefined;

/** Mesma lógica de `resolveAuthChain` (main/http/authInheritance.ts) — a cadeia é o que este teste quer verificar, não o resolvedor em si (já coberto em `authInheritance.spec.ts`). */
const resolveAuthChain = vi.fn(async ({ chain }: { chain: AuthLike[] }) => {
  const index = chain.findIndex(auth => auth && auth.type !== "inherit");
  return index === -1
    ? { auth: { type: "none" } as AuthConfig, sourceIndex: null }
    : { auth: chain[index] as AuthConfig, sourceIndex: index };
});

function folder(
  path: string,
  name: string,
  auth: AuthConfig | undefined,
  children: FolderNode["children"] = [],
): FolderNode {
  return {
    kind: "folder",
    path,
    name,
    seq: 1,
    data: auth === undefined ? null : { wttp: 1, name, seq: 1, auth },
    children,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  resolveAuthChain.mockClear();
  vi.stubGlobal("window", {
    wttp: {
      variables: { resolveText: vi.fn(), resolveRequest: vi.fn(), resolveAuthChain },
    },
  });
});

describe("useVariablesStore — auth inheritance (EP-07-T01)", () => {
  it("monta a cadeia da request até a raiz da collection, pasta mais próxima primeiro", () => {
    const grandparent = folder("api", "api", { type: "bearer", bearer: { token: "root-token" } }, [
      folder("api/auth", "auth", { type: "inherit" }, []),
    ]);
    const parent = grandparent.children[0] as FolderNode;

    const tree: WorkspaceTree = {
      root: ROOT,
      data: { wttp: 1, name: "Test" },
      environments: [],
      children: [grandparent],
    };
    grandparent.children = [{ ...parent }];

    const workspace = useWorkspaceStore();
    workspace.tree = tree;

    const variables = useVariablesStore();
    const chain = variables.authChain("api/auth/login.req.yaml", { type: "inherit" });

    // [request, "api/auth" (inherit), "api" (bearer)]
    expect(chain).toEqual([{ type: "inherit" }, { type: "inherit" }, grandparent.data?.auth]);
  });

  it("resolve a herança efetiva com três níveis, retornando de onde ela veio", async () => {
    const bearer: AuthConfig = { type: "bearer", bearer: { token: "root-token" } };
    const grandparent = folder("api", "api", bearer, []);
    const parent = folder("api/auth", "auth", { type: "inherit" }, []);
    grandparent.children = [parent];

    const tree: WorkspaceTree = {
      root: ROOT,
      data: { wttp: 1, name: "Test" },
      environments: [],
      children: [grandparent],
    };

    const workspace = useWorkspaceStore();
    workspace.tree = tree;

    const variables = useVariablesStore();
    const { resolution, source } = await variables.resolveEffectiveAuth("api/auth/login.req.yaml", {
      type: "inherit",
    });

    expect(resolution.auth).toEqual(bearer);
    expect(source).toEqual({ kind: "folder", label: "api" });
  });

  it("none na request corta a herança mesmo com auth na collection", async () => {
    const grandparent = folder("api", "api", { type: "bearer", bearer: { token: "t" } }, []);
    const tree: WorkspaceTree = {
      root: ROOT,
      data: { wttp: 1, name: "Test" },
      environments: [],
      children: [grandparent],
    };

    const workspace = useWorkspaceStore();
    workspace.tree = tree;

    const variables = useVariablesStore();
    const { resolution, source } = await variables.resolveEffectiveAuth("api/login.req.yaml", {
      type: "none",
    });

    expect(resolution).toEqual({ auth: { type: "none" }, sourceIndex: 0 });
    expect(source).toEqual({ kind: "request", label: "This request" });
  });

  it("nenhuma auth em lugar nenhum resolve em none, sem erro", async () => {
    const workspace = useWorkspaceStore();
    workspace.tree = {
      root: ROOT,
      data: { wttp: 1, name: "Test" },
      environments: [],
      children: [],
    };

    const variables = useVariablesStore();
    const { resolution, source } = await variables.resolveEffectiveAuth("login.req.yaml", {
      type: "inherit",
    });

    expect(resolution).toEqual({ auth: { type: "none" }, sourceIndex: null });
    expect(source).toEqual({ kind: "none", label: "No auth configured" });
  });
});

describe("useVariablesStore — race entre carregar secrets e a primeira request", () => {
  it("resolveRequestSpec espera o keychain antes de montar o escopo, mesmo na primeira chamada após ativar o environment", async () => {
    let resolveSecret!: (value: string) => void;
    const secretGet = vi.fn(() => new Promise<string>(resolve => (resolveSecret = resolve)));
    const capturedScopes: { environment: unknown[] }[] = [];
    const resolveRequest = vi.fn(async (payload: { scope: { environment: unknown[] } }) => {
      capturedScopes.push(payload.scope);
      return { resolved: {}, unresolved: [] as string[] };
    });

    vi.stubGlobal("window", {
      wttp: {
        variables: { resolveText: vi.fn(), resolveRequest, resolveAuthChain },
        secret: { get: secretGet },
      },
    });

    const workspace = useWorkspaceStore();
    workspace.tree = {
      root: ROOT,
      data: { wttp: 1, name: "Test" },
      environments: [],
      children: [],
    };

    const environment = useEnvironmentStore();
    environment.items = [
      {
        path: "env.yaml",
        data: {
          wttp: 1,
          name: "Dev",
          variables: [{ name: "token", enabled: true, secret: true, value: "" }],
        },
      },
    ];
    // Ativar o environment dispara o `watch(..., { immediate: true })` de
    // `refreshSecrets` em `variables.ts` — é essa promise que a request precisa esperar.
    workspace.uiState.activeEnvironment = "env.yaml";

    const variables = useVariablesStore();

    const send = variables.resolveRequestSpec(
      {
        url: "{{token}}",
        headers: [],
        query: [],
        pathParams: [],
        auth: { type: "none" },
        body: { type: "none" },
      },
      "login.req.yaml",
    );

    // Ainda não resolveu o secret — `resolveRequest` não pode ter sido chamado com escopo vazio.
    expect(resolveRequest).not.toHaveBeenCalled();

    resolveSecret("real-token");
    await send;

    expect(capturedScopes).toHaveLength(1);
    expect(capturedScopes[0]?.environment).toEqual([
      { name: "token", enabled: true, secret: true, value: "real-token" },
    ]);
  });
});
