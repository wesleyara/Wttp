<script setup lang="ts">
import { useAppStore } from "@renderer/stores/app";
import { useSettingsStore } from "@renderer/stores/settings";
import { onMounted } from "vue";

const settings = useSettingsStore();
const appStore = useAppStore();

onMounted(() => {
  void appStore.ping();
});
</script>

<template>
  <div class="flex h-screen flex-col items-center justify-center gap-2 bg-bluewood-950 p-4">
    <p class="font-barlow text-lg font-semibold text-brand-blue-500">{{ settings.appName }}</p>
    <p v-if="appStore.info" class="font-mono text-sm text-bluewood-200">
      {{ appStore.info.version }} — {{ appStore.info.platform }}
    </p>
    <p v-else-if="appStore.error" class="font-inter text-sm text-bluewood-300">
      {{ appStore.error.message }}
    </p>
  </div>
</template>
