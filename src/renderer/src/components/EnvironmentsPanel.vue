<script setup lang="ts">
import { useVariablePreview } from "@renderer/composables/useVariablePreview";
import { type SaveVariableInput, useEnvironmentStore } from "@renderer/stores/environment";
import { useVariablesStore } from "@renderer/stores/variables";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { computed, onMounted, ref, watch } from "vue";

import type { KeyValueRow } from "./WKeyValueTable.vue";

import WButton from "./WButton.vue";
import WInput from "./WInput.vue";
import WKeyValueTable from "./WKeyValueTable.vue";

/**
 * Conteúdo do antigo `EnvironmentEditorModal` (EP-06-T03), agora vivendo como uma aba
 * comum no strip central em vez de um `WModal` — pedido de uso real: uma tela cheia
 * "presa" num modal dava menos espaço e não convivia com as outras abas abertas. Mesma
 * lógica de edição/save de sempre; só a casca mudou.
 */

const environment = useEnvironmentStore();
const workspace = useWorkspaceStore();
const variablesStore = useVariablesStore();

const WORKSPACE_SELECTION = "__workspace__";

/** `__workspace__` = aba das variáveis globais; qualquer outro valor é o `path` de um environment. */
const selected = ref<string>(WORKSPACE_SELECTION);
const draftName = ref("");
const draftVariables = ref<KeyValueRow[]>([]);
const duplicateWarning = ref<string | null>(null);

// Não há request associada aqui, então resolve contra a raiz do workspace (sem escopo
// de collection/pasta) — o suficiente para destacar `{{var}}` não resolvido (EP-06.1).
const draftPath = ref("");
const draftText = computed(() => draftVariables.value.map(row => row.value).join("\n"));
const { unresolved: draftUnresolved, tooltips: draftTooltips } = useVariablePreview(
  draftText,
  draftPath,
);
const draftVariableNames = computed(() => variablesStore.variableNamesFor(draftPath.value));

const selectedEnvironment = computed(() =>
  environment.items.find(item => item.path === selected.value),
);

function loadDraft(): void {
  if (selected.value === WORKSPACE_SELECTION) {
    draftName.value = "Workspace";
    draftVariables.value = (workspace.tree?.data?.variables ?? []).map(v => ({
      ...v,
      description: v.description ?? "",
    }));
    return;
  }

  const item = selectedEnvironment.value;
  draftName.value = item?.data.name ?? "";
  draftVariables.value = (item?.data.variables ?? []).map(v => ({
    ...v,
    value: v.secret ? "" : v.value,
    description: v.description ?? "",
  }));
}

onMounted(async () => {
  await environment.refresh();
  selected.value = environment.activePath ?? WORKSPACE_SELECTION;
  loadDraft();
});

watch(selected, () => {
  duplicateWarning.value = null;
  loadDraft();
});

function toVariableInputs(rows: KeyValueRow[]): SaveVariableInput[] {
  return rows
    .filter(row => row.name.trim().length > 0)
    .map(row => ({
      name: row.name,
      enabled: row.enabled,
      description: row.description || undefined,
      secret: row.secret,
      // Uma linha secreta sem valor digitado nesta edição não deve apagar o segredo já salvo.
      value: row.secret && row.value === "" ? undefined : row.value,
    }));
}

/** Nomes de variável repetidos na mesma lista — sinalizado na UI (EP-06-T03). */
const duplicateNames = computed(() => {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const row of draftVariables.value) {
    const name = row.name.trim();
    if (!name) continue;
    if (seen.has(name)) dupes.add(name);
    seen.add(name);
  }
  return dupes;
});

async function save(): Promise<void> {
  if (selected.value === WORKSPACE_SELECTION) {
    await environment.saveWorkspaceVariables(
      draftVariables.value
        .filter(row => row.name.trim().length > 0)
        .map(row => ({
          name: row.name,
          value: row.value,
          enabled: row.enabled,
          description: row.description || undefined,
        })),
    );
    return;
  }

  const item = selectedEnvironment.value;
  const saved = await environment.save(
    item?.path,
    draftName.value,
    toVariableInputs(draftVariables.value),
  );
  if (saved) selected.value = saved.path;
}

