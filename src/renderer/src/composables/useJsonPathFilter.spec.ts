import { useWorkspaceStore } from "@renderer/stores/workspace";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";

import { useJsonPathFilter } from "./useJsonPathFilter";

const BODY = JSON.stringify({ data: { items: [{ id: 1 }, { id: 2 }, { id: 3 }] } });

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("window", { wttp: { workspace: { setUiState: vi.fn(async () => {}) } } });
  const workspace = useWorkspaceStore();
  workspace.tree = { root: "/ws", data: { wttp: 1, name: "Test" }, environments: [], children: [] };
});

describe("useJsonPathFilter (ClickLocal #48)", () => {
  it("shows only the matches, as a JSON array, and counts them", async () => {
    const { expression, result } = useJsonPathFilter(ref("a.req.yaml"), ref(BODY), ref(true));
    expression.value = "$.data.items[?(@.id > 1)].id";
    await nextTick();
    expect(result.value).toEqual({ kind: "ok", text: "[\n  2,\n  3\n]", count: 2 });
  });

  it("reports a syntax error with its position and keeps the body untouched", () => {
    const body = ref(BODY);
    const { expression, result } = useJsonPathFilter(ref("a.req.yaml"), body, ref(true));
    expression.value = "$.data[";
    expect(result.value).toMatchObject({ kind: "syntaxError", position: 7 });
    expect(body.value).toBe(BODY);
  });

  it("says so when the body isn't valid JSON (e.g. truncated)", () => {
    const { expression, result } = useJsonPathFilter(
      ref("a.req.yaml"),
      ref('{"data": [1, 2'),
      ref(true),
    );
    expression.value = "$.data";
    expect(result.value).toEqual({ kind: "invalidJson" });
  });

  it("does nothing for a non-JSON body or an empty expression", () => {
    const enabled = ref(false);
    const { expression, result } = useJsonPathFilter(ref("a.req.yaml"), ref(BODY), enabled);
    expression.value = "$.data";
    expect(result.value).toEqual({ kind: "none" });
    enabled.value = true;
    expression.value = "   ";
    expect(result.value).toEqual({ kind: "none" });
  });

  it("remembers the last filter per request in the workspace ui-state", async () => {
    const workspace = useWorkspaceStore();
    const path = ref("a.req.yaml");
    const { expression } = useJsonPathFilter(path, ref(BODY), ref(true));

    expression.value = "$.data.items[0]";
    await nextTick();
    expect(workspace.uiState.responseFilters).toEqual({ "a.req.yaml": "$.data.items[0]" });

    path.value = "b.req.yaml";
    await nextTick();
    expect(expression.value).toBe("");

    path.value = "a.req.yaml";
    await nextTick();
    expect(expression.value).toBe("$.data.items[0]");

    expression.value = "";
    await nextTick();
    expect(workspace.uiState.responseFilters).toEqual({});
  });

  it("picks the stored filter up once ui-state.json is loaded from disk", async () => {
    const workspace = useWorkspaceStore();
    const { expression } = useJsonPathFilter(ref("a.req.yaml"), ref(BODY), ref(true));
    expect(expression.value).toBe("");

    workspace.uiState = { ...workspace.uiState, responseFilters: { "a.req.yaml": "$..id" } };
    workspace.uiStateVersion += 1;
    await nextTick();
    expect(expression.value).toBe("$..id");
  });
});
