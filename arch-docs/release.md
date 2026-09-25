# Release

Como versões do Wttp são numeradas, registradas no [CHANGELOG.md](../CHANGELOG.md),
empacotadas, assinadas e publicadas.

---

## Publicar uma versão

```sh
yarn release 0.4.0 --dry-run   # só mostra a seção que seria gerada
yarn release 0.4.0             # CHANGELOG.md + package.json + cli/package.json, commit e tag
git push origin <branch> v0.4.0
```

[`scripts/release.mjs`](../scripts/release.mjs) exige working tree limpo e tag inédita,
gera a seção da versão com o [git-cliff](https://git-cliff.org) (`npx`, versão fixa no
script; config em [`cliff.toml`](../cliff.toml)) a partir dos Conventional Commits desde a
última tag, cola logo abaixo de `## [Unreleased]` no [`CHANGELOG.md`](../CHANGELOG.md),
sobe `version` do app e do `wttp-cli` juntos, e cria o commit `chore(release): v<versão>`
e a tag anotada. Nada é empurrado — dá tempo de revisar e editar o texto (o changelog é
lido por usuários; commits vagos como "fix: adjust ui" são filtrados pelo `cliff.toml`,
mas vale reler). Editou? `git commit --amend` e `git tag -f -a v<versão> -m v<versão>`
antes do push.

Empurrar a tag dispara [`.github/workflows/release.yml`](../.github/workflows/release.yml):
lint/typecheck/test rodam de novo (uma tag pode apontar pra um commit que nunca passou
pela `main`), **Linux e Windows** empacotam e sobem os instaladores + um
`SHA256SUMS-<SO>.txt` para o mesmo release do GitHub, e a seção da versão no
`CHANGELOG.md` (`node scripts/changelog.mjs section v<versão>`) vira o corpo do release —
o mesmo texto que o site de documentação mostra em `/changelog` (pt-BR) e
`/en/changelog`, via `<!--@include-->`. **O release sai como rascunho**
(`releaseType: draft` em `electron-builder.yml`) — alguém revisa e clica em "Publish
release" no GitHub à mão. O workflow recusa uma tag cuja versão não bate com o
`package.json`.

**macOS é opcional.** Sem certificado Developer ID o `.dmg` é bloqueado pelo Gatekeeper, e
o runner macOS é o mais caro. Para incluí-lo numa versão: Actions → Release → Run workflow,
com a tag e `macos` marcado — reaproveita o mesmo release rascunho. Sem `.dmg` publicado
não há `latest-mac.yml`, então o auto-update não oferece aquela versão a usuários de Mac.

### Versões retroativas (0.1.0 e 0.2.0)

O histórico anterior ao primeiro release foi versionado depois do fato: `v0.1.0` marca o
fim do MVP (commit "add launch materials"), `v0.2.0` o Collection Runner + CLI e `v0.3.0`
o primeiro `chore(release)`. As seções dessas três versões no `CHANGELOG.md` foram
escritas à mão a partir dos commits e não são regeneradas.

`v0.1.0`/`v0.2.0` não geram instaladores e seus releases no GitHub são só de notas. Cuidado
ao empurrá-las: num push de tag o GitHub roda o `release.yml` **do commit taggeado**, e o
desses dois commits é a versão antiga, que buildaria e publicaria os três SOs. A guarda do
job `meta` só vale para o workflow atual (ex.: um `workflow_dispatch` com essas tags). Por
isso, uma única vez, com o GitHub Actions desligado no repositório inteiro (Settings →
Actions → General; `gh workflow disable` não serve porque o `release.yml` ainda nem está na
branch padrão nem rodou, então pode não estar registrado):

```sh
gh api -X PUT repos/wesleyara/Wttp/actions/permissions -F enabled=false
git push origin v0.1.0 v0.2.0
gh api -X PUT repos/wesleyara/Wttp/actions/permissions -F enabled=true
for v in v0.1.0 v0.2.0; do
  node scripts/changelog.mjs section "$v" > "/tmp/notes-$v.md"
  gh release create "$v" --verify-tag --title "$v" --notes-file "/tmp/notes-$v.md"
done
```

`v0.3.0` já tem o workflow novo: empurrá-la gera o primeiro release rascunho de verdade,
com instaladores de Linux e Windows.

---

## Assinatura de código

Sem assinatura, o instalador dispara alarmes do SO (SmartScreen no Windows, Gatekeeper
no macOS) que assustam um usuário comum. `yarn build:win`/`build:mac`/`build:linux`
funcionam sem nenhum certificado — só saem sem assinar, o que é o comportamento
esperado para um clone local ou um fork de contribuidor externo. A assinatura de
verdade só acontece com os secrets do repositório configurados (abaixo), lidos pelo
[CI](../.github/workflows/ci.yml) e pelo `electron-builder` automaticamente via
variáveis de ambiente — nenhuma delas está hardcoded em `electron-builder.yml`.

