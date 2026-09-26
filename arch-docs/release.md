# Release

Como versões do Wttp são numeradas, registradas no [CHANGELOG.md](../CHANGELOG.md),
empacotadas, assinadas e publicadas.

---

## Publicar uma versão

### 1. Escolher o tipo: patch, minor ou major

O Wttp segue [Semantic Versioning](https://semver.org/lang/pt-BR/): `MAJOR.MINOR.PATCH`.
O script calcula o número a partir do `version` atual do `package.json`:

| Comando              | Exemplo (a partir de 0.3.0) | Quando usar                                                                |
| -------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `yarn release patch` | 0.3.0 → **0.3.1**           | Só correções (`fix:`), nada novo para o usuário aprender                   |
| `yarn release minor` | 0.3.0 → **0.4.0**           | Pelo menos uma funcionalidade nova (`feat:`), sem quebrar nada existente   |
| `yarn release major` | 0.3.0 → **1.0.0**           | Algo deixa de funcionar como antes (formato em disco, CLI, API de scripts) |

**Enquanto o Wttp for `0.x`**, a convenção é mais frouxa: uma mudança incompatível entra
num **minor** (0.3 → 0.4), não num major, e o `1.0.0` fica reservado para quando o formato
em disco e a CLI forem considerados estáveis. O `CHANGELOG.md` avisa isso no topo.

Na dúvida, olhe o que entraria (passo 2): se tem `### Added`, é minor; só `### Fixed`, patch.

"Incompatível" no Wttp quer dizer principalmente:

- **Formato em disco** ([file-format.md](file-format.md)): um campo que muda de
  significado, ou mudança que exige migrador e incrementa `wttp:`.
- **CLI `wttp run`**: flag removida/renomeada, exit code ou formato de reporter diferente.
- **API de scripts** (`wttp.*`, `req`, `res`, `expect`): algo removido ou com
  comportamento diferente.

Número explícito também funciona (`yarn release 0.5.0`, `yarn release 1.0.0-rc.1`), útil
para pré-releases ou para pular versões.

### 2. Conferir o que vai entrar (dry run)

```sh
git checkout develop
git pull
yarn release minor --dry-run
```

Mostra a versão calculada (`0.3.0 → 0.4.0`) e a seção que o
[git-cliff](https://git-cliff.org) geraria ([`cliff.toml`](../cliff.toml)) a partir dos
Conventional Commits desde a última tag: `feat:` vira **Added**, `fix:` **Fixed**,
`refactor:` **Changed**; `chore:`/`test:`/`ci:` e commits vagos ficam de fora. Não grava
nada. Se sair "no user-facing commits since the last tag", não há o que lançar.

### 3. Criar a versão

```sh
yarn release minor
```

Exige working tree limpo e tag inédita. Faz, localmente:

1. insere a seção nova logo abaixo de `## [Unreleased]` no [`CHANGELOG.md`](../CHANGELOG.md);
2. sobe `version` em `package.json` e `cli/package.json` (app e `wttp-cli` andam juntos);
3. cria o commit `chore(release): v0.4.0` e a tag anotada `v0.4.0`.

Nada é enviado ainda. Releia o `CHANGELOG.md` — é o texto que o usuário lê no GitHub, no
site de documentação (`/changelog`, `/en/changelog`) e no auto-update. Para ajustar
(reescrever uma linha, juntar duas, adicionar um parágrafo de resumo no topo da seção):

```sh
# edite CHANGELOG.md
git add CHANGELOG.md
git commit --amend --no-edit
git tag -f -a v0.4.0 -m v0.4.0
```

Desistiu? `git tag -d v0.4.0 && git reset --hard HEAD~1` desfaz tudo (só antes do push).

### 4. Enviar

```sh
git push origin develop v0.4.0

git checkout main
git merge --ff-only develop
git push origin main
git checkout develop
```

A `main` avança por fast-forward (sem merge commit), então a tag fica na ponta dela.
Nunca pelo botão de merge de PR do GitHub, que criaria um merge commit.

### 5. Acompanhar o build

O push da tag dispara [`.github/workflows/release.yml`](../.github/workflows/release.yml)
(**Actions → Release**, ~10–20 min):

1. `meta` confere que a versão do `package.json` bate com a tag;
2. `quality` roda lint/typecheck/test de novo;
3. `draft` cria o release **rascunho** `v0.4.0`, com a seção da versão do `CHANGELOG.md`
   como descrição — uma vez só, antes dos builds, para os sistemas não criarem um
   rascunho cada um em paralelo;
4. `build` gera os instaladores de **Linux** (`.AppImage`, `.deb`) e **Windows** (`.exe`)
   e sobe para esse rascunho, com um `SHA256SUMS-<SO>.txt` por sistema.

Falhou? Corrija na `develop` com um commit normal; se o release ainda não foi publicado,
mova a tag para o commit novo (`git tag -f -a v0.4.0 -m v0.4.0` e
`git push --force origin v0.4.0`) — se o GitHub não disparar de novo, rode à mão em
**Actions → Release → Run workflow**, com `tag: v0.4.0`. Se já foi publicado, não mexa na
tag: lance um patch.

**macOS (opcional).** Sem certificado Developer ID o `.dmg` é bloqueado pelo Gatekeeper, e
o runner macOS é o mais caro, então não entra por padrão. Para incluí-lo: **Actions →
Release → Run workflow**, `Use workflow from: main`, `tag: v0.4.0`, `macos` marcado — o
`.dmg` vai para o mesmo release. Sem ele não há `latest-mac.yml`, e o auto-update não
oferece a versão a usuários de Mac.

### 6. Publicar

**Releases** → rascunho `v0.4.0` → lápis (Edit): confira os anexos e o texto, marque
**Set as the latest release** e **Publish release**. Só a partir daqui a versão é pública
e o auto-update dos usuários (`electron-updater`) passa a oferecê-la.

### Pré-release (opcional)

`yarn release 1.0.0-rc.1` cria uma versão de teste. No passo 6, marque **Set as a
pre-release** em vez de "latest": fica disponível para download, mas o auto-update não a
oferece a quem está numa versão estável. Depois, `yarn release 1.0.0` fecha a versão final.

### Resumo

```sh
yarn release <patch|minor|major> --dry-run   # confere
yarn release <patch|minor|major>             # changelog + versão + commit + tag
git push origin develop v<versão>
git checkout main && git merge --ff-only develop && git push origin main && git checkout develop
# GitHub: Actions → Release verde → Releases → publicar o rascunho
```

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

Cuidado com secret **ausente**: no GitHub Actions ele chega como string vazia, não como
variável indefinida, e o electron-builder trata `CSC_LINK=""` como certificado presente
(resolve o caminho vazio para a pasta do projeto e falha com `<repo> not a file`). Por
isso os passos de build do `ci.yml` e do `release.yml` apagam as variáveis de assinatura
vazias antes de chamar o `yarn`.

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
