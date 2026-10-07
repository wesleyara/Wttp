<script setup lang="ts">
import { readTerminalTheme } from "@renderer/lib/terminalTheme";
import { useSettingsStore } from "@renderer/stores/settings";
import "@xterm/xterm/css/xterm.css";
import { useTerminalPanelStore } from "@renderer/stores/terminalPanel";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from "vue";

/**
 * Uma sessão de terminal (xterm.js ligado a um pty do main). Fica montada enquanto a
 * aba existe — só escondida (`v-show` no pai) — para o scrollback sobreviver à troca de
 * aba e ao fechar/reabrir o painel.
 */
const props = defineProps<{ id: number; visible: boolean }>();

const panel = useTerminalPanelStore();
const settings = useSettingsStore();
const host = useTemplateRef<HTMLElement>("host");

/**
 * A JetBrains Mono não tem os ícones de Powerline/Nerd Font que o oh-my-zsh, p10k e afins
 * desenham (glifo de branch, setas…). O navegador cai por glifo para a próxima família da
 * lista: primeiro a Symbols Nerd Font Mono empacotada (`assets/symbols-nerd-font`), depois
 * as Nerd Fonts completas que o usuário tenha instaladas.
 */
const TERMINAL_FONT_FAMILY = [
  '"JetBrains Mono"',
  '"Symbols Nerd Font Mono"',
  '"JetBrainsMono Nerd Font Mono"',
  '"MesloLGS NF"',
  "ui-monospace",
  "monospace",
].join(", ");

const term = new Terminal({
  fontFamily: TERMINAL_FONT_FAMILY,
  fontSize: 13,
  cursorBlink: true,
  scrollback: 5000,
  theme: readTerminalTheme(),
});
const fit = new FitAddon();
term.loadAddon(fit);

let unregister: (() => void) | null = null;
let resizeObserver: ResizeObserver | null = null;

function refit(): void {
  if (!props.visible || !host.value || host.value.clientWidth === 0) return;
  fit.fit();
}

onMounted(async () => {
  // O xterm mede a célula na hora de abrir: com a JetBrains Mono ainda não carregada ele
  // mediria a fonte de fallback e deixaria o grid desalinhado.
  await Promise.all([
    document.fonts.load('400 13px "JetBrains Mono"'),
    document.fonts.load('700 13px "JetBrains Mono"'),
    document.fonts.load('400 13px "Symbols Nerd Font Mono"', "\ue0a0"),
  ]).catch(() => undefined);
  if (!host.value) return;
  term.open(host.value);
  // Ctrl+C com texto selecionado copia; sem seleção segue para o shell como SIGINT.
  // Ctrl+Shift+C/V são o copiar/colar de terminal no Linux/Windows.
  term.attachCustomKeyEventHandler(event => {
    if (event.type !== "keydown" || !event.ctrlKey || event.altKey) return true;
    const key = event.key.toLowerCase();
    if (key === "c" && (event.shiftKey || term.hasSelection())) {
      void navigator.clipboard.writeText(term.getSelection()).catch(() => undefined);
      return false;
    }
    return true;
  });
  unregister = panel.register(props.id, data => term.write(data));
  term.onData(data => panel.write(props.id, data));
  term.onResize(({ cols, rows }) => {
    void window.wttp.terminal.resize({ id: props.id, cols, rows }).catch(() => {});
  });
  resizeObserver = new ResizeObserver(refit);
  resizeObserver.observe(host.value);
  refit();
  if (props.visible) term.focus();
});

watch(
  () => props.visible,
  async visible => {
    if (!visible) return;
    await nextTick();
    refit();
    term.focus();
  },
);

// O xterm precisa de cor resolvida: relê os tokens quando o tema muda.
watch(
  () => settings.resolvedTheme,
  async () => {
    await nextTick();
    term.options.theme = readTerminalTheme();
  },
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  unregister?.();
  term.dispose();
});
</script>

<template>
  <div ref="host" class="size-full overflow-hidden bg-surface-2 px-2 pt-1"></div>
</template>
