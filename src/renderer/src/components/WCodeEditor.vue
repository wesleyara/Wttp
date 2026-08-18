<script setup lang="ts">
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";
import type { ScriptPhase } from "@shared";

import { autocompletion, completionKeymap, completionStatus } from "@codemirror/autocomplete";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { type Diagnostic, linter, lintGutter } from "@codemirror/lint";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap, ViewPlugin } from "@codemirror/view";
import { placeholder as placeholderExtension } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { scriptApiCompletionSource } from "@renderer/lib/scriptCompletions";
import { basicSetup, minimalSetup } from "codemirror";
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from "vue";

type WCodeEditorLanguage = "json" | "javascript" | "xml" | "html" | "text";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    language?: WCodeEditorLanguage;
    readOnly?: boolean;
    placeholder?: string;
    /** Debounce, em ms, para `update:modelValue` — não emite a cada tecla. */
    debounceMs?: number;
    /** Nomes de `{{var}}` presentes no texto que não puderam ser resolvidos (EP-06-T05) — realçados em `status-4xx`, o resto em `accent`. */
    unresolvedVariables?: string[];
    /** `nome → texto do tooltip` (origem/valor, ou só origem se secreta) — vira `title` no span decorado. */
    variableTooltips?: Record<string, string>;
    /** Nomes oferecidos no autocomplete ao digitar `{{` (EP-06-T05). */
    variableNames?: string[];
    /** Uma linha só, sem gutter — URL bar e campos de valor de tabela (EP-06.1). `Enter` nunca insere quebra de linha; em vez disso emite `enter`. */
    singleLine?: boolean;
    /** Sem borda/fundo/cantos próprios — usado dentro de uma linha de tabela que já tem os dela (EP-06.1). Só combina com `singleLine`. */
    bare?: boolean;
    /** Realça segmentos `:nome` (path params) — só a URL bar usa isso (EP-06.1). */
    highlightPathParams?: boolean;
    /** Nomes de path param sem valor — ficam em vermelho em vez da cor padrão (EP-06.1). */
    emptyPathParams?: string[];
    /** Autocomplete de `wttp`/`req`/`res`/`test`/`expect` (EP-09-T04) — só a aba Scripts usa isso, uma fase por editor. */
    scriptPhase?: ScriptPhase;
    /** Quebra linhas longas em vez de rolar horizontalmente — usado no preview de body da resposta. */
    lineWrap?: boolean;
  }>(),
  {
    language: "text",
    readOnly: false,
    placeholder: undefined,
    debounceMs: 300,
    unresolvedVariables: () => [],
    variableTooltips: () => ({}),
    variableNames: () => [],
    singleLine: false,
    bare: false,
    highlightPathParams: false,
    emptyPathParams: () => [],
    scriptPhase: undefined,
    lineWrap: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  enter: [];
}>();

const hostRef = useTemplateRef<HTMLDivElement>("host");
const view = shallowRef<EditorView>();

const languageCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const placeholderCompartment = new Compartment();
const variableHighlightCompartment = new Compartment();
const pathParamHighlightCompartment = new Compartment();
const autocompleteCompartment = new Compartment();

/** `\{{nome}}` escapado (docs/file-format.md §8) nunca é decorado como variável — mesmo padrão de `main/http/resolver.ts`. */
const VARIABLE_PATTERN = /(\\)?\{\{\s*([^{}]+?)\s*\}\}/g;

function buildVariableDecorations(doc: string, unresolvedNames: Set<string>): DecorationSet {
  const ranges: ReturnType<typeof Decoration.prototype.range>[] = [];
  VARIABLE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = VARIABLE_PATTERN.exec(doc))) {
    if (match[1]) continue;
    const name = match[2].trim();
    const title = props.variableTooltips[name];
    ranges.push(
      Decoration.mark({
        class: unresolvedNames.has(name) ? "wttp-var-unresolved" : "wttp-var-resolved",
        attributes: title ? { title } : undefined,
      }).range(match.index, match.index + match[0].length),
    );
  }
  return Decoration.set(ranges);
}

