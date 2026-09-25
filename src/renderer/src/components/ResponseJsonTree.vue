<script setup lang="ts">
import {
  appendScriptLine,
  assertionLine,
  displayPath,
  type Json,
  literalFor,
  setVarLine,
  suggestVarName,
  type TreeRow,
} from "@renderer/lib/jsonTree";
import { useEnvironmentStore } from "@renderer/stores/environment";
import { useRequestStore } from "@renderer/stores/request";
import { useToastStore } from "@renderer/stores/toast";
import { computed, shallowRef } from "vue";
import { useI18n } from "vue-i18n";

import JsonTreeView from "./JsonTreeView.vue";
import WButton from "./WButton.vue";
import WContextMenu, { type ContextMenuItem } from "./WContextMenu.vue";
import WInput from "./WInput.vue";
import WModal from "./WModal.vue";

/**
 * Árvore clicável da resposta JSON (ClickLocal #47): o menu de contexto de cada valor
 * vira uma linha no script de tests da request (que passa pela edição normal da aba —
 * fica suja, salva com Ctrl+S) ou grava o valor atual no environment ativo.
 */
defineProps<{ data: Json }>();

const { t } = useI18n();
const request = useRequestStore();
const environment = useEnvironmentStore();
const toast = useToastStore();

const menu = shallowRef({ open: false, x: 0, y: 0, row: null as TreeRow | null });

function isPrimitive(value: Json): boolean {
  return value === null || typeof value !== "object";
}

const menuItems = computed<ContextMenuItem[]>(() => {
  const row = menu.value.row;
  if (!row) return [];
  const items: ContextMenuItem[] = [
    {
      label: t("response.tree.saveVariable"),
      icon: "variable",
      action: () => openNameModal("variable", row),
    },
  ];
  // "Submenu" da spec como itens irmãos — `WContextMenu` é uma lista plana.
  if (assertionLine(row.path, row.value, "equals") !== null) {
    items.push({
      label: t("response.tree.assertEquals"),
      icon: "check",
      action: () => addAssertion(row, "equals"),
    });
  }
  items.push({
    label: t("response.tree.assertTruthy"),
    icon: "check",
    action: () => addAssertion(row, "truthy"),
  });
  if (isPrimitive(row.value)) {
    items.push({
      label: t("response.tree.saveEnvironment"),
      icon: "save",
      action: () => openNameModal("environment", row),
      separatorBefore: true,
    });
  }
  items.push(
    {
      label: t("response.tree.copyValue"),
      icon: "copy",
      action: () => void copy(valueText(row.value)),
      separatorBefore: true,
    },
    {
      label: t("response.tree.copyPath"),
      icon: "copy",
      action: () => void copy(displayPath(row.path)),
    },
  );
  return items;
});

// `shallowRef`: mutar `.open` direto (inclusive no template) não dispara reatividade — troca o objeto.
function closeMenu(): void {
  menu.value = { ...menu.value, open: false };
}

function onNodeMenu(row: TreeRow, event: MouseEvent): void {
  menu.value = { open: true, x: event.clientX, y: event.clientY, row };
}

function valueText(value: Json): string {
  return typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "");
}

