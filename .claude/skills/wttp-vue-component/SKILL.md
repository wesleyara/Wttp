---
name: wttp-vue-component
description: Cria ou edita componentes e páginas Vue do Wttp. Use ao mexer em qualquer arquivo .vue, ao criar um componente base W*, uma tela em pages/, ou ao estilizar com Tailwind no renderer. Garante script setup tipado, tokens semânticos em vez de cor crua, densidade correta e verificação nos dois temas.
---

# Componente Vue no Wttp

Contexto: [arch-docs/design-system.md](../../../arch-docs/design-system.md) · [arch-docs/conventions.md](../../../arch-docs/conventions.md)

## Estrutura

Ordem dos blocos: `script → template → style`. O bloco `style` normalmente não existe — Tailwind resolve.

```vue
<script setup lang="ts">
import { computed } from "vue";

import type { HttpMethod } from "@shared";

const props = withDefaults(defineProps<{ method: HttpMethod; compact?: boolean }>(), {
  compact: false,
});

const emit = defineEmits<{ select: [method: HttpMethod] }>();
</script>

<template>
  <button
    class="rounded-md px-2 py-1 text-xs font-medium text-method-get hover:bg-surface-3"
    type="button"
    @click="emit('select', props.method)"
  >
    {{ props.method }}
  </button>
</template>
```

Props sempre type-only (`defineProps<{...}>()`), nunca declaração em runtime.

## Nomenclatura

| Tipo                 | Convenção                                      | Onde           |
| -------------------- | ---------------------------------------------- | -------------- |
| UI base reutilizável | prefixo `W` — `WButton`, `WTree`               | `components/`  |
| Domínio              | sem prefixo — `RequestUrlBar`, `ResponsePanel` | `components/`  |
| Tela roteada         | sufixo `Page` — `WorkspacePage`                | `pages/`       |
| Composable           | prefixo `use` — `useResizeObserver`            | `composables/` |

## Estilo — a regra que mais se quebra

**Nunca use cor crua da escala.** `bluewood-900`, `brand-blue-500` e hex literais são proibidos em arquivos `.vue`. Sempre o token semântico:

| Papel                               | Classe                                   |
| ----------------------------------- | ---------------------------------------- |
| Fundo da aplicação                  | `bg-surface-1`                           |
| Painel                              | `bg-surface-2`                           |
| Hover, linha selecionada, aba ativa | `bg-surface-3`                           |
| Borda                               | `border-subtle` / `border-strong`        |
| Texto                               | `text-1` / `text-muted` / `text-faint`   |
| Acento, link, seleção               | `text-accent` / `bg-accent`              |
| Foco                                | `ring-focus`                             |
| Método HTTP                         | `text-method-get` … `text-method-delete` |
| Status                              | `text-status-2xx` … `text-status-5xx`    |

Cor crua só aparece na definição dos tokens, em `tailwind.config.js`.

## Densidade

O Wttp é denso, não é landing page.

- Texto de UI: `text-sm`. Labels, abas e itens de árvore: `text-xs`.
- Código, URL, body: `font-mono text-[13px]`.
- Linha de árvore ou de tabela: 28px. Barra de ferramentas ou aba: 32px.
- Raio padrão `rounded-md`.

Nenhum estilo global por seletor de elemento. Se precisar de algo repetido, é um componente, não uma regra CSS.

## Dados

O componente **não** chama `window.wttp.*`. Ele lê e escreve pela store Pinia do domínio. Ver a skill `wttp-ipc-channel`.

## Acessibilidade

- `focus-visible` sempre visível: `focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2`. Nunca `outline: none` sem substituto.
- Elemento clicável é `<button>` com `type="button"`, não `<div>` com `@click`.
- Cor nunca é o único portador de informação — método aparece como texto, status como número, erro tem ícone.
- Ícone sem texto precisa de `aria-label`.
- Alvo de clique com no mínimo 24×24px de área efetiva.

## Antes de considerar pronto

- [ ] `<script setup lang="ts">`, props type-only, blocos na ordem certa
- [ ] Zero cor crua; só tokens semânticos
- [ ] Densidade e tamanhos de fonte conforme acima
- [ ] Verificado **nos dois temas** — não presuma, alterne e olhe
- [ ] Navegável por teclado com foco visível
- [ ] `yarn lint` passa (ordem de imports e de classes Tailwind são `error`)
