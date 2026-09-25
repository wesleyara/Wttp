<script setup lang="ts">
import { type UntilKind, validateWatchConfig, type WatchConfig } from "@renderer/lib/watch";
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useWatchStore } from "@renderer/stores/watch";
import { computed, nextTick, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";

import WButton from "./WButton.vue";
import WIcon from "./WIcon.vue";
import WInput from "./WInput.vue";
import WModal from "./WModal.vue";
import WSelect from "./WSelect.vue";

/**
 * Botão "Watch" ao lado de Send (ClickLocal #50), no formato de dropdown button: o botão
 * principal começa a observar com a última configuração da aba, a seta abre as opções
 * (intervalo, "poll until", limite de tentativas). Durante o watch vira um "Stop · N"
 * sempre visível, com o contador de iterações.
 */
const props = defineProps<{ tabId: string; disabled?: boolean }>();

const { t } = useI18n();
const watchStore = useWatchStore();
const tabs = useRequestTabsStore();

const session = computed(() => watchStore.sessionFor(props.tabId));
const running = computed(() => session.value?.running === true);

// Campos do formulário como texto — números são validados ao iniciar (`validateWatchConfig`).
const form = reactive({
  intervalSeconds: "5",
  until: "none" as string,
  status: "200",
  jsonPath: "",
  jsonValue: "",
  maxAttempts: "20",
});

function loadForm(): void {
  const config = watchStore.configFor(props.tabId);
  form.intervalSeconds = String(config.intervalSeconds);
  form.until = config.until;
  form.status = config.status;
  form.jsonPath = config.jsonPath;
  form.jsonValue = config.jsonValue;
  form.maxAttempts = String(config.maxAttempts);
}
watch(() => props.tabId, loadForm, { immediate: true });

const config = computed<WatchConfig>(() => ({
  intervalSeconds: Number(form.intervalSeconds),
  until: form.until as UntilKind,
  status: form.status,
  jsonPath: form.jsonPath,
  jsonValue: form.jsonValue,
  maxAttempts: Number(form.maxAttempts),
}));
const configError = computed(() => validateWatchConfig(config.value));

const untilOptions = computed(() =>
  (["none", "status", "json", "tests"] as const).map(value => ({
    value,
    label: t(`watch.until.${value}`),
  })),
);

// --- Dropdown --------------------------------------------------------------------------
const popoverOpen = ref(false);
const popoverPosition = ref({ right: 0, top: 0 });
const triggerRef = useTemplateRef<HTMLElement>("trigger");
const popoverRef = useTemplateRef<HTMLElement>("popover");

async function togglePopover(): Promise<void> {
  if (popoverOpen.value) {
    popoverOpen.value = false;
    return;
  }
  const rect = triggerRef.value?.getBoundingClientRect();
  if (!rect) return;
  popoverPosition.value = { right: window.innerWidth - rect.right, top: rect.bottom + 4 };
  popoverOpen.value = true;
  await nextTick();
  popoverRef.value?.focus();
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target as Node;
  if (!popoverRef.value?.contains(target) && !triggerRef.value?.contains(target)) {
    popoverOpen.value = false;
  }
}
watch(popoverOpen, open => {
  if (open) document.addEventListener("pointerdown", onDocumentPointerDown);
  else document.removeEventListener("pointerdown", onDocumentPointerDown);
});
onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocumentPointerDown));

// --- Iniciar (com o aviso de pre-request antes da primeira iteração) --------------------
const confirmOpen = ref(false);
const preRequestCount = computed(() => tabs.preRequestScriptCount(props.tabId));
const repeatsLabel = computed(() =>
  config.value.until === "none"
    ? t("watch.preRequest.timesUnbounded")
    : t("watch.preRequest.timesLimit", { count: config.value.maxAttempts }),
);

function requestStart(): void {
  if (configError.value) {
    popoverOpen.value = true;
    return;
  }
  popoverOpen.value = false;
  if (preRequestCount.value > 0) confirmOpen.value = true;
  else begin();
}

function begin(): void {
  confirmOpen.value = false;
  watchStore.start(props.tabId, config.value);
}
</script>

