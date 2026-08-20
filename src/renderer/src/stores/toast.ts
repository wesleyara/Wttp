import { defineStore } from "pinia";
import { ref } from "vue";

export type ToastVariant = "success" | "info" | "warning" | "error";

/** Botão opcional dentro de um toast (EP-11-T03) — ex. "Update now" numa notificação de update baixado, que precisa ficar visível até o usuário decidir, não sumir sozinha. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

const DEFAULT_DURATION_MS = 3000;

/**
 * Fila de toasts (EP-06.1-T06) — feedback de save/create/delete que hoje é ad hoc
 * (banner inline ou nenhum). Um único store global, um único `WToast` montado no
 * `AppShell`; qualquer store/componente chama `push` sem se preocupar com posição ou
 * empilhamento.
 */
export const useToastStore = defineStore("toast", () => {
  const items = ref<ToastItem[]>([]);

  function dismiss(id: string): void {
    items.value = items.value.filter(item => item.id !== id);
  }

  /**
   * `action` (EP-11-T03) — presente, o toast fica até o usuário agir (clicar no botão
   * ou no X): auto-dismiss não faz sentido para uma decisão como "update now"/"later",
   * ao contrário do feedback informativo comum (save/create/delete).
   */
  function push(
    message: string,
    variant: ToastVariant = "info",
    durationMs = DEFAULT_DURATION_MS,
    action?: ToastAction,
  ): void {
    const id = crypto.randomUUID();
    items.value.push({ id, message, variant, action });
    if (!action) setTimeout(() => dismiss(id), durationMs);
  }

  return { items, push, dismiss };
});
