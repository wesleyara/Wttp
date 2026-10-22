// @vitest-environment jsdom
import type { CompletionSource } from "@codemirror/autocomplete";

import { CompletionContext } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, shallowRef } from "vue";

import WCodeEditor from "./WCodeEditor.vue";

// `cm6-graphql` roda externalizado pelo Node, que carrega o `graphql` CommonJS; o schema
// precisa vir da mesma cópia, senão o `instanceof` interno do graphql rejeita ("another realm").
const { buildSchema } = createRequire(import.meta.url)("graphql") as typeof import("graphql");

const schema = buildSchema("type Query { hello(name: String): String  helium: Int }");
const otherSchema = buildSchema("type Query { zebra: Int }");

async function labelsAt(view: EditorView): Promise<string[]> {
  const pos = view.state.doc.length;
  const labels: string[] = [];
  for (const source of view.state.languageDataAt<CompletionSource>("autocomplete", pos)) {
    const result = await source(new CompletionContext(view.state, pos, true));
    labels.push(...(result?.options.map(option => option.label) ?? []));
  }
  return labels;
}

describe("WCodeEditor — graphql", () => {
  it("oferece campos do schema e acompanha a troca de schema", async () => {
    const current = shallowRef<typeof schema | null>(null);
    const Host = defineComponent({
      setup() {
        return () =>
          h(WCodeEditor, {
            modelValue: "{ he",
            language: "graphql",
            graphqlSchema: current.value,
          });
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(Host);
    app.mount(container);
    await nextTick();
    const view = EditorView.findFromDOM(container)!;

    expect(await labelsAt(view)).not.toContain("hello");

    current.value = schema;
    await nextTick();
    expect(await labelsAt(view)).toEqual(expect.arrayContaining(["hello", "helium"]));

    // Segundo schema (refresh): não pode ficar preso ao primeiro.
    current.value = otherSchema;
    await nextTick();
    const labels = await labelsAt(view);
    expect(labels).not.toContain("hello");

    app.unmount();
  });
});
