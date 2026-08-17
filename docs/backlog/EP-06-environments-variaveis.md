# EP-06 — Environments e variáveis

**Status:** Pendente · **Alvo:** v0.1 · **Depende de:** EP-05

A mesma collection apontando para dev, staging e produção. É o que torna uma collection reutilizável em vez de descartável.

Referência: [file-format.md §8](../file-format.md)

---

### EP-06-T01 — Resolvedor de variáveis
**Status:** Pendente · **Tamanho:** G · **Depende de:** EP-04-T04

**Objetivo.** `{{var}}` vira valor, com precedência correta e sem surpresas.

**Escopo.**
- `src/main/http/resolver.ts` implementando a precedência: `runtime > environment > collection/pasta > workspace > dinâmicas`.
- Resolução recursiva com detecção de ciclo (`a → b → a` reporta erro, não estoura a pilha).
- Variáveis dinâmicas: `$uuid`, `$timestamp`, `$isoTimestamp`, `$randomInt`.
- Retorna também a lista de variáveis **não resolvidas** — a resolução não silencia falhas.
- Aplicado a URL, query, headers, body e configurações de auth.

**Critérios de aceite.**
- [ ] Precedência verificada por teste em todos os cinco níveis
- [ ] Ciclo é detectado e reportado com o caminho envolvido
- [ ] Variável não resolvida **não** vira string vazia
- [ ] `{{$uuid}}` gera um valor novo a cada requisição
- [ ] Escape `\{\{literal\}\}` permite chaves literais

---

### EP-06-T02 — Modelo e persistência de environments
**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-04-T06

**Objetivo.** Environments vivem em disco e respeitam a regra dos segredos.

**Escopo.**
- Leitura e escrita de `environments/*.yaml`; canais `env:list` e `env:save`.
- Variáveis com `secret: true` gravam valor vazio e usam o keychain.
- `defaultEnvironment` do `wttp.yaml` respeitado ao abrir.

**Critérios de aceite.**
- [ ] Round-trip preserva ordem e comentários das variáveis
- [ ] Valor secreto não aparece no YAML, verificado por teste
- [ ] Environment inválido não impede abrir o workspace

---

### EP-06-T03 — Editor de environments
**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-06-T02, EP-02-T03

**Objetivo.** Gerenciar variáveis pela interface.

**Escopo.**
- Modal com lista de environments, CRUD, duplicar.
- `WKeyValueTable` com coluna de secret; valor secreto mascarado, com botão revelar.
- Aba separada para as variáveis globais do workspace.
- Aviso ao duplicar um environment com segredos (os valores não são copiados).

**Critérios de aceite.**
- [ ] Valor secreto nunca é exibido por padrão nem copiado sem ação explícita
- [ ] Nome duplicado de variável é sinalizado
- [ ] Editar reflete imediatamente nas requests abertas

---

### EP-06-T04 — Seletor de environment
**Status:** Pendente · **Tamanho:** P · **Depende de:** EP-06-T03

**Objetivo.** Trocar de ambiente em um clique.

**Escopo.**
- Seletor no cabeçalho com o environment ativo e opção "No environment".
- Escolha persistida por workspace em `.wttp/ui-state.json`.
- Atalho para o editor a partir do seletor.

**Critérios de aceite.**
- [ ] Trocar reavalia todas as previews de variável nas abas abertas
- [ ] Escolha sobrevive ao restart, por workspace
- [ ] Trocar para um environment de produção é visualmente distinto (cor/ícone configurável)

---

### EP-06-T05 — Variáveis na UI
**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-06-T04, EP-03-T04

**Objetivo.** O usuário vê o valor real antes de enviar.

**Escopo.**
- Realce de `{{var}}` nos campos e no editor: resolvida em `accent`, não resolvida em `status-4xx`.
- Tooltip mostrando valor resolvido e a origem (environment, collection, runtime); secreta mostra apenas a origem.
- Autocomplete de variáveis ao digitar `{{`.
- Enviar com variável não resolvida exige confirmação.

**Critérios de aceite.**
- [ ] Variável não resolvida é visualmente óbvia antes do envio
- [ ] Tooltip informa a origem, não só o valor
- [ ] Valor secreto nunca aparece no tooltip
- [ ] Autocomplete lista as variáveis do escopo atual
