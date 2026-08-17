<script setup lang="ts">
import { statusToken } from "@renderer/lib/http-tokens";
import { computed } from "vue";

const props = defineProps<{
  code: number | null;
}>();

const tokenClass = computed(() => statusToken(props.code));
const label = computed(() => (props.code === null ? "error" : String(props.code)));
</script>

<template>
  <span class="font-mono text-[13px] font-medium" :class="tokenClass">
    {{ label }}
  </span>
</template>