<template>
  <div class="flex shrink-0 items-stretch">
    <WButton
      v-if="running"
      variant="danger"
      class="min-w-28"
      data-testid="watch-stop"
      @click="watchStore.stop(tabId)"
    >
      <WIcon
        :name="session?.inFlight ? 'loader-circle' : 'square'"
        size="3.5"
        :class="session?.inFlight ? 'animate-spin' : ''"
      />
      {{ t("watch.running", { count: session?.iteration ?? 0 }) }}
    </WButton>

    <template v-else>
      <WButton
        variant="secondary"
        class="rounded-r-none"
        :disabled="disabled"
        data-testid="watch-start"
        @click="requestStart"
      >
        <WIcon name="eye" size="3.5" />
        {{ t("watch.watch") }}
      </WButton>
      <button
        ref="trigger"
        type="button"
        class="flex w-7 items-center justify-center rounded-r-md border border-l-0 border-subtle bg-surface-2 text-muted transition-colors hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        :title="t('watch.watchOptions')"
        :aria-label="t('watch.watchOptions')"
        :aria-expanded="popoverOpen"
        :disabled="disabled"
        data-testid="watch-options"
        @click="togglePopover"
      >
        <WIcon name="chevron-down" size="3.5" />
      </button>
    </template>

    <Teleport to="body">
      <div
        v-if="popoverOpen"
        ref="popover"
        role="dialog"
        tabindex="-1"
        :aria-label="t('watch.title')"
        class="fixed z-50 flex w-72 flex-col gap-3 rounded-md border border-subtle bg-surface-2 p-3 shadow-lg focus-visible:outline-none"
        :style="{ right: `${popoverPosition.right}px`, top: `${popoverPosition.top}px` }"
        data-testid="watch-popover"
        @keydown.esc="popoverOpen = false"
      >
        <p class="font-barlow text-sm font-semibold text-1">{{ t("watch.title") }}</p>

        <label class="flex flex-col gap-1 font-inter text-xs text-muted">
          {{ t("watch.interval") }}
          <WInput v-model="form.intervalSeconds" type="number" data-testid="watch-interval" />
        </label>

        <label class="flex flex-col gap-1 font-inter text-xs text-muted">
          {{ t("watch.pollUntil") }}
          <WSelect v-model="form.until" :options="untilOptions" data-testid="watch-until" />
        </label>

        <WInput
          v-if="form.until === 'status'"
          v-model="form.status"
          monospace
          :placeholder="t('watch.statusPlaceholder')"
          data-testid="watch-status"
        />
        <template v-else-if="form.until === 'json'">
          <WInput
            v-model="form.jsonPath"
            monospace
            :placeholder="t('watch.jsonPathPlaceholder')"
            data-testid="watch-json-path"
          />
          <WInput
            v-model="form.jsonValue"
            monospace
            :placeholder="t('watch.jsonValuePlaceholder')"
            data-testid="watch-json-value"
          />
        </template>

        <label
          v-if="form.until !== 'none'"
          class="flex flex-col gap-1 font-inter text-xs text-muted"
        >
          {{ t("watch.maxAttempts") }}
          <WInput v-model="form.maxAttempts" type="number" data-testid="watch-max-attempts" />
        </label>

        <p v-if="configError" class="font-inter text-xs text-status-5xx">
          {{ t(`watch.errors.${configError}`) }}
        </p>

        <WButton :disabled="configError !== null" data-testid="watch-confirm" @click="requestStart">
          {{ t("watch.start") }}
        </WButton>
      </div>
    </Teleport>

    <WModal :open="confirmOpen" :title="t('watch.preRequest.title')" @close="confirmOpen = false">
      <p class="font-inter text-sm text-muted">
        {{ t("watch.preRequest.body", { count: preRequestCount, times: repeatsLabel }) }}
      </p>
      <template #footer>
        <WButton variant="ghost" @click="confirmOpen = false">{{ t("common.cancel") }}</WButton>
        <WButton data-testid="watch-preRequest-confirm" @click="begin">
          {{ t("watch.preRequest.confirm") }}
        </WButton>
      </template>
    </WModal>
  </div>
</template>
