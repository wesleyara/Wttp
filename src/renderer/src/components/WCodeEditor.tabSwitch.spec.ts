// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";

import WCodeEditor from "./WCodeEditor.vue";

/**
 * Monta `WCodeEditor` de verdade (CodeMirror incluso) para reproduzir um caminho que
 * `useUrlQuerySync`/`useAutoContentType` (lógica pura, sem DOM) não conseguem cobrir:
 * trocar a `modelValue` de fora (como acontece ao trocar de aba — `RequestUrlBar`/
 * `RequestConfigTabs` são singletons reaproveitados por todas as abas) reprograma o
 * conteúdo do CodeMirror via `editor.dispatch`. Se esse dispatch contar como
 * "mudança do documento" para o `updateListener`, ele reemite `update:modelValue` de
 * volta — e caindo no setter de `useRequestStore` (sem guarda de igualdade), isso
 * marcaria a aba como suja mesmo sem edição nenhuma do usuário.
 */
describe("WCodeEditor — troca de modelValue externa (troca de aba)", () => {
  it("não reemite update:modelValue quando o valor muda de fora, só reflete no editor", async () => {
    const modelValue = ref("https://a.example.com/first");
    const emitted: string[] = [];

    const Host = defineComponent({
      setup() {
        return () =>
          h(WCodeEditor, {
            modelValue: modelValue.value,
            singleLine: true,
            debounceMs: 0,
            "onUpdate:modelValue": (value: string) => emitted.push(value),
          });
      },
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(Host);
    app.mount(container);

    await nextTick();

    // Simula a troca de aba: o valor muda por fora, não por digitação do usuário.
    modelValue.value = "https://b.example.com/second";
    await nextTick();
    // O `updateListener` do CodeMirror despacha o `scheduleEmit` de forma assíncrona
    // (mesmo com debounceMs: 0, é um `setTimeout`) — dá tempo dele rodar se for o caso.
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(emitted).toEqual([]);

    app.unmount();
    container.remove();
  });
});
