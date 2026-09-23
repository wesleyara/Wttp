---
name: wttp-clicklocal-task
description: Executa uma task do Wttp rastreada no board ClickLocal "Wttp mcp" (mcp__clicklocal__*), não no arch-docs/backlog. Use sempre que pedirem para implementar, continuar, checar ou fechar "a task N"/"o card N" — desde que o usuário tenha dito que task agora significa card do ClickLocal. Garante que o card é lido antes de codar e que, ao concluir, é sempre movido para a coluna certa e comentado com o que foi feito.
---

# Executar uma task via ClickLocal

Decisão do usuário (2026-09-23): a partir de agora, "task" sem mais contexto se refere a
um **card do ClickLocal**, não a um ID `EP-XX-TYY` do `arch-docs/backlog/`. Use esta skill no
lugar de `wttp-task` para esses pedidos. Um pedido com ID explícito (`EP-03-T02`)
continua sendo `wttp-task`, arquivo local.

## 0. Localizar o board

O board de trabalho é **"Wttp mcp"**. Não assuma o ID — boards existem para outros
projetos do usuário no mesmo ClickLocal (ex.: "my workspace", "testspace"), que não têm
relação com este repositório. Se o ID do board não estiver óbvio da conversa, chame
`clicklocal_list_boards` e confirme pelo nome antes de listar cards.

Colunas típicas desse board (confirme com `clicklocal_get_board`, os IDs podem mudar):

| Coluna        | Uso                                                  |
| ------------- | ----------------------------------------------------- |
| `TO-DO`       | tasks/épicos ainda não iniciados                       |
| `Bugs`        | defeitos reportados (prints, sintoma, causa raiz)      |
| `In-progress` | em andamento — mover para cá ao começar                |
| `Testing`     | implementado, falta validar (ex.: verificação visual)  |
| `Done`        | concluído e verificado                                 |

## 1. Ler o card

`clicklocal_get_card({ cardId })` com o ID citado. Se o pedido não trouxer ID, pergunte
ou liste (`clicklocal_list_cards`) e confirme com o usuário qual card.

Leia o card inteiro: título, descrição (geralmente markdown com sintoma/causa
raiz/escopo a definir), subtasks, comentários. Cards deste board tendem a ter escopo
mais solto que uma task do backlog formal — "Escopo a definir na task" é comum; nesse
caso, define o escopo você mesmo a partir da descrição e do código atual, e registra a
decisão no comentário final (passo 5), não em silêncio.

**Cruzamento com o backlog.** Se a descrição do card referencia um ID `EP-XX-TYY`
(muitos cards deste board são espelhos de épicos/tasks do `arch-docs/backlog/`), abra o
arquivo do épico e trate as duas fontes juntas: o card é o rastreamento do dia a dia, o
`arch-docs/backlog/*.md` continua sendo a especificação técnica e a fonte que o `CLAUDE.md`
resume. Task do backlog concluída via um card **também** precisa do fechamento normal do
backlog (status `Concluída` no arquivo do épico e no `README.md`, nota no `CLAUDE.md` se
o épico terminou) — mover o card não substitui isso.

## 2. Começar

Mova o card para **In-progress**: `clicklocal_update_card({ cardId, columnId: <id de
In-progress> })`. Isso sinaliza no board que a task está sendo trabalhada, antes de
tocar em código.

## 3. Implementar

Mesmas regras de sempre: fique dentro do que o card pede, siga
[arch-docs/conventions.md](../../../arch-docs/conventions.md), use a skill específica do assunto
quando aplicável (`wttp-vue-component`, `wttp-ipc-channel`, `wttp-file-format`,
`wttp-importer`).

Card de **bug**: a descrição costuma ter só o sintoma (e um print via
`![](/api/attachments/N)` — são anexos do próprio ClickLocal, não precisam ser abertos
para entender o texto ao redor, mas ajudam se o sintoma for visual). Investigue a causa
raiz no código antes de corrigir, e registre sintoma → causa → correção no comentário
final, no mesmo formato que os cards já fechados neste board usam (veja exemplos na
coluna Done).

## 4. Validar

```sh
yarn lint
yarn typecheck
yarn test
```

Depois confira o que o card pede, item por item, do mesmo jeito que `wttp-task` cobra
para critérios de aceite formais — mesmo quando o card não lista bullets explícitos,
extraia critérios verificáveis da descrição antes de considerar pronto.

## 5. Fechar

1. **Sempre** mova o card para a coluna correta ao concluir — nunca deixe em
   `In-progress`:
   - Tudo verificado de fato → **Done**.
   - Implementado mas com verificação pendente que este ambiente não consegue fazer
     (ex.: janela real do Electron, multi-SO — mesma pendência que os épicos do
     `CLAUDE.md` já registram) → **Testing**, não Done. Não force Done só para fechar.
2. **Sempre** comente no card o que foi feito (`clicklocal_add_comment`) — é
   obrigatório, não opcional, e vale para qualquer coluna de destino (Done, Testing) e
   também quando a task para no meio por um bloqueio (nesse caso o comentário diz o
   que foi feito até ali e qual é o bloqueio). Uma task fechada sem comentário não está
   fechada. O comentário segue o padrão dos cards já fechados neste board e cobre:
   - **o que mudou** e por quê (para bug: sintoma → causa raiz → correção);
   - **arquivos-chave** tocados;
   - **como foi validado** (`lint`/`typecheck`/`test`, e o que foi conferido item a item);
   - **decisões de escopo** tomadas por conta própria, quando o card era solto;
   - **pendências explícitas** (nunca finja que algo foi verificado sem ter sido).
3. Se o card mapeia para uma task do backlog, feche também lá (ver passo 1) — commit
   normal do projeto, `Refs EP-XX-TYY` no corpo, conforme `wttp-task`.
4. Se durante o trabalho aparecer algo fora do escopo do card, não faça em silêncio: ou
   é pequeno e você menciona ao relatar, ou vira um card novo (`clicklocal_create_card`)
   na coluna `TO-DO`/`Bugs` apropriada.

## Card sem escopo claro ou dependência bloqueada

Se o card depende de algo ainda não pronto (outro card em `TO-DO`, ou uma task do
backlog `Pendente` que o código exige), pare e diga qual é o bloqueio antes de
implementar pela metade — mesmo critério de `wttp-task`. Registre o bloqueio num
comentário do card (passo 5.2) e deixe-o na coluna em que faz sentido, não em
`In-progress`.
