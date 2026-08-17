# EP-11 — Empacotamento e distribuição

**Status:** Pendente · **Alvo:** v0.1 · **Depende de:** EP-10

Transformar o repositório em um aplicativo que um usuário comum instala com duplo clique. O `electron-builder.yml` já vem do scaffold — aqui ele é configurado de verdade.

---

### EP-11-T01 — Configuração do electron-builder
**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-10-T03

**Objetivo.** Gerar instaladores funcionais para os três sistemas.

**Escopo.**
- `electron-builder.yml`: `appId` `com.wttp.app`, `productName`, categoria, autor, URL do repositório.
- Alvos: NSIS (`.exe`) no Windows, `.dmg` no macOS (x64 e arm64), `.deb` e `.AppImage` no Linux.
- Ícones definitivos em todos os tamanhos e formatos; associação com a extensão `.wttp.yaml` quando o SO permitir.
- Excluir do bundle o que não é necessário em produção.

**Critérios de aceite.**
- [ ] Instalador de cada plataforma instala e abre o app
- [ ] O app empacotado abre um workspace e envia uma requisição (valida caminhos de asset e roteamento por hash)
- [ ] Tamanho do instalador documentado, sem arquivos de desenvolvimento

---

### EP-11-T02 — Assinatura e notarização
**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-11-T01

**Objetivo.** O app instala sem alarme de segurança do SO.

**Escopo.**
- Assinatura no Windows (Authenticode) e no macOS (Developer ID) + notarização, ativadas por secrets do CI.
- Build sem os secrets continua funcionando, apenas sem assinar — contribuidor externo não fica bloqueado.
- `entitlements` do macOS com o mínimo necessário (acesso a rede e a arquivos escolhidos pelo usuário).
- Documentar o processo e o custo dos certificados em `docs/release.md`.

**Critérios de aceite.**
- [ ] Build assinado não dispara SmartScreen nem Gatekeeper
- [ ] Build local sem certificado gera instalador utilizável
- [ ] Nenhum segredo no repositório

---

### EP-11-T03 — Auto-update
**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-11-T02

**Objetivo.** O usuário recebe correções sem procurar por elas.

**Escopo.**
- `electron-updater` apontando para GitHub Releases.
- Verificação no início e periódica; download em background e instalação no próximo restart.
- **O usuário controla:** notificação com "atualizar agora" ou "depois", e opção de desligar o update automático nas configurações.
- Sem update no Linux via `.deb` (fica a cargo do gerenciador de pacotes) — a UI deve refletir isso.

**Critérios de aceite.**
- [ ] Update de uma versão para a seguinte funciona ponta a ponta, testado com release real
- [ ] Update nunca é aplicado sem consentimento
- [ ] Falha de rede na verificação é silenciosa, sem alarmar o usuário

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
