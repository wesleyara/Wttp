<script setup lang="ts">
import type { Extension } from "@codemirror/state";

import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, placeholder as placeholderExtension } from "@codemirror/view";
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
  }>(),
  {
    language: "text",
    readOnly: false,
    placeholder: undefined,
    debounceMs: 300,
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
</script>

<template>
  <div ref="host" class="size-full overflow-hidden rounded-md border border-subtle"></div>
</template>