/** `:nome` — mesmo padrão de `url-path-params-sync.ts`/`main/http/resolver.ts`. Só a URL bar liga isso. */
const PATH_PARAM_PATTERN = /:([A-Za-z_][A-Za-z0-9_]*)/g;

function buildPathParamDecorations(doc: string, emptyNames: Set<string>): DecorationSet {
  const ranges: ReturnType<typeof Decoration.prototype.range>[] = [];
  PATH_PARAM_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATH_PARAM_PATTERN.exec(doc))) {
    ranges.push(
      Decoration.mark({
        class: emptyNames.has(match[1]) ? "wttp-path-param-empty" : "wttp-path-param",
      }).range(match.index, match.index + match[0].length),
    );
  }
  return Decoration.set(ranges);
}

function pathParamHighlightExtension(emptyNames: string[]): Extension {
  const emptySet = new Set(emptyNames);
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(editorView: EditorView) {
        this.decorations = buildPathParamDecorations(editorView.state.doc.toString(), emptySet);
      }
      update(update: ViewUpdate): void {
        if (update.docChanged) {
          this.decorations = buildPathParamDecorations(update.state.doc.toString(), emptySet);
        }
      }
    },
    { decorations: pluginInstance => pluginInstance.decorations },
  );
}

function variableHighlightExtension(unresolvedNames: string[]): Extension {
  const unresolvedSet = new Set(unresolvedNames);
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(editorView: EditorView) {
        this.decorations = buildVariableDecorations(editorView.state.doc.toString(), unresolvedSet);
      }
      update(update: ViewUpdate): void {
        if (update.docChanged) {
          this.decorations = buildVariableDecorations(update.state.doc.toString(), unresolvedSet);
        }
      }
    },
    { decorations: pluginInstance => pluginInstance.decorations },
  );
}