async function copy(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function appendToTests(line: string): void {
  request.scripts = {
    ...request.scripts,
    tests: appendScriptLine(request.scripts.tests, line),
  };
  toast.push(t("response.tree.lineAdded"), "success");
}

function addAssertion(row: TreeRow, kind: "equals" | "truthy"): void {
  const line = assertionLine(row.path, row.value, kind);
  if (line) appendToTests(line);
}

// --- Modal de nome (variável / environment) --------------------------------------------
const modal = shallowRef({
  open: false,
  mode: "variable" as "variable" | "environment",
  row: null as TreeRow | null,
  name: "",
});

function openNameModal(mode: "variable" | "environment", row: TreeRow): void {
  modal.value = { open: true, mode, row, name: suggestVarName(row.path) };
}

function closeModal(): void {
  modal.value = { ...modal.value, open: false };
}

const trimmedName = computed(() => modal.value.name.trim());
const nameValid = computed(() => /^[A-Za-z_][\w.-]*$/.test(trimmedName.value));
const existingEnvVar = computed(() =>
  modal.value.mode === "environment"
    ? environment.active?.data.variables?.find(v => v.name === trimmedName.value)
    : undefined,
);
const noActiveEnvironment = computed(
  () => modal.value.mode === "environment" && !environment.active,
);

async function confirmModal(): Promise<void> {
  const { mode, row } = modal.value;
  if (!row || !nameValid.value || noActiveEnvironment.value) return;
  if (mode === "variable") {
    appendToTests(setVarLine(trimmedName.value, row.path));
  } else {
    await saveToEnvironment(trimmedName.value, row.value);
  }
  modal.value = { ...modal.value, open: false };
}

async function saveToEnvironment(name: string, value: Json): Promise<void> {
  const active = environment.active;
  if (!active) return;
  const text = value === null ? "" : String(value);
  const existing = active.data.variables ?? [];
  const byName = new Map(existing.map(v => [v.name, v]));
  const current = byName.get(name);
  byName.set(name, { ...current, name, value: text, enabled: current?.enabled ?? true });
  await environment.save(
    active.path,
    active.data.name,
    [...byName.values()].map(v => ({
      name: v.name,
      enabled: v.enabled,
      description: v.description,
      secret: v.secret,
      // Um segredo existente só chega aqui com o valor novo depois da confirmação do modal;
      // os demais segredos nunca têm valor no YAML, então vão sem ele (como `persistEnvVars`).
      value: v.secret && v.name !== name ? undefined : v.value,
    })),
  );
}

const previewLine = computed(() => {
  const row = modal.value.row;
  if (!row || modal.value.mode !== "variable") return "";
  return setVarLine(trimmedName.value || "name", row.path);
});

const valuePreview = computed(() => {
  const row = modal.value.row;
  return row ? (literalFor(row.value) ?? "…") : "";
});
</script>

<template>
  <JsonTreeView :data="data" @node-menu="onNodeMenu" />

  <WContextMenu :open="menu.open" :x="menu.x" :y="menu.y" :items="menuItems" @close="closeMenu" />

  <WModal
    :open="modal.open"
    :title="
      modal.mode === 'variable'
        ? t('response.tree.modal.variableTitle')
        : t('response.tree.modal.environmentTitle')
    "
    @close="closeModal"
  >
    <form class="flex flex-col gap-3" @submit.prevent="confirmModal">
      <p class="font-mono text-xs text-muted">
        {{ modal.row ? displayPath(modal.row.path) : "" }}
      </p>
      <label class="flex flex-col gap-1 font-inter text-sm text-1">
        {{ t("response.tree.modal.name") }}
        <WInput
          :model-value="modal.name"
          monospace
          :error="trimmedName !== '' && !nameValid"
          data-testid="json-tree-var-name"
          @update:model-value="modal = { ...modal, name: $event }"
        />
      </label>
      <p v-if="modal.mode === 'variable'" class="break-all font-mono text-xs text-faint">
        {{ previewLine }}
      </p>
      <p v-else class="break-all font-mono text-xs text-faint">
        {{ t("response.tree.modal.currentValue", { value: valuePreview }) }}
      </p>
      <p v-if="noActiveEnvironment" class="font-inter text-xs text-status-5xx">
        {{ t("response.tree.modal.noEnvironment") }}
      </p>
      <p
        v-else-if="existingEnvVar?.secret"
        class="rounded-md bg-status-4xx/10 px-2 py-1 font-inter text-xs text-status-4xx"
      >
        {{ t("response.tree.modal.overwriteSecret", { name: trimmedName }) }}
      </p>
      <p v-else-if="existingEnvVar" class="font-inter text-xs text-muted">
        {{ t("response.tree.modal.overwrite", { name: trimmedName }) }}
      </p>
      <button type="submit" class="hidden" />
    </form>
    <template #footer>
      <WButton variant="ghost" @click="closeModal">{{ t("common.cancel") }}</WButton>
      <WButton
        :disabled="!nameValid || noActiveEnvironment"
        data-testid="json-tree-confirm"
        @click="confirmModal"
      >
        {{
          existingEnvVar?.secret
            ? t("response.tree.modal.overwriteConfirm")
            : t("response.tree.modal.confirm")
        }}
      </WButton>
    </template>
  </WModal>
</template>
