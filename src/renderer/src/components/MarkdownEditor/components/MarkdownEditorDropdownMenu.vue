<script setup lang="ts">
import { ChevronRight } from "@lucide/vue";
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";

import type {
  MarkdownEditorDropdownItem,
  MarkdownEditorDropdownMenuProps,
} from "../models/markdown-editor-dropdown-menu.models";

const props = defineProps<MarkdownEditorDropdownMenuProps>();

const open = ref(false);
/** Key do item cujo submenu está aberto (só um nível de submenu). */
const openSubmenu = ref<string | null>(null);
const root = useTemplateRef("root");
const menu = useTemplateRef("menu");

/** Botões de uma lista, sem os dos submenus aninhados nela. */
function listButtons(list: Element | null | undefined): HTMLButtonElement[] {
  return Array.from(list?.querySelectorAll<HTMLButtonElement>(":scope > li > button") ?? []);
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!root.value?.contains(event.target as Node)) open.value = false;
}

async function showSubmenu(item: MarkdownEditorDropdownItem, focus: boolean): Promise<void> {
  openSubmenu.value = item.key;
  if (!focus) return;
  await nextTick();
  const submenu = Array.from(root.value?.querySelectorAll<HTMLElement>(".mde-submenu") ?? []).find(
    el => el.dataset.parent === item.key,
  );
  listButtons(submenu)[0]?.focus();
}

function hideSubmenu(): void {
  const parent = listButtons(menu.value).find(button => button.dataset.key === openSubmenu.value);
  openSubmenu.value = null;
  parent?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  const active = document.activeElement as HTMLElement | null;
  const list = active?.closest("ul");
  const inSubmenu = !!list?.classList.contains("mde-submenu");

  if (event.key === "Escape") {
    if (inSubmenu) hideSubmenu();
    else open.value = false;
    return;
  }
  if (event.key === "ArrowRight" && !inSubmenu) {
    const item = props.items.find(i => i.key === active?.dataset.key);
    if (item?.children?.length) {
      event.preventDefault();
      showSubmenu(item, true);
    }
    return;
  }
  if (event.key === "ArrowLeft" && inSubmenu) {
    event.preventDefault();
    hideSubmenu();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const buttons = listButtons(list ?? menu.value);
  const index = buttons.indexOf(active as HTMLButtonElement);
  const next =
    event.key === "ArrowDown"
      ? (index + 1) % buttons.length
      : (index - 1 + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

watch(open, async value => {
  if (value) {
    document.addEventListener("pointerdown", onDocumentPointerDown);
    await nextTick();
    listButtons(menu.value)[0]?.focus();
  } else {
    openSubmenu.value = null;
    document.removeEventListener("pointerdown", onDocumentPointerDown);
  }
});

onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocumentPointerDown));

function select(item: MarkdownEditorDropdownItem): void {
  // Sempre abre (nunca alterna): com o mouse, o hover já abriu o submenu antes do clique.
  if (item.children?.length) {
    showSubmenu(item, true);
    return;
  }
  open.value = false;
  item.onSelect?.();
}

/** Passar o mouse num item abre o submenu dele (ou fecha o submenu aberto de outro item). */
function onItemEnter(item: MarkdownEditorDropdownItem): void {
  if (item.children?.length) showSubmenu(item, false);
  else openSubmenu.value = null;
}
</script>

<template>
  <div ref="root" class="mde-dropdown" @keydown="onKeydown">
    <slot :open="open" :toggle="() => (open = !open)" />
    <ul v-if="open" ref="menu" class="mde-menu" role="menu">
      <li v-for="item in items" :key="item.key" role="none" @mouseenter="onItemEnter(item)">
        <button
          type="button"
          role="menuitem"
          class="mde-menu-item"
          :data-key="item.key"
          :aria-haspopup="item.children?.length ? 'menu' : undefined"
          :aria-expanded="item.children?.length ? openSubmenu === item.key : undefined"
          @click="select(item)"
        >
          <component :is="item.icon" v-if="item.icon" class="mde-icon" />
          {{ item.label }}
          <ChevronRight
            v-if="item.children?.length"
            class="mde-icon mde-icon--sm mde-menu-item-chevron"
          />
        </button>
        <ul
          v-if="item.children?.length && openSubmenu === item.key"
          class="mde-menu mde-submenu"
          role="menu"
          :data-parent="item.key"
        >
          <li v-for="child in item.children" :key="child.key" role="none">
            <button
              type="button"
              role="menuitem"
              class="mde-menu-item"
              :data-key="child.key"
              @click="select(child)"
            >
              <component :is="child.icon" v-if="child.icon" class="mde-icon" />
              {{ child.label }}
            </button>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>
