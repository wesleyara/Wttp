# Backlog

Épicos e tasks do Wttp. A ordem dos épicos é a ordem de execução recomendada — cada um depende do anterior estar razoavelmente estável.

Para executar uma task, use a skill `wttp-task`.

---

## MVP — v0.1

| Épico                                       | Título                                                         | Status                                  |
| ------------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| [EP-01](EP-01-fundacao.md)                  | Fundação electron-vite                                         | Concluída                               |
| [EP-02](EP-02-design-system.md)             | Design system e shell de layout                                | Concluída (verificação visual pendente) |
| [EP-03](EP-03-nucleo-http.md)               | Núcleo HTTP                                                    | Concluída (verificação visual pendente) |
| [EP-04](EP-04-persistencia.md)              | Formato de arquivo e persistência                              | Concluída                               |
| [EP-05](EP-05-workspaces-collections.md)    | Workspaces, collections e tabs                                 | Concluída (verificação visual pendente) |
| [EP-06](EP-06-environments-variaveis.md)    | Environments e variáveis                                       | Concluída (verificação visual pendente) |
| [EP-06.1](EP-06.1-refinamentos-ux.md)       | Correções e refinamentos de UX (não planejado)                 | Concluída (verificação visual pendente) |
| [EP-07](EP-07-autenticacao.md)              | Autenticação                                                   | Concluída (verificação visual pendente) |
| [EP-08](EP-08-importadores.md)              | Importadores                                                   | Concluída (verificação visual pendente) |
| [EP-08.1](EP-08.1-sessao-historico-docs.md) | Sessão, histórico, documentação e preferências (não planejado) | Em andamento                            |
| [EP-09](EP-09-scripts.md)                   | Scripts e testes                                               | Concluída (verificação visual pendente) |
| [EP-10](EP-10-qualidade-ci.md)              | Qualidade e CI                                                 | Pendente                                |
| [EP-11](EP-11-distribuicao.md)              | Empacotamento e distribuição                                   | Pendente                                |

## Pós-MVP

| Épico                                  | Título                          | Alvo  |
| -------------------------------------- | ------------------------------- | ----- |
| [EP-12](EP-12-documentacao-apis.md)    | Documentação de APIs            | v0.2  |
| [EP-13](EP-13-runner-cli.md)           | Collection Runner e CLI         | v0.2  |
| [EP-14](EP-14-extensibilidade.md)      | Extensibilidade e plugins       | v0.3  |
| [EP-15](EP-15-protocolos-avancados.md) | Protocolos e recursos avançados | v0.3+ |
| [EP-16](EP-16-terminal-git.md)         | Terminal e versionamento Git    | v0.2  |

---

## Convenções

**IDs.** `EP-03` identifica o épico, `EP-03-T02` a task. IDs nunca são reaproveitados — task cancelada continua no arquivo, marcada como `Cancelada`.

**Status.** `Pendente` · `Em andamento` · `Concluída` · `Bloqueada` · `Cancelada`

**Tamanho.** `P` (até meio dia) · `M` (1–2 dias) · `G` (3+ dias; considere quebrar).

**Dependências** apontam sempre para trás. Nenhuma task depende de outra em épico posterior — se isso acontecer, a ordem dos épicos está errada.

**Definition of Done global.** Além dos critérios de aceite da task:

- [ ] `yarn lint` e `yarn typecheck` passam
- [ ] `yarn test` passa; lógica nova em `main/` tem teste
- [ ] UI nova verificada nos temas dark e light
- [ ] documentação afetada (`docs/`, `CLAUDE.md`) atualizada no mesmo commit
- [ ] status da task atualizado aqui e no arquivo do épico

---

## Template de task

```markdown
### EP-03-T02 — Título da task

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-03-T01

**Objetivo.** Uma frase sobre o resultado observável.

**Escopo.**

- itens concretos, com caminhos de arquivo

**Critérios de aceite.**

- [ ] verificáveis, um por linha

**Fora de escopo.** o que explicitamente não entra
```
