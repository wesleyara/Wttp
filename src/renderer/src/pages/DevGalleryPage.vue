<script setup lang="ts">
import WButton from "@renderer/components/WButton.vue";
import WEmptyState from "@renderer/components/WEmptyState.vue";
import WInput from "@renderer/components/WInput.vue";
import WKeyValueTable, { type KeyValueRow } from "@renderer/components/WKeyValueTable.vue";
import WMethodBadge from "@renderer/components/WMethodBadge.vue";
import WSelect from "@renderer/components/WSelect.vue";
import WStatusBadge from "@renderer/components/WStatusBadge.vue";
import WTabs from "@renderer/components/WTabs.vue";
import { onMounted, ref } from "vue";

// Só existe em dev (ver router.ts) — vitrine dos componentes W* nos dois temas,
// lado a lado, para revisão visual antes de qualquer tela de produto (EP-02-T03).
//
// Alterna a classe `dark` direto, sem passar pelo `useSettingsStore`: a resolução real
// de tema (persistência, `system`) é do EP-02-T05, e a galeria não deve depender dela.
const isDark = ref(true);

onMounted(() => document.documentElement.classList.toggle("dark", isDark.value));

function toggleTheme(): void {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle("dark", isDark.value);
}

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "TRACE"];
const statuses = [200, 301, 404, 500, null];

const activeTab = ref("params");
const tabs = [
  { value: "params", label: "Params" },
  { value: "headers", label: "Headers" },
  { value: "body", label: "Body" },
  { value: "auth", label: "Auth" },
];

const selectValue = ref("get");
const methodOptions = [
  { value: "get", label: "GET" },
  { value: "post", label: "POST" },
];

const inputValue = ref("");
const kvRows = ref<KeyValueRow[]>([
  { enabled: true, name: "Content-Type", value: "application/json", description: "" },
]);
</script>

<template>
  <div class="flex h-screen flex-col overflow-y-auto bg-surface-1 p-8">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="font-barlow text-lg font-semibold text-1">Component gallery</h1>
      <WButton size="sm" @click="toggleTheme">
        Toggle theme ({{ isDark ? "dark" : "light" }})
      </WButton>
    </div>

    <section class="mb-8 flex flex-col gap-3">
      <h2 class="font-inter text-xs font-medium uppercase text-faint">WButton</h2>
      <div class="flex flex-wrap items-center gap-2">
        <WButton variant="primary">Primary</WButton>
        <WButton variant="secondary">Secondary</WButton>
        <WButton variant="ghost">Ghost</WButton>
        <WButton variant="danger">Danger</WButton>
        <WButton variant="primary" size="sm">Small</WButton>
        <WButton variant="primary" disabled>Disabled</WButton>
      </div>
    </section>

    <section class="mb-8 flex flex-col gap-3">
      <h2 class="font-inter text-xs font-medium uppercase text-faint">WInput / WSelect</h2>
      <div class="flex max-w-md flex-col gap-2">
        <WInput v-model="inputValue" placeholder="https://api.example.com" />
        <WInput v-model="inputValue" placeholder="Disabled" disabled />
        <WInput v-model="inputValue" placeholder="Error state" error />
        <WSelect v-model="selectValue" :options="methodOptions" />
      </div>
    </section>

    <section class="mb-8 flex flex-col gap-3">
      <h2 class="font-inter text-xs font-medium uppercase text-faint">WTabs</h2>
      <div class="max-w-md">
        <WTabs v-model="activeTab" :tabs="tabs" />
      </div>
    </section>

    <section class="mb-8 flex flex-col gap-3">
      <h2 class="font-inter text-xs font-medium uppercase text-faint">WMethodBadge</h2>
      <div class="flex flex-wrap items-center gap-3">
        <WMethodBadge v-for="method in methods" :key="method" :method="method" />
      </div>
    </section>

    <section class="mb-8 flex flex-col gap-3">
      <h2 class="font-inter text-xs font-medium uppercase text-faint">WStatusBadge</h2>
      <div class="flex flex-wrap items-center gap-3">
        <WStatusBadge v-for="code in statuses" :key="String(code)" :code="code" />
      </div>
    </section>

    <section class="mb-8 flex flex-col gap-3">
      <h2 class="font-inter text-xs font-medium uppercase text-faint">WKeyValueTable</h2>
      <div class="max-w-2xl rounded-md border border-subtle bg-surface-2">
        <WKeyValueTable v-model="kvRows" />
      </div>
    </section>

    <section class="mb-8 flex flex-col gap-3">
      <h2 class="font-inter text-xs font-medium uppercase text-faint">WEmptyState</h2>
      <div class="max-w-md rounded-md border border-subtle bg-surface-2">
        <WEmptyState title="No requests yet" description="Create a request to get started.">
          <template #action>
            <WButton variant="primary" size="sm">New request</WButton>
          </template>
        </WEmptyState>
      </div>
    </section>
  </div>
</template>
