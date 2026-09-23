---
name: wttp-task
description: Executa uma task do backlog do Wttp (EP-XX-TYY). Use quando pedirem para implementar uma task, pegar a próxima do backlog, continuar um épico, ou quando a mensagem citar um ID como "EP-03-T02". Garante que dependências foram checadas, critérios de aceite validados um a um e o status atualizado.
---

# Executar uma task do backlog

## 1. Localizar

Se o ID foi dado, abra `arch-docs/backlog/EP-XX-*.md`. Se pediram "a próxima", abra `arch-docs/backlog/README.md` e pegue a primeira task `Pendente` na ordem dos épicos, cujas dependências estejam `Concluída`.

Leia a task inteira: objetivo, escopo, critérios de aceite e **fora de escopo**.

## 2. Verificar antes de começar

- Todas as dependências (`Depende de:`) estão `Concluída`? Se não, pare e diga qual falta.
- A task referencia um documento (`architecture.md`, `file-format.md`, `design-system.md`)? Leia a seção citada — ela contém as regras que os critérios de aceite cobram.
- O escopo ainda faz sentido diante do código atual? Se o repositório divergiu da task, diga isso antes de implementar, e proponha o ajuste.

## 3. Implementar

Marque a task como `Em andamento` no arquivo do épico e no `README.md`.

Fique dentro do escopo. O bloco "Fora de escopo" existe porque aquele trabalho pertence a outra task — fazer a mais aqui bagunça o backlog e infla o diff.

Siga [arch-docs/conventions.md](../../../arch-docs/conventions.md). Se a task envolve:

| Assunto                                 | Use também a skill   |
| --------------------------------------- | -------------------- |
| componente ou página Vue                | `wttp-vue-component` |
| comunicação main↔renderer               | `wttp-ipc-channel`   |
| leitura/escrita de arquivo de workspace | `wttp-file-format`   |
| importador de formato externo           | `wttp-importer`      |

## 4. Validar

Rode, nesta ordem:

```sh
yarn lint
yarn typecheck
yarn test
```

Depois percorra os critérios de aceite **um por um** e verifique cada um de fato — rodando o app, escrevendo um teste, ou inspecionando o arquivo gerado. Não marque `[x]` no que você não verificou.

Definition of Done global (de `arch-docs/backlog/README.md`):

- [ ] lint, typecheck e test passam
- [ ] lógica nova em `main/` tem teste
- [ ] UI nova verificada em dark **e** light
- [ ] documentação afetada atualizada no mesmo commit

## 5. Fechar

1. Marque cada critério de aceite atendido no arquivo do épico.
2. Status → `Concluída`, no arquivo do épico **e** na tabela do `README.md`.
3. Se o épico terminou, atualize a seção "Estado do projeto" do `CLAUDE.md` raiz.
4. Commit: `feat: <descrição em inglês>` com `Refs EP-XX-TYY` no corpo.

## Se algo não couber

Descobriu trabalho necessário que não está na task? **Não faça em silêncio.** Ou é pequeno e você menciona explicitamente ao relatar, ou é grande e vira uma task nova no épico apropriado — com ID novo, nunca reaproveitado.

Um critério de aceite não pôde ser atendido? Reporte qual e por quê. Task pela metade marcada como concluída é pior que task pendente.
