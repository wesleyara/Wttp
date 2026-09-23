# EP-16 — Terminal e versionamento Git

**Status:** Pendente · **Alvo:** v0.2 · **Depende de:** EP-08.1-T05

O workspace já é um diretório de arquivos YAML versionáveis, e o app já cria o
`.gitignore` com `.wttp/` ao inicializá-lo — o que falta é o caminho curto para rodar
`git` sobre ele sem sair do fluxo de trabalho. O Wttp **não** embute um cliente Git:
abre o terminal do sistema já na raiz do workspace aberto, e o usuário usa as
ferramentas que já tem.

Configuração (qual terminal, qual atalho de teclado) vive nas Preferências, na seção
**Shortcuts** criada em [EP-08.1-T05](EP-08.1-sessao-historico-docs.md).

---

### EP-16-T01 — Abrir o terminal do SO na raiz do workspace

**Status:** Pendente · **Tamanho:** M · **Depende de:** —

**Objetivo.** Um canal que abre o terminal do sistema já no diretório do workspace
aberto, nas três plataformas.

**Escopo.**

- `src/main/terminal.ts`: detecção por plataforma — Windows `wt.exe` com fallback em
  `cmd`; macOS `open -a Terminal <dir>`; Linux `$TERMINAL` → `x-terminal-emulator` →
  `gnome-terminal` → `konsole` → `xfce4-terminal`.
- `spawn` com array de argumentos, nunca string de shell; `detached: true` + `unref()`
  para o terminal não morrer junto do app.
- Comando customizado vindo de `AppSettings.terminalCommand` (novo em
  `src/shared/ipc.ts`), com placeholder `{dir}` substituído **como argumento**, não
  concatenado numa linha de shell.
- Canal `terminal:open` (`{ cwd }`, skill `wttp-ipc-channel`), lançando `DomainError`
  legível quando nenhum terminal é encontrado ou o spawn falha.

**Critérios de aceite.**

- [ ] Abre o terminal já na raiz do workspace (ou devolve erro legível quando não há terminal)
- [ ] Comando customizado das Preferências é respeitado, com `{dir}` no lugar certo
- [ ] Fechar o app não fecha o terminal; fechar o terminal não afeta o app
- [ ] Teste unitário da montagem do comando por plataforma, sem spawn real

**Fora de escopo.** terminal embutido dentro da janela do app.

---

### EP-16-T02 — Ícone e comando na UI

**Status:** Pendente · **Tamanho:** P · **Depende de:** EP-16-T01

**Objetivo.** Um clique (ou um atalho) abre o terminal no workspace aberto.

**Escopo.**

- Botão "Open terminal" na toolbar da árvore (`AppShell.vue`), ao lado do menu "+",
  ícone `terminal` do Lucide via `WIcon`.
- Item no menu nativo (`src/main/menu.ts`) e `MenuAction "terminal:open"` novo em
  `src/shared/ipc.ts`, tratado no `menu.listen` de `AppShell.vue`.
- Sem workspace aberto o botão não aparece; falha do spawn vira toast de erro
  (`useToastStore`).

**Critérios de aceite.**

- [ ] Botão e item de menu abrem o mesmo terminal, na raiz do workspace aberto
- [ ] Sem workspace aberto, o botão não aparece e o item de menu não faz nada
- [ ] Falha ao abrir mostra toast de erro com a mensagem do `DomainError`
- [ ] Verificado nos dois temas

---

### EP-16-T03 — Atalho e comando configuráveis nas Preferências

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-16-T02, EP-08.1-T05

**Objetivo.** Escolher qual terminal abrir e com qual tecla, sem editar arquivo de
configuração na mão.

**Escopo.**

- Seção **Shortcuts** das Preferências: campo do comando do terminal
  (`terminalCommand`, com `{dir}`) e o atalho de teclado que dispara `terminal:open`.
- `AppSettings.shortcuts?: Record<string, string>` em `src/shared/ipc.ts` — mapa de
  `MenuAction` para acelerador, com os padrões atuais de `menu.ts` como fallback.
- `buildMenu` passa a ler os aceleradores das settings; o menu é reconstruído
  (`Menu.setApplicationMenu`) no handler de `settings:set`, sem reiniciar o app.
- `WShortcutInput.vue`: captura a combinação de teclas, valida conflito com os
  aceleradores já existentes e tem botão de restaurar o padrão.

**Critérios de aceite.**

- [ ] Definir um atalho novo passa a valer imediatamente, sem reiniciar
- [ ] Combinação já usada por outro comando é recusada, com mensagem apontando o conflito
- [ ] Restaurar o padrão volta ao acelerador de `menu.ts`
- [ ] Comando de terminal e atalho persistem entre sessões
- [ ] Verificado nos dois temas

**Fora de escopo.** UI de Git dentro do app (branch na status bar, `git status`, commit,
push). Se virar demanda, entra como item novo em
[EP-15](EP-15-protocolos-avancados.md), sob o critério de promoção de lá.
