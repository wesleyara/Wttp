import type { AuthConfig, FolderNode, WorkspaceTree } from "@shared";

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
