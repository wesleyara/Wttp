<script setup lang="ts">
import type { ToastVariant } from "@renderer/stores/toast";

import { useToastStore } from "@renderer/stores/toast";

import WIcon from "./WIcon.vue";

const toast = useToastStore();

const VARIANT_ICON: Record<ToastVariant, string> = {
  success: "circle-check",
  info: "info",
  warning: "triangle-alert",
  error: "circle-x",
};

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: "text-status-2xx",
  info: "text-1",
  warning: "text-status-4xx",
  error: "text-status-5xx",
};
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      <TransitionGroup
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 translate-y-2"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0 translate-y-2"
      >
        <div
          v-for="item in toast.items"
          :key="item.id"
          class="pointer-events-auto flex items-start gap-2 rounded-md border border-subtle bg-surface-2 p-2.5 shadow-lg"
        >
          <WIcon :name="VARIANT_ICON[item.variant]" size="4" :class="VARIANT_CLASS[item.variant]" />
          <div class="flex-1">
            <p class="font-inter text-sm text-1">{{ item.message }}</p>
            <button
              v-if="item.action"
              type="button"
              class="mt-1 font-inter text-xs font-medium text-accent hover:underline"
              @click="
                () => {
                  item.action?.onClick();
                  toast.dismiss(item.id);
                }
              "
            >
              {{ item.action.label }}
            </button>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            class="flex size-5 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1"
            @click="toast.dismiss(item.id)"
          >
            <WIcon name="x" size="3" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
