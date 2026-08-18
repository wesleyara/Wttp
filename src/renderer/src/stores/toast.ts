import { defineStore } from "pinia";
import { ref } from "vue";

export type ToastVariant = "success" | "info" | "warning" | "error";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
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

  function push(
    message: string,
    variant: ToastVariant = "info",
    durationMs = DEFAULT_DURATION_MS,
  ): void {
    const id = crypto.randomUUID();
    items.value.push({ id, message, variant });
    setTimeout(() => dismiss(id), durationMs);
  }

  return { items, push, dismiss };
});
