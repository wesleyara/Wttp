<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }>(),
  {
    variant: "secondary",
    size: "md",
    disabled: false,
    type: "button",
  },
);

const variantClasses: Record<NonNullable<typeof props.variant>, string> = {
  primary: "bg-accent text-surface-1 hover:bg-accent-hover active:bg-accent-hover",
  secondary: "bg-surface-3 text-1 border border-subtle hover:border-strong active:bg-surface-2",
  ghost: "bg-transparent text-1 hover:bg-surface-3 active:bg-surface-3",
  danger: "bg-transparent text-status-5xx hover:bg-surface-3 active:bg-surface-3",
};

const sizeClasses: Record<NonNullable<typeof props.size>, string> = {
  sm: "h-7 px-2 text-xs",
  md: "h-8 px-3 text-sm",
};

const classes = computed(() => [
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-inter font-medium transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
  "disabled:pointer-events-none disabled:opacity-50",
  variantClasses[props.variant],
  sizeClasses[props.size],
]);
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classes">
    <slot name="prefix" />
    <slot />
    <slot name="suffix" />
  </button>
</template>