### Windows (Authenticode)

Um certificado de assinatura de código (`.pfx`/`.p12`) de uma CA reconhecida pela
Microsoft. Duas opções:

- **OV (Organization Validation).** ~US$70–250/ano dependendo da CA (DigiCert,
  Sectigo, etc.). SmartScreen ainda mostra um aviso nas primeiras semanas/downloads até
  o certificado acumular reputação.
- **EV (Extended Validation).** ~US$300–500/ano, exige verificação mais rigorosa da
  organização (documentos, telefone). Reputação instantânea no SmartScreen, mas
  normalmente vem num token de hardware (USB), o que complica automação em CI — a
  maioria dos provedores de EV para CI oferece HSM em nuvem (custo adicional).

Secrets do repositório:

| Secret             | Conteúdo                                |
| ------------------ | --------------------------------------- |
| `CSC_LINK`         | Certificado `.pfx` codificado em base64 |
| `CSC_KEY_PASSWORD` | Senha do arquivo `.pfx`                 |

`electron-builder` lê essas duas variáveis automaticamente (nenhuma flag adicional).

### macOS (Developer ID + notarização)

Requer uma conta paga no [Apple Developer Program](https://developer.apple.com/programs/)
(US$99/ano) para gerar um certificado **Developer ID Application**. A notarização em si
não tem custo adicional além disso — é um serviço da Apple que escaneia o binário
assinado.

Secrets do repositório:

| Secret                        | Conteúdo                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `CSC_LINK`                    | Certificado Developer ID Application (`.p12`) em base64                      |
| `CSC_KEY_PASSWORD`            | Senha do `.p12`                                                              |
| `APPLE_ID`                    | Apple ID (e-mail) da conta de desenvolvedor                                  |
| `APPLE_APP_SPECIFIC_PASSWORD` | Senha de app específica (não a senha da conta) — gerada em appleid.apple.com |
| `APPLE_TEAM_ID`               | Team ID de 10 caracteres (developer.apple.com/account, seção Membership)     |

Com essas cinco variáveis presentes, `electron-builder` assina e notariza
automaticamente (`mac.notarize` não é setado em `electron-builder.yml` — deixado sem
valor de propósito, porque `notarize: false` desligaria a notarização mesmo com os
secrets presentes). Sem elas, o build macOS sai sem assinar e sem notarizar, sem erro.

### Linux

Sem assinatura de código — não é uma convenção do ecossistema Linux para `.deb`/
`.AppImage` da forma que Windows/macOS exigem. `.deb` é distribuído como está;
`.AppImage` já embute um hash de integridade próprio.

### Entitlements do macOS

`build/entitlements.mac.plist` só tem as três entitlements que o _hardened runtime_ do
Electron exige para o V8 rodar (`allow-jit`, `allow-unsigned-executable-memory`,
`allow-dyld-environment-variables`) — nenhuma delas concede privilégio além do que o
próprio motor JavaScript precisa. Não habilitamos o **App Sandbox** completo
(`com.apple.security.app-sandbox` + `network.client` +
`files.user-selected.read-write`): fora da Mac App Store ele é opcional, e o Wttp deixa
o usuário apontar `workspacesRootDir` para qualquer pasta persistida entre reinícios
(`useSettingsStore`) — sob App Sandbox isso exigiria _security-scoped bookmarks_ para
sobreviver a um restart do app, mudança de arquitetura sem relação com empacotamento e
não verificável sem um Mac real neste ambiente. Fica registrado aqui como trabalho
futuro caso o Wttp precise entrar na Mac App Store.

---

## Segredos nunca no repositório

Nenhum certificado, senha ou token entra em `electron-builder.yml`, em código ou em
qualquer arquivo versionado — sempre via `secrets.*` do GitHub Actions, lidos como
variável de ambiente pelo `electron-builder` no momento do build. Configurar em
Settings → Secrets and variables → Actions do repositório.

---

## Verificação (pendente de certificado real)

`yarn build:win`/`build:mac` sem os secrets configurados foram verificados neste
ambiente (Linux, sem macOS/Windows nativos): o build completa e produz um instalador
utilizável, sem assinatura — confirma "build sem certificado continua funcionando".
**A parte inversa — build assinado não dispara SmartScreen/Gatekeeper — não foi
verificada**: exige um certificado real (custo listado acima) e, para o Gatekeeper, um
Mac de verdade. Fica como pendência explícita até o dono do repositório decidir investir
nos certificados; os passos acima já deixam o CI pronto para usá-los assim que
existirem.
