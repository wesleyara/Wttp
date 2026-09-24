<script setup lang="ts">
import type { GitRef } from "@shared";

import { useBranchesStore } from "@renderer/stores/branches";
import { useChangesStore } from "@renderer/stores/changes";
import { useGitStore } from "@renderer/stores/git";
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";

import WButton from "./WButton.vue";
import WIcon from "./WIcon.vue";
import WModal from "./WModal.vue";

/**
 * Popover de branches do StatusBar (ClickLocal #54): buscar, trocar, criar, "checkout as
 * local" de uma remota. Os dois diálogos — aba suja bloqueando e troca que vale para o
 * repositório inteiro — moram aqui também, perto de quem os dispara.
 */

const props = defineProps<{
  open: boolean;
  x: number;
  bottom: number;
}>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const branches = useBranchesStore();
const git = useGitStore();
const changes = useChangesStore();

const menuRef = useTemplateRef<HTMLElement>("menu");
const searchRef = useTemplateRef<HTMLInputElement>("search");
const search = ref("");
const creating = ref(false);
const newName = ref("");

const query = computed(() => search.value.trim().toLowerCase());
const localList = computed(() =>
  branches.local.filter(item => item.name.toLowerCase().includes(query.value)),
);
const remoteList = computed(() =>
  branches.remoteOnly.filter(item => item.name.toLowerCase().includes(query.value)),
);

async function pick(item: GitRef): Promise<void> {
  if (item.current) return;
  emit("close");
  await branches.requestCheckout(item);
}

async function submitNewBranch(): Promise<void> {
  if (!newName.value.trim()) return;
  const ok = await branches.create(newName.value);
  if (ok) {
    newName.value = "";
    creating.value = false;
    emit("close");
  }
}

function showChanges(): void {
  emit("close");
  void changes.open();
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!menuRef.value?.contains(event.target as Node)) emit("close");
}

watch(
  () => props.open,
  async isOpen => {
    if (!isOpen) {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      return;
    }
    search.value = "";
    creating.value = false;
    void branches.load();
    await nextTick();
    searchRef.value?.focus();
    document.addEventListener("pointerdown", onDocumentPointerDown);
  },
);

onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocumentPointerDown));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="menu"
      class="fixed z-50 flex max-h-[26rem] w-80 flex-col rounded-md border border-subtle bg-surface-2 shadow-lg"
      :style="{ left: `${x}px`, bottom: `${bottom}px` }"
      data-testid="branch-picker"
      @keydown.esc.prevent="emit('close')"
    >
      <div class="border-b border-subtle p-2">
        <input
          ref="search"
          v-model="search"
          type="text"
          class="h-7 w-full rounded-md border border-subtle bg-surface-1 px-2 font-inter text-sm text-1 placeholder:text-faint focus-visible:border-strong focus-visible:outline-none"
          :placeholder="t('branches.search')"
          :aria-label="t('branches.search')"
        />
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-1">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-inter text-sm text-1 hover:bg-surface-3"
          @click="showChanges"
        >
          <WIcon name="git-compare" size="3.5" class="text-faint" />
          <span class="flex-1">{{ t("changes.showChanges") }}</span>
          <span v-if="git.files.length" class="font-inter text-[11px] text-faint">
            {{ git.files.length }}
          </span>
        </button>

        <p class="px-2 pb-1 pt-2 font-inter text-[11px] font-semibold uppercase text-faint">
          {{ t("branches.local") }}
        </p>
        <button
          v-for="item in localList"
          :key="item.name"
          type="button"
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-[13px] hover:bg-surface-3"
          :class="item.current ? 'text-1' : 'text-muted'"
          :aria-current="item.current ? 'true' : undefined"
          :disabled="branches.busy"
          data-testid="branch-item"
          @click="pick(item)"
        >
          <WIcon
            :name="item.current ? 'check' : 'git-branch'"
            size="3.5"
            class="shrink-0"
            :class="item.current ? 'text-accent' : 'text-faint'"
          />
          <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
        </button>

        <template v-if="remoteList.length">
          <p class="px-2 pb-1 pt-2 font-inter text-[11px] font-semibold uppercase text-faint">
            {{ t("branches.remote") }}
          </p>
          <button
            v-for="item in remoteList"
            :key="item.name"
            type="button"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-[13px] text-muted hover:bg-surface-3"
            :title="t('branches.checkoutAsLocal')"
            :disabled="branches.busy"
            data-testid="remote-branch-item"
            @click="pick(item)"
          >
            <WIcon name="cloud" size="3.5" class="shrink-0 text-faint" />
            <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
            <span class="shrink-0 font-inter text-[11px] text-faint">
              {{ t("branches.checkoutAsLocalShort") }}
            </span>
          </button>
        </template>

        <p
          v-if="!branches.loading && localList.length === 0 && remoteList.length === 0"
          class="p-2 font-inter text-xs text-faint"
        >
          {{ t("branches.noMatch") }}
        </p>
      </div>

      <div class="border-t border-subtle p-2">
        <form v-if="creating" class="flex gap-1" @submit.prevent="submitNewBranch">
          <input
            v-model="newName"
            type="text"
            class="h-7 min-w-0 flex-1 rounded-md border border-subtle bg-surface-1 px-2 font-mono text-[13px] text-1 placeholder:text-faint focus-visible:border-strong focus-visible:outline-none"
            :placeholder="t('branches.newPlaceholder')"
            :aria-label="t('branches.newPlaceholder')"
            data-testid="new-branch-name"
            @keydown.esc.stop="creating = false"
          />
          <WButton
            size="sm"
            variant="primary"
            type="submit"
            :disabled="branches.busy || !newName.trim()"
          >
            {{ t("branches.create") }}
          </WButton>
        </form>
        <button
          v-else
          type="button"
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-inter text-sm text-1 hover:bg-surface-3"
          data-testid="create-branch"
          @click="creating = true"
        >
          <WIcon name="git-branch-plus" size="3.5" class="text-faint" />
          {{ t("branches.createFrom", { branch: git.repository?.branch ?? "HEAD" }) }}
        </button>
      </div>
    </div>
  </Teleport>

  <WModal
    :open="branches.blockedBy !== null"
    :title="t('branches.blockedTitle')"
    @close="branches.blockedBy = null"
  >
    <div class="flex flex-col gap-2 font-inter text-sm text-1" data-testid="checkout-blocked">
      <p>{{ t("branches.blockedBody") }}</p>
      <ul class="rounded-md border border-subtle bg-surface-2 px-2 py-1">
        <li v-for="name in branches.blockedBy ?? []" :key="name" class="truncate text-muted">
          {{ name }}
        </li>
      </ul>
    </div>
    <template #footer>
      <WButton variant="primary" @click="branches.blockedBy = null">{{
        t("common.close")
      }}</WButton>
    </template>
  </WModal>

  <WModal
    :open="branches.pending !== null"
    :title="t('branches.confirmTitle', { branch: branches.pending?.name ?? '' })"
    @close="branches.pending = null"
  >
    <div class="flex flex-col gap-2 font-inter text-sm text-1" data-testid="checkout-confirm">
      <p>{{ t("branches.confirmRepoWide", { root: git.repository?.root ?? "" }) }}</p>
      <template v-if="branches.data && branches.data.outsideChangesCount > 0">
        <p class="text-status-4xx">
          {{ t("branches.outsideChanges", { count: branches.data.outsideChangesCount }) }}
        </p>
        <ul class="max-h-32 overflow-y-auto rounded-md border border-subtle bg-surface-2 px-2 py-1">
          <li
            v-for="path in branches.data.outsideChanges"
            :key="path"
            class="truncate font-mono text-[12px] text-muted"
          >
            {{ path }}
          </li>
        </ul>
      </template>
    </div>
    <template #footer>
      <WButton variant="ghost" @click="branches.pending = null">{{ t("common.cancel") }}</WButton>
      <WButton
        variant="primary"
        data-testid="checkout-confirm-button"
        @click="branches.confirmPending()"
      >
        {{ t("branches.switch") }}
      </WButton>
    </template>
  </WModal>
</template>