async function createEnvironment(): Promise<void> {
  const created = await environment.create("New environment");
  if (created) selected.value = created.path;
}

async function removeEnvironment(): Promise<void> {
  const item = selectedEnvironment.value;
  if (!item) return;
  await environment.remove(item.path);
  selected.value = WORKSPACE_SELECTION;
}

async function duplicateEnvironment(): Promise<void> {
  const item = selectedEnvironment.value;
  if (!item) return;

  const hasSecrets = (item.data.variables ?? []).some(v => v.secret);
  if (hasSecrets && duplicateWarning.value !== item.path) {
    duplicateWarning.value = item.path;
    return;
  }
  duplicateWarning.value = null;

  const created = await environment.duplicate(item.path);
  if (created) selected.value = created.path;
}
</script>

<template>
  <div class="flex h-full min-h-0 gap-4 p-3">
    <div class="flex w-48 shrink-0 flex-col gap-1 border-r border-subtle pr-3">
      <button
        type="button"
        class="rounded-md px-2 py-1.5 text-left font-inter text-sm transition-colors"
        :class="
          selected === WORKSPACE_SELECTION
            ? 'bg-surface-3 text-1'
            : 'text-muted hover:bg-surface-3/50 hover:text-1'
        "
        @click="selected = WORKSPACE_SELECTION"
      >
        Workspace variables
      </button>

      <div class="mt-2 flex-1 overflow-y-auto">
        <button
          v-for="item in environment.items"
          :key="item.path"
          type="button"
          class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-inter text-sm transition-colors"
          :class="
            selected === item.path
              ? 'bg-surface-3 text-1'
              : 'text-muted hover:bg-surface-3/50 hover:text-1'
          "
          @click="selected = item.path"
        >
          <span
            v-if="environment.activePath === item.path"
            class="size-1.5 shrink-0 rounded-full bg-accent"
            aria-hidden="true"
          />
          <span class="truncate">{{ item.data.name }}</span>
        </button>
      </div>

      <WButton size="sm" variant="ghost" class="justify-start" @click="createEnvironment">
        + New environment
      </WButton>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-3">
      <div class="flex items-center gap-2">
        <WInput
          v-if="selected !== WORKSPACE_SELECTION"
          v-model="draftName"
          class="flex-1"
          placeholder="Environment name"
        />
        <h2 v-else class="flex-1 font-barlow text-base font-semibold text-1">
          Workspace variables
        </h2>
        <WButton
          v-if="selected !== WORKSPACE_SELECTION"
          size="sm"
          variant="secondary"
          @click="duplicateEnvironment"
        >
          Duplicate
        </WButton>
        <WButton
          v-if="selected !== WORKSPACE_SELECTION"
          size="sm"
          variant="danger"
          @click="removeEnvironment"
        >
          Delete
        </WButton>
        <WButton size="sm" variant="primary" @click="save">Save</WButton>
      </div>

      <p
        v-if="duplicateWarning === selected"
        class="rounded-md border border-subtle bg-surface-3 px-2 py-1.5 font-inter text-xs text-muted"
      >
        This environment has secret values — they won't be copied to the duplicate. Click
        "Duplicate" again to confirm.
      </p>

      <p
        v-if="duplicateNames.size > 0"
        class="rounded-md border border-status-5xx/40 bg-surface-3 px-2 py-1.5 font-inter text-xs text-status-5xx"
      >
        Duplicate variable name{{ duplicateNames.size > 1 ? "s" : "" }}:
        {{ [...duplicateNames].join(", ") }}
      </p>

      <div class="min-h-0 flex-1 overflow-y-auto rounded-md border border-subtle">
        <WKeyValueTable
          v-model="draftVariables"
          :with-secret="selected !== WORKSPACE_SELECTION"
          :unresolved-variables="draftUnresolved"
          :variable-tooltips="draftTooltips"
          :variable-names="draftVariableNames"
        />
      </div>
    </div>
  </div>
</template>