/** Sugere nomes de variável ao digitar `{{` (EP-06-T05) — não interfere com o autocomplete de linguagem, que continua ativo para o resto do documento. */
function variableCompletionSource(names: string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(/\{\{\s*[\w$]*/);
    if (!before) return null;

    const typedLength = before.text.replace(/^\{\{\s*/, "").length;
    return {
      from: before.to - typedLength,
      options: names.map(name => ({ label: name, type: "variable" })),
      validFor: /^[\w$]*$/,
    };
  };
}

function autocompleteExtension(names: string[], scriptPhase?: ScriptPhase): Extension {
  const sources = [variableCompletionSource(names)];
  if (scriptPhase) sources.push(scriptApiCompletionSource(scriptPhase));
  return autocompletion({ override: sources });
}

/** Sinaliza erro de sintaxe antes do envio (EP-09-T04) — nós de erro da árvore do lezer, sem precisar de um linter JS completo. */
function jsSyntaxLintExtension(): Extension {
  return [
    linter(view => {
      const diagnostics: Diagnostic[] = [];
      syntaxTree(view.state)
        .cursor()
        .iterate(node => {
          if (node.type.isError) {
            diagnostics.push({
              from: node.from,
              to: Math.max(node.to, node.from + 1),
              severity: "error",
              message: "Syntax error",
            });
          }
        });
      return diagnostics;
    }),
    lintGutter(),
  ];
}

function languageExtension(language: WCodeEditorLanguage): Extension {
  switch (language) {
    case "json":
      return json();
    case "javascript":
      return javascript();
    case "xml":
      return xml();
    case "html":
      return html();
    case "text":
      return [];
  }
}

/**
 * Cores por `rgb(var(--w-x))`, nunca resolvidas em JS: o toggle dark/light troca o
 * valor da custom property no CSS, e o CodeMirror repinta sozinho — sem recriar a
 * view nem reconfigurar o tema por evento. `bare` entra direto aqui (não como um
 * segundo `EditorView.theme()` por cima) — dois temas com regra para o mesmo seletor
 * (`&`) disputam a cascata, o que deixava o fundo branco vazando mesmo com `bare` ativo.
 */
function buildEditorTheme(bare: boolean): Extension {
  const background = bare ? "transparent" : "rgb(var(--w-surface-2))";
  return EditorView.theme({
    "&": {
      color: "rgb(var(--w-text-1))",
      backgroundColor: background,
      height: "100%",
      cursor: "text",
    },
    ".cm-content": {
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: "13px",
      caretColor: "rgb(var(--w-text-1))",
      // CodeMirror não define isso no próprio baseTheme — sem ele, o cursor do mouse
      // fica seta em vez de texto, e parece que o campo não é clicável (EP-06.1).
      cursor: "text",
    },
    ".cm-gutters": {
      backgroundColor: background,
      color: "rgb(var(--w-text-faint))",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "rgb(var(--w-surface-3) / 0.5)" },
    ".cm-activeLineGutter": { backgroundColor: "rgb(var(--w-surface-3) / 0.5)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgb(var(--w-accent) / 0.25) !important",
    },
    ".cm-cursor": { borderLeftColor: "rgb(var(--w-text-1))" },
    "&.cm-focused": { outline: "none" },
    ".cm-searchMatch": { backgroundColor: "rgb(var(--w-accent) / 0.2)" },
    ".cm-foldPlaceholder": {
      backgroundColor: "rgb(var(--w-surface-3))",
      color: "rgb(var(--w-text-muted))",
      border: "none",
    },
    // O placeholder do CodeMirror é `pointer-events: none` por padrão — o cursor de
    // texto só aparece de verdade se essa regra existir aqui também (EP-06.1).
    ".cm-placeholder": { cursor: "text" },
    // Realce de `{{var}}` (EP-06-T05) — resolvida em accent, não resolvida em status-4xx.
    ".wttp-var-resolved": { color: "rgb(var(--w-accent))" },
    ".wttp-var-unresolved": {
      color: "rgb(var(--w-status-4xx))",
      textDecoration: "underline wavy",
    },
    // Realce de `:pathParam` (EP-06.1) — cor própria quando tem valor, vermelho igual
    // a `{{var}}` não resolvida quando o path param ainda não tem valor.
    ".wttp-path-param": {
      color: "rgb(var(--w-method-patch))",
      textDecoration: "underline dotted",
    },
    ".wttp-path-param-empty": {
      color: "rgb(var(--w-status-4xx))",
      textDecoration: "underline wavy",
    },
  });
}

/** Container vira uma "linha de input": sem gutter, sem quebra, altura fixa (EP-06.1). */
const singleLineTheme = EditorView.theme({
  "&": { height: "2rem" },
  ".cm-scroller": { overflow: "hidden" },
  ".cm-content": { padding: "7px 0" },
  ".cm-line": { padding: 0 },
});

/** `Enter` nunca quebra linha; qualquer mudança que resultasse em mais de uma linha (colar texto multilinha, por exemplo) é descartada. */
const singleLineGuard = EditorState.transactionFilter.of(tr => (tr.newDoc.lines > 1 ? [] : tr));

function singleLineExtensions(): Extension[] {
  return [
    minimalSetup,
    keymap.of(completionKeymap),
    Prec.highest(
      keymap.of([
        {
          key: "Enter",
          run: view => {
            // Autocomplete aberto: deixa o `completionKeymap` aceitar a sugestão
            // selecionada — só interceptamos `Enter` quando não há nada pra aceitar.
            if (completionStatus(view.state) === "active") return false;
            emit("enter");
            return true;
          },
        },
      ]),
    ),
    singleLineGuard,
    singleLineTheme,
  ];
}

const syntaxTheme = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.comment, color: "rgb(var(--w-text-faint))" },
    { tag: tags.string, color: "rgb(var(--w-status-2xx))" },
    { tag: [tags.number, tags.bool, tags.null], color: "rgb(var(--w-method-patch))" },
    { tag: [tags.keyword, tags.controlKeyword], color: "rgb(var(--w-accent))" },
    { tag: [tags.propertyName, tags.attributeName], color: "rgb(var(--w-method-get))" },
    { tag: tags.tagName, color: "rgb(var(--w-method-post))" },
    { tag: tags.invalid, color: "rgb(var(--w-status-5xx))" },
  ]),
);

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleEmit(value: string): void {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => emit("update:modelValue", value), props.debounceMs);
}

