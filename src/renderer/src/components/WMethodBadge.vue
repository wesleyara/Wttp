<script setup lang="ts">
import { methodToken } from "@renderer/lib/http-tokens";
import { computed } from "vue";

const props = defineProps<{
  method: string;
}>();

const tokenClass = computed(() => methodToken(props.method));
</script>

<template>
  <span class="font-mono text-[13px] font-medium uppercase" :class="tokenClass">
    {{ method }}
  </span>
</template>
