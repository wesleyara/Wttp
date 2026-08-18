<script setup lang="ts">
import type { ImportPreviewNode } from "@shared";

import WIcon from "@renderer/components/WIcon.vue";
import WMethodBadge from "@renderer/components/WMethodBadge.vue";

defineProps<{
  nodes: ImportPreviewNode[];
}>();
</script>

<template>
  <ul class="flex flex-col gap-0.5">
    <li v-for="(node, index) in nodes" :key="`${node.kind}-${node.name}-${index}`">
      <div class="flex items-center gap-1.5 py-0.5 font-inter text-sm text-1">
        <WIcon v-if="node.kind === 'folder'" name="folder" size="3.5" class="shrink-0 text-faint" />
        <WMethodBadge v-else :method="node.method ?? '?'" class="w-10 shrink-0 text-[11px]" />
        <span class="truncate">{{ node.name }}</span>
      </div>
      <div
        v-if="node.children && node.children.length > 0"
        class="ml-4 border-l border-subtle pl-2"
      >
        <ImportPreviewTree :nodes="node.children" />
      </div>
    </li>
  </ul>
</template>
