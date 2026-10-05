<script setup lang="ts">
import BranchPicker from "@renderer/components/BranchPicker.vue";
import JsonViewerModal from "@renderer/components/JsonViewerModal.vue";
import JwtToolModal from "@renderer/components/JwtToolModal.vue";
import WEnvironmentPicker, {
  type EnvironmentPickerItem,
} from "@renderer/components/WEnvironmentPicker.vue";
import WIcon from "@renderer/components/WIcon.vue";
import { useAppStore } from "@renderer/stores/app";
import { useChangesStore } from "@renderer/stores/changes";
import { useEnvironmentStore } from "@renderer/stores/environment";
import { useGitStore } from "@renderer/stores/git";
import { useMenuStore } from "@renderer/stores/menu";
import { isRequestTab, useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useSettingsStore } from "@renderer/stores/settings";
import { useUiStore } from "@renderer/stores/ui";
import { useWatchStore } from "@renderer/stores/watch";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { computed, ref, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";

const { t, locale } = useI18n();
const appStore = useAppStore();
const settings = useSettingsStore();
const menu = useMenuStore();
const workspace = useWorkspaceStore();
const environment = useEnvironmentStore();
const ui = useUiStore();
const requestTabs = useRequestTabsStore();
const git = useGitStore();
const changes = useChangesStore();
const watchStore = useWatchStore();

/** Watch ativo (#50) — clicar leva à primeira aba observada. */
function jumpToWatched(): void {
  const first = watchStore.runningIds[0];
  if (first) requestTabs.activate(first);
}

/** Branch atual (ClickLocal #51) — HEAD destacado aparece como o hash curto. */
const gitBranchLabel = computed(() => {
  const repo = git.repository;
  if (!repo) return "";
  if (repo.detached) return t("git.detached", { head: repo.head ?? "?" });
  return repo.branch ?? "";
});

/** Resumo dos scripts do último envio da aba ativa (EP-09-T05) — `null` quando não há nada a resumir. */
const scriptSummary = computed(() => {
  const tab = requestTabs.active;
  if (!isRequestTab(tab) || !tab.scriptRun) return null;
  const { assertions, preRequestError } = tab.scriptRun;
  if (preRequestError) return { text: t("status.scriptPreRequestFailed"), failed: true };
  if (assertions.length === 0) return null;
  const failedCount = assertions.filter(a => !a.passed).length;
  return failedCount > 0
    ? {
        text: t("status.scriptTestsFailed", { failed: failedCount, total: assertions.length }),
        failed: true,
      }
    : { text: t("status.scriptTestsPassed", { total: assertions.length }), failed: false };
});

const emit = defineEmits<{
  "open-environment-editor": [];
  "open-preferences": [];
}>();

const NO_ENVIRONMENT = "";

type Theme = "system" | "dark" | "light";

const THEME_ORDER: Theme[] = ["system", "dark", "light"];
const THEME_ICON: Record<Theme, string> = { system: "monitor", dark: "moon", light: "sun" };

/** Heurística de "produção": nome do environment contém "prod" — não há campo dedicado no schema (EP-06-T04). */
function isProduction(name: string): boolean {
  return /prod/i.test(name);
}

const environmentPickerItems = computed<EnvironmentPickerItem[]>(() =>
  environment.items.map(item => ({
    path: item.path,
    label: item.data.name,
    variableCount: item.data.variables?.length ?? 0,
    production: isProduction(item.data.name),
  })),
);

const activeEnvironmentLabel = computed(() => {
  const active = environment.items.find(item => item.path === environment.activePath);
  return active?.data.name ?? t("status.noEnvironment");
});

const environmentTriggerRef = useTemplateRef<HTMLElement>("environmentTrigger");
const environmentPickerOpen = ref(false);
const environmentPickerPosition = ref({ x: 0, bottom: 0 });

function openEnvironmentPicker(): void {
  const rect = environmentTriggerRef.value?.getBoundingClientRect();
  if (!rect) return;
  environmentPickerPosition.value = { x: rect.left, bottom: window.innerHeight - rect.top + 4 };
  environmentPickerOpen.value = true;
}

function onEnvironmentChange(value: string): void {
  environment.setActive(value === NO_ENVIRONMENT ? null : value);
}

function cycleTheme(): void {
  const nextIndex = (THEME_ORDER.indexOf(settings.theme) + 1) % THEME_ORDER.length;
  settings.setTheme(THEME_ORDER[nextIndex]);
}

const jwtToolOpen = ref(false);
const jsonViewerOpen = ref(false);

// Popover de branches (#54), ancorado para cima como o de environments.
const branchTriggerRef = useTemplateRef<HTMLElement>("branchTrigger");
const branchPickerOpen = ref(false);
const branchPickerPosition = ref({ x: 0, bottom: 0 });

function openBranchPicker(): void {
  const rect = branchTriggerRef.value?.getBoundingClientRect();
  if (!rect) return;
  branchPickerPosition.value = { x: rect.left, bottom: window.innerHeight - rect.top + 4 };
  branchPickerOpen.value = !branchPickerOpen.value;
}
</script>

<template>
  <div
    class="flex h-8 shrink-0 items-center gap-3 border-t border-subtle bg-surface-2 px-3 font-inter text-xs text-muted"
  >
    <span>{{ workspace.tree?.data?.name ?? t("status.noWorkspace") }}</span>
    <button
      type="button"
      class="flex items-center text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
      :title="t('status.switchWorkspace')"
      @click="workspace.close"
    >
      <WIcon name="arrow-left-right" size="3" />
    </button>
    <template v-if="git.repository || (git.available && workspace.ready)">
      <span class="text-faint" aria-hidden="true">·</span>
      <template v-if="git.repository">
        <button
          ref="branchTrigger"
          type="button"
          class="-mx-1 flex items-center gap-1 rounded px-1 text-1 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
          :title="t('git.branchTooltip', { root: git.repository.root })"
          :aria-expanded="branchPickerOpen"
          data-testid="git-branch"
          @click="openBranchPicker"
        >
          <WIcon name="git-branch" size="3.5" class="text-faint" />
          {{ gitBranchLabel }}
        </button>
        <button
          v-if="git.files.length"
          type="button"
          class="-ml-2 rounded px-1 text-faint hover:bg-surface-3 hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
          :title="t('changes.showChanges')"
          data-testid="git-changes"
          @click="changes.open()"
        >
          {{ t("git.changesCount", { count: git.files.length }) }}
        </button>
      </template>
      <button
        v-else-if="git.available && workspace.ready"
        type="button"
        class="-mx-1 flex items-center gap-1 rounded px-1 text-faint hover:bg-surface-3 hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
        :title="t('git.noRepositoryTooltip')"
        data-testid="git-no-repo"
        @click="changes.open()"
      >
        <WIcon name="git-branch" size="3.5" />
        {{ t("git.noRepository") }}
      </button>
    </template>
    <span class="text-faint">·</span>
    <button
      ref="environmentTrigger"
      type="button"
      class="-mx-1 flex items-center gap-1 rounded px-1 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
      :class="
        environment.items.find(i => i.path === environment.activePath && isProduction(i.data.name))
          ? 'font-semibold text-status-5xx'
          : 'text-1'
      "
      :title="t('status.activeEnvironment')"
      @click="openEnvironmentPicker"
    >
      {{ activeEnvironmentLabel }}
      <WIcon name="chevron-down" size="3" />
    </button>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
      :title="t('status.manageEnvironments')"
      @click="emit('open-environment-editor')"
    >
      <WIcon name="settings" size="3.5" />
      {{ t("status.manage") }}
    </button>
    <button
      v-if="watchStore.runningIds.length > 0"
      type="button"
      class="flex items-center gap-1 text-accent hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
      :title="t('watch.statusBarTitle')"
      data-testid="status-watching"
      @click="jumpToWatched"
    >
      <WIcon name="eye" size="3.5" />
      {{ t("watch.statusBar", { count: watchStore.runningIds.length }) }}
    </button>
    <span
      v-if="scriptSummary"
      class="flex items-center gap-1"
      :class="scriptSummary.failed ? 'text-status-5xx' : 'text-status-2xx'"
    >
      <WIcon :name="scriptSummary.failed ? 'x' : 'check'" size="3.5" />
      {{ scriptSummary.text }}
    </span>
    <span class="flex-1" role="status" aria-live="polite">{{ menu.statusMessage }}</span>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
      :title="t('status.responsePanelPosition', { position: ui.responsePanelPosition })"
      @click="ui.toggleResponsePanelPosition"
    >
      <WIcon
        :name="ui.responsePanelPosition === 'side' ? 'panel-right' : 'panel-bottom'"
        size="3.5"
      />
    </button>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
      :title="t('status.theme', { theme: t(`theme.${settings.theme}`) })"
      @click="cycleTheme"
    >
      <WIcon :name="THEME_ICON[settings.theme]" size="3.5" />
    </button>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
      :title="t('status.jsonViewer')"
      @click="jsonViewerOpen = true"
    >
      <WIcon name="braces" size="3.5" />
    </button>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
      :title="t('status.jwtTool')"
      @click="jwtToolOpen = true"
    >
      <WIcon name="key" size="3.5" />
    </button>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
      :title="t('status.documentation')"
      @click="appStore.openDocsWindow(locale === 'pt-BR' ? 'pt-BR' : 'en')"
    >
      <WIcon name="book-open" size="3.5" />
    </button>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
      :title="t('status.preferences')"
      @click="emit('open-preferences')"
    >
      <WIcon name="sliders-horizontal" size="3.5" />
    </button>
  </div>

  <WEnvironmentPicker
    :open="environmentPickerOpen"
    :x="environmentPickerPosition.x"
    :bottom="environmentPickerPosition.bottom"
    :items="environmentPickerItems"
    :active-path="environment.activePath ?? NO_ENVIRONMENT"
    @close="environmentPickerOpen = false"
    @select="onEnvironmentChange"
  />

  <JwtToolModal :open="jwtToolOpen" @close="jwtToolOpen = false" />
  <JsonViewerModal :open="jsonViewerOpen" @close="jsonViewerOpen = false" />

  <BranchPicker
    :open="branchPickerOpen"
    :x="branchPickerPosition.x"
    :bottom="branchPickerPosition.bottom"
    @close="branchPickerOpen = false"
  />
</template>
