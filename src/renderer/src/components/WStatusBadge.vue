<script setup lang="ts">
import { statusToken } from "@renderer/lib/http-tokens";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  code: number | null;
}>();

const { t } = useI18n();
const tokenClass = computed(() => statusToken(props.code));
const label = computed(() => (props.code === null ? t("response.errorBadge") : String(props.code)));
</script>

<template>
  <span class="font-mono text-[13px] font-medium" :class="tokenClass">
    {{ label }}
  </span>
</template>
