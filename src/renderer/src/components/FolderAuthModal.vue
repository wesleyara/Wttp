<script setup lang="ts">
/**
 * Aba Auth no nível de pasta/collection (EP-07-T03) — mesmo `AuthConfigEditor` da
 * request, só que gravando em `folder.yaml` via `useTreeStore` em vez de numa aba.
 * Aberto pelo menu de contexto de uma pasta em `AppShell.vue`.
 */
import type { AuthConfig } from "@shared";

import { useTreeStore } from "@renderer/stores/tree";
import { computed } from "vue";

import AuthConfigEditor from "./AuthConfigEditor.vue";
import WButton from "./WButton.vue";
import WModal from "./WModal.vue";

const tree = useTreeStore();

const auth = computed<AuthConfig>({
  get: () => tree.authEditData?.auth ?? { type: "inherit" },
  set: value => {
    if (tree.authEditData) tree.authEditData.auth = value;
  },
});

function close(): void {
  tree.closeAuthEditor();
}

function save(): void {
  void tree.saveFolderAuth(auth.value);
}
</script>

<template>
  <WModal :open="tree.authEditPath !== null" title="Auth" @close="close">
    <AuthConfigEditor
      v-if="tree.authEditPath"
      v-model="auth"
      :path="tree.authEditPath"
      self-label="This folder"
    />
    <template #footer>
      <WButton variant="ghost" @click="close">Cancel</WButton>
      <WButton variant="primary" @click="save">Save</WButton>
    </template>
  </WModal>
</template>
