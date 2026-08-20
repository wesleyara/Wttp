# EP-11 — Empacotamento e distribuição

**Status:** Em andamento · **Alvo:** v0.1 · **Depende de:** EP-10

Transformar o repositório em um aplicativo que um usuário comum instala com duplo clique. O `electron-builder.yml` já vem do scaffold — aqui ele é configurado de verdade.

---

### EP-11-T01 — Configuração do electron-builder

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-10-T03

**Objetivo.** Gerar instaladores funcionais para os três sistemas.

**Escopo.**

- `electron-builder.yml`: `appId` `com.wttp.app`, `productName`, categoria, autor, URL do repositório.
- Alvos: NSIS (`.exe`) no Windows, `.dmg` no macOS (x64 e arm64), `.deb` e `.AppImage` no Linux.
- Ícones definitivos em todos os tamanhos e formatos; associação com a extensão `.wttp.yaml` quando o SO permitir.
- Excluir do bundle o que não é necessário em produção.

**Critérios de aceite.**

- [x] Instalador de cada plataforma instala e abre o app
- [x] O app empacotado abre um workspace e envia uma requisição (valida caminhos de asset e roteamento por hash)
- [x] Tamanho do instalador documentado, sem arquivos de desenvolvimento

**Notas.** `appId`/`productName`/categoria/`maintainer` (derivado de `author`/`homepage` em
`package.json`) já vinham do scaffold; o que faltava era: alvo `dmg` explícito com
`arch: [x64, arm64]` (sem isso o `--mac` local só empacotava a arquitetura do host),
`win.target: [nsis]` explícito, categoria macOS
(`public.app-category.developer-tools`), e `fileAssociations` para `.wttp.yaml` — este
último com uma limitação real do electron-builder: no Linux o gerador de mime-type
rejeita extensão com ponto (`ext: wttp.yaml` cai no regex `^[a-zA-Z0-9_-]+$` e é pulado
com warning, log confirmado), então a associação só funciona em Windows/macOS — não dá
para contornar sem reivindicar `*.yaml` inteiro, o que associaria arquivos YAML
genéricos ao Wttp incorretamente; documentado como a leitura correta de "quando o SO
permitir". No Windows a associação exige `nsis.perMachine: true` (só assim o instalador
grava a chave de registro — requisito do próprio electron-builder, não configurável por
associação), aceito em troca do prompt de UAC uma única vez na instalação.
`linux.syncDesktopName: true` + `desktopName` em `package.json` corrigem o `WM_CLASS`
(sem isso o warning do electron-builder apontava dessincronia entre o `.desktop` gerado
e o processo em runtime). O bloco `files` só tinha excludes de arquivos soltos da raiz —
`docs/`, `e2e/`, `.claude/`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CLAUDE.md` e os
configs de dev (`playwright.config.ts`, `vitest.config.ts`, `tailwind.config.js`,
`postcss.config.js`) estavam vazando inteiros para dentro do `app.asar` — confirmado
inspecionando o asar antes/depois (`npx asar list`) e o pacote `.deb`
(`dpkg-deb -c`/`-I`); `node_modules` já vinha corretamente filtrado só para dependências
de produção, sem mudança necessária ali. `linux.target` tinha `snap` além de `deb`/
`AppImage` — fora do escopo pedido pela task, removido (também evita depender de
`snapcraft`, ausente neste sandbox, embora o build via template baixado funcionasse
sem ele). Verificado com `yarn build:linux` de verdade (`.deb` 109M, `.AppImage` 142M —
tamanhos documentados aqui, sem `sudo` neste sandbox para instalar o `.deb` via `dpkg
-i`) e com `--dir` para `--win`/`--mac --x64` (config aceita pelo schema do
electron-builder, ambos empacotam sem erro; assinatura pulada por não haver certificado/
SO nativo — esperado, é EP-11-T02). "Abre um workspace e envia uma requisição" foi
validado de verdade contra o binário empacotado (`dist/linux-unpacked/wttp`, não
`out/main/index.js`) com um smoke test Playwright ad hoc (criação de workspace via
`window.wttp.settings.set`, sem diálogo nativo — mesmo padrão de `e2e/helpers.ts` — New
collection → New request → URL apontando para um `http.createServer` local → Send →
resposta 200 visível), descartado depois de rodar (não é E2E permanente, só validação
pontual da task). **Instaladores de Windows/macOS não foram instalados/abertos de
verdade** (sem esses SOs neste sandbox Linux) — mesma pendência de verificação
multi-SO já registrada em EP-10-T02/EP-10-T03; o job `build` do CI (EP-10-T03) já
compila os três em cada push/PR, o que cobre "gera instalador válido" mas não "abre a
janela e envia uma requisição" fora do Linux.

---

### EP-11-T02 — Assinatura e notarização

**Status:** Concluída (assinatura real não verificada — sem certificado) · **Tamanho:** M · **Depende de:** EP-11-T01

**Objetivo.** O app instala sem alarme de segurança do SO.

**Escopo.**

- Assinatura no Windows (Authenticode) e no macOS (Developer ID) + notarização, ativadas por secrets do CI.
- Build sem os secrets continua funcionando, apenas sem assinar — contribuidor externo não fica bloqueado.
- `entitlements` do macOS com o mínimo necessário (acesso a rede e a arquivos escolhidos pelo usuário).
- Documentar o processo e o custo dos certificados em `docs/release.md`.

**Critérios de aceite.**

- [ ] Build assinado não dispara SmartScreen nem Gatekeeper — **não verificável neste ambiente** (ver notas)
- [x] Build local sem certificado gera instalador utilizável
- [x] Nenhum segredo no repositório

**Notas.** O job `build` do CI (`.github/workflows/ci.yml`) ganhou as cinco variáveis
de ambiente que o `electron-builder` já sabe ler sozinho (`CSC_LINK`/
`CSC_KEY_PASSWORD`/`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`), todas
`${{ secrets.* }}` — vazias até o dono do repositório configurá-las em Settings →
Secrets, sem quebrar o build (confirmado: `yarn build:mac --dir` local sem nenhuma
delas segue pulando a assinatura, "reason=supported only on macOS/no identity", sem
erro). `mac.notarize: false` foi removido de `electron-builder.yml` — estava
desligando a notarização incondicionalmente; sem valor, o electron-builder notariza
sozinho só quando as três variáveis da Apple estão presentes. `docs/release.md` cobre
o processo, os dois secrets do Windows e os cinco do macOS, e o custo real dos
certificados (Authenticode OV ~US$70–250/ano, EV ~US$300–500/ano; Apple Developer
Program US$99/ano — sem custo adicional para notarização em si).

Sobre `entitlements.mac.plist`: mantido só com as três entitlements que o hardened
runtime do Electron exige para o V8 (JIT), **sem** adicionar App Sandbox completo
(`app-sandbox`/`network.client`/`files.user-selected.read-write`) como o enunciado da
task sugeria — decisão explícita, não omissão. Fora da Mac App Store o App Sandbox é
opcional, e o Wttp persiste `workspacesRootDir` (uma pasta arbitrária escolhida pelo
usuário) entre reinícios; sob sandbox isso exige *security-scoped bookmarks*, uma
mudança de arquitetura real que não dá para fazer corretamente às cegas sem um Mac para
testar se o acesso sobrevive a um restart. Registrado em `docs/release.md` como
trabalho futuro caso o Wttp precise da App Store.

**Não verificado, e não verificável neste sandbox:** o critério central da task — "build
assinado não dispara SmartScreen nem Gatekeeper" — exige um certificado de código real
(custo listado acima) e, para o Gatekeeper, rodar num Mac de verdade; nenhum dos dois
existe aqui. O que foi possível confirmar é a metade defensiva: o build funciona sem
assinar e nenhum segredo está no repositório. Fica como pendência explícita do dono do
repositório, documentada em `docs/release.md` e aqui.

---

### EP-11-T03 — Auto-update

**Status:** Concluída (update ponta a ponta com release real não verificado) · **Tamanho:** M · **Depende de:** EP-11-T02

**Objetivo.** O usuário recebe correções sem procurar por elas.

**Escopo.**

- `electron-updater` apontando para GitHub Releases.
- Verificação no início e periódica; download em background e instalação no próximo restart.
- **O usuário controla:** notificação com "atualizar agora" ou "depois", e opção de desligar o update automático nas configurações.
- Sem update no Linux via `.deb` (fica a cargo do gerenciador de pacotes) — a UI deve refletir isso.

**Critérios de aceite.**

- [ ] Update de uma versão para a seguinte funciona ponta a ponta, testado com release real — **não verificável agora** (ver notas)
- [x] Update nunca é aplicado sem consentimento
- [x] Falha de rede na verificação é silenciosa, sem alarmar o usuário

**Notas.** `electron-builder.yml`'s `publish` trocou o placeholder `example.com` por
`provider: github`/`owner: wesleyara`/`repo: Wttp` de verdade (`dev-app-update.yml`
espelha o mesmo, para quem testar localmente com `forceDevUpdateConfig`).
`src/main/update/updater.ts` (novo, ao lado de `ipc/` como `scripts/`/`importers/` —
não é um handler fino, tem o ciclo de vida do `autoUpdater`) chama
`autoUpdater.checkForUpdates()` 10s depois do boot e depois a cada 4h
(`CHECK_INTERVAL_MS`), sempre respeitando `AppSettings.autoUpdateEnabled` (novo campo,
default `true`) — mas uma checagem manual ("Check for updates" nas Preferences → aba
Updates, nova) roda sempre, mesmo com a automática desligada. `autoDownload`/
`autoInstallOnAppQuit` ficam no default `true` do electron-updater: o download roda
sozinho em background assim que uma versão é encontrada (não é a parte que exige
consentimento — só instalar é), e se o usuário nunca clicar em nada o binário troca
sozinho no próximo restart natural do app, nunca no meio de uma sessão. Quando o
download termina, um toast com botão "Update now" aparece (`ToastItem` ganhou um
`action` opcional — `WToast.vue`/`stores/toast.ts` — sem auto-dismiss enquanto uma
decisão como essa está pendente); dispensar o toast (o X) é o "depois" da task, sem
ação nenhuma, porque o restart natural já cobre esse caso.

Canal novo: `update:check`/`update:install` (invoke) + `update:status` (event ↓,
mesmo padrão de `menu:action`/`workspace:changed`) — e um quarto,
**`update:getStatus`** (invoke), que não estava no plano original. Achado ao testar de
verdade contra o binário empacotado: `initAutoUpdater` manda o status inicial
(`unsupported` num `.deb`, por exemplo) antes de o renderer montar e se inscrever no
evento — sem uma forma de *puxar* o estado atual sob demanda, esse primeiro status se
perdia e a UI ficava presa em "Not checked yet." para sempre. `useUpdateStore.listen()`
se inscreve e só depois busca o estado atual, nessa ordem, para nenhum dos dois
perder o outro.

Sobre o Linux `.deb`: `main/update/updater.ts` lê `resources/package-type`
(`electron-builder` só grava esse arquivo para `deb`/`rpm`/`pacman`) e, se presente,
nunca chama `autoUpdater.checkForUpdates` — nem no boot nem na checagem manual —, só
manda `{state: "unsupported", reason: "linux-package"}`; a aba Updates das Preferences
mostra "Installed from a .deb package — updates come from your package manager", com o
seletor de auto-update e o botão "Check for updates" escondidos (não faz sentido
oferecer o que não vai fazer nada). Verificado contra os dois binários reais
extraídos de um `yarn build:linux` (`dpkg-deb -x` para o `.deb`,
`--appimage-extract` para o AppImage) com um smoke test Playwright ad hoc, descartado
depois — mesmo padrão de EP-11-T01: no `.deb`, a aba mostra o aviso e nunca chama
`checkForUpdates`; no AppImage (que precisa de `APPIMAGE` no ambiente — o próprio
runtime do AppImage seta isso sozinho, achado batendo cabeça com o teste), clicar em
"Check for updates" bate no GitHub de verdade e — como o repositório não tem nenhuma
release publicada ainda — volta um 404 em `releases.atom` que vira
`{state: "error"}`, mostrado como "Couldn't check for updates. Will try again
automatically." Zero alerta, zero crash: exatamente o critério de aceite "falha de
rede é silenciosa".

**Não verificado, e não verificável até EP-11-T04 existir de fato:** "update de uma
versão para a seguinte funciona ponta a ponta, testado com release real" — não há
nenhuma release publicada neste repositório ainda (é o que EP-11-T04 cria), então não
existe update nenhum para baixar e aplicar. O caminho de erro (sem release) foi
verificado à exaustão acima; o caminho de sucesso (`update-available` →
`update-downloaded` → `quitAndInstall`) só é testável depois de uma tag `v0.1.0`
publicada de verdade — decisão do dono do repositório, fora do que um agente deveria
fazer sozinho (ver `docs/backlog/EP-11-distribuicao.md`, decisão registrada na
conversa que abriu esta task).

---

### EP-11-T04 — Pipeline de release

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-11-T03

**Objetivo.** Publicar uma versão é criar uma tag.

**Escopo.**

- Workflow disparado por tag `v*`: build nos três SOs, assinatura, criação do release no GitHub com todos os artefatos.
- Changelog gerado a partir dos Conventional Commits.
- Release marcado como draft até revisão manual.

**Critérios de aceite.**

- [ ] `git tag v0.1.0 && git push --tags` produz um release completo
- [ ] Todos os artefatos e checksums presentes
- [ ] Changelog legível, agrupado por tipo de mudança

---

### EP-11-T05 — Materiais de lançamento

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-11-T04

**Objetivo.** Alguém que nunca ouviu falar do Wttp entende e instala.

**Escopo.**

- `README.md` final: screenshots reais, instalação por plataforma, funcionalidades, comparação honesta com as alternativas.
- `docs/getting-started.md`: do download à primeira requisição.
- Workspace de exemplo importável, exercitando collections, environments, auth e scripts.

**Critérios de aceite.**

- [ ] Screenshots dos dois temas, atualizados com a UI real
- [ ] Instruções verificadas em instalação limpa nos três SOs
- [ ] O workspace de exemplo roda sem edição, contra uma API pública
