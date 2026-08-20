# Release

Como os instaladores do Wttp são assinados, notarizados e publicados. Ver também
[docs/backlog/EP-11-distribuicao.md](backlog/EP-11-distribuicao.md).

---

## Publicar uma versão

`git tag v0.1.0 && git push --tags` — o resto é automático via
[`.github/workflows/release.yml`](../.github/workflows/release.yml) (EP-11-T04):
lint/typecheck/test rodam de novo (uma tag pode apontar pra um commit que nunca passou
pela `main`), os três SOs empacotam e sobem os instaladores + um `SHA256SUMS-<SO>.txt`
para o mesmo release do GitHub, e um changelog agrupado por tipo de commit
(`feat:`/`fix:`/`refactor:`/`docs:`/`test:`/`chore:`, as categorias de
[Conventional Commits](conventions.md#git) deste repositório) vira o corpo do release.
**O release sai como rascunho** (`releaseType: draft` em `electron-builder.yml`) —
alguém revisa o changelog e os artefatos e clica em "Publish release" no GitHub à mão
antes de qualquer usuário ver a versão nova.

`yarn build:<os>` (usado pelo CI normal e por qualquer contribuidor local) nunca
publica nada (`--publish never` explícito) — só `yarn release:<os>`, usado
exclusivamente pelo workflow acima, publica (`--publish always`). A distinção existe
porque, sem ela, o electron-builder detecta `CI=true` e tenta publicar sozinho mesmo
fora de uma tag — quebrava o build normal do CI antes desse fix (achado ao testar,
registrado em EP-11-T04).

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

| Secret             | Conteúdo                                     |
| ------------------- | --------------------------------------------- |
| `CSC_LINK`          | Certificado `.pfx` codificado em base64        |
| `CSC_KEY_PASSWORD`  | Senha do arquivo `.pfx`                        |

`electron-builder` lê essas duas variáveis automaticamente (nenhuma flag adicional).

### macOS (Developer ID + notarização)

Requer uma conta paga no [Apple Developer Program](https://developer.apple.com/programs/)
(US$99/ano) para gerar um certificado **Developer ID Application**. A notarização em si
não tem custo adicional além disso — é um serviço da Apple que escaneia o binário
assinado.

Secrets do repositório:

| Secret                        | Conteúdo                                                          |
| ------------------------------ | ------------------------------------------------------------------ |
| `CSC_LINK`                     | Certificado Developer ID Application (`.p12`) em base64            |
| `CSC_KEY_PASSWORD`             | Senha do `.p12`                                                    |
| `APPLE_ID`                     | Apple ID (e-mail) da conta de desenvolvedor                        |
| `APPLE_APP_SPECIFIC_PASSWORD`  | Senha de app específica (não a senha da conta) — gerada em appleid.apple.com |
| `APPLE_TEAM_ID`                | Team ID de 10 caracteres (developer.apple.com/account, seção Membership) |

Com essas cinco variáveis presentes, `electron-builder` assina e notariza
automaticamente (`mac.notarize` não é setado em `electron-builder.yml` — deixado sem
valor de propósito, porque `notarize: false` desligaria a notarização mesmo com os
secrets presentes). Sem elas, o build macOS sai sem assinar e sem notarizar, sem erro.

### Linux

Sem assinatura de código — não é uma convenção do ecossistema Linux para `.deb`/
`.AppImage` da forma que Windows/macOS exigem. `.deb` é distribuído como está;
`.AppImage` já embute um hash de integridade próprio.

### Entitlements do macOS

`build/entitlements.mac.plist` só tem as três entitlements que o *hardened runtime* do
Electron exige para o V8 rodar (`allow-jit`, `allow-unsigned-executable-memory`,
`allow-dyld-environment-variables`) — nenhuma delas concede privilégio além do que o
próprio motor JavaScript precisa. Não habilitamos o **App Sandbox** completo
(`com.apple.security.app-sandbox` + `network.client` +
`files.user-selected.read-write`): fora da Mac App Store ele é opcional, e o Wttp deixa
o usuário apontar `workspacesRootDir` para qualquer pasta persistida entre reinícios
(`useSettingsStore`) — sob App Sandbox isso exigiria *security-scoped bookmarks* para
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