/**
 * `true` só durante o `dispatch` que reflete uma `modelValue` mudada de fora (troca de
 * aba, por exemplo — o mesmo editor é reaproveitado por todas as abas). Sem isso, o
 * `updateListener` não distingue essa reprogramação de uma tecla real: `docChanged`
 * fica `true` nos dois casos, e reemitir `update:modelValue` de volta cai no setter da
 * store sem edição nenhuma do usuário, marcando a aba suja só de abrir/trocar.
 */
let applyingExternalValue = false;

onMounted(() => {
  if (!hostRef.value) return;

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      props.singleLine ? singleLineExtensions() : basicSetup,
      languageCompartment.of(languageExtension(props.language)),
      readOnlyCompartment.of(EditorState.readOnly.of(props.readOnly)),
      placeholderCompartment.of(props.placeholder ? placeholderExtension(props.placeholder) : []),
      variableHighlightCompartment.of(variableHighlightExtension(props.unresolvedVariables)),
      autocompleteCompartment.of(autocompleteExtension(props.variableNames, props.scriptPhase)),
      pathParamHighlightCompartment.of(
        props.highlightPathParams ? pathParamHighlightExtension(props.emptyPathParams) : [],
      ),
      props.scriptPhase ? jsSyntaxLintExtension() : [],
      props.lineWrap ? EditorView.lineWrapping : [],
      buildEditorTheme(props.bare),
      syntaxTheme,
      EditorView.updateListener.of(update => {
        if (update.docChanged && !applyingExternalValue) scheduleEmit(update.state.doc.toString());
      }),
    ],
  });

  view.value = new EditorView({ state, parent: hostRef.value });
});

onBeforeUnmount(() => {
  clearTimeout(debounceTimer);
  view.value?.destroy();
});

watch(
  () => props.modelValue,
  next => {
    const editor = view.value;
    if (!editor || next === editor.state.doc.toString()) return;
    applyingExternalValue = true;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: next } });
    applyingExternalValue = false;
  },
);

watch(
  () => props.language,
  next => {
    view.value?.dispatch({ effects: languageCompartment.reconfigure(languageExtension(next)) });
  },
);

watch(
  () => props.readOnly,
  next => {
    view.value?.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(next)),
    });
  },
);

watch(
  () => props.placeholder,
  next => {
    view.value?.dispatch({
      effects: placeholderCompartment.reconfigure(next ? placeholderExtension(next) : []),
    });
  },
);

watch([() => props.unresolvedVariables, () => props.variableTooltips], ([unresolvedVariables]) => {
  view.value?.dispatch({
    effects: variableHighlightCompartment.reconfigure(
      variableHighlightExtension(unresolvedVariables),
    ),
  });
});

watch(
  () => props.variableNames,
  names => {
    view.value?.dispatch({
      effects: autocompleteCompartment.reconfigure(autocompleteExtension(names, props.scriptPhase)),
    });
  },
);

watch(
  () => props.emptyPathParams,
  names => {
    if (!props.highlightPathParams) return;
    view.value?.dispatch({
      effects: pathParamHighlightCompartment.reconfigure(pathParamHighlightExtension(names)),
    });
  },
);
</script>

<template>
  <div
    ref="host"
    class="overflow-hidden"
    :class="[singleLine ? 'w-full' : 'size-full', bare ? '' : 'rounded-md border border-subtle']"
  ></div>
</template>
