<script setup lang="ts">
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";

import { autocompletion } from "@codemirror/autocomplete";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin } from "@codemirror/view";
import { placeholder as placeholderExtension } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";
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
  }>(),
  {
    language: "text",
    readOnly: false,
    placeholder: undefined,
    debounceMs: 300,
    unresolvedVariables: () => [],
    variableTooltips: () => ({}),
    variableNames: () => [],
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const hostRef = useTemplateRef<HTMLDivElement>("host");
const view = shallowRef<EditorView>();

const languageCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const placeholderCompartment = new Compartment();
const variableHighlightCompartment = new Compartment();
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

function autocompleteExtension(names: string[]): Extension {
  return autocompletion({ override: [variableCompletionSource(names)] });
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
 * view nem reconfigurar o tema por evento.
 */
const editorTheme = EditorView.theme({
  "&": {
    color: "rgb(var(--w-text-1))",
    backgroundColor: "rgb(var(--w-surface-2))",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: "13px",
    caretColor: "rgb(var(--w-text-1))",
  },
  ".cm-gutters": {
    backgroundColor: "rgb(var(--w-surface-2))",
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
  // Realce de `{{var}}` (EP-06-T05) — resolvida em accent, não resolvida em status-4xx.
  ".wttp-var-resolved": { color: "rgb(var(--w-accent))" },
  ".wttp-var-unresolved": {
    color: "rgb(var(--w-status-4xx))",
    textDecoration: "underline wavy",
  },
});

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

onMounted(() => {
  if (!hostRef.value) return;

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      basicSetup,
      languageCompartment.of(languageExtension(props.language)),
      readOnlyCompartment.of(EditorState.readOnly.of(props.readOnly)),
      placeholderCompartment.of(props.placeholder ? placeholderExtension(props.placeholder) : []),
      variableHighlightCompartment.of(variableHighlightExtension(props.unresolvedVariables)),
      autocompleteCompartment.of(autocompleteExtension(props.variableNames)),
      editorTheme,
      syntaxTheme,
      EditorView.updateListener.of(update => {
        if (update.docChanged) scheduleEmit(update.state.doc.toString());
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
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: next } });
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
      effects: autocompleteCompartment.reconfigure(autocompleteExtension(names)),
    });
  },
);
</script>

<template>
  <div ref="host" class="size-full overflow-hidden rounded-md border border-subtle"></div>
</template>
