# EP-14 — Extensibilidade e plugins

**Status:** Pendente · **Alvo:** v0.3 · **Depende de:** EP-13

Permitir que a comunidade estenda o Wttp sem tocar no núcleo. A extensibilidade prometida no [overview](../overview.md).

> **Pré-requisito de projeto:** uma API de plugins é um contrato público — uma vez publicada, quebrá-la custa caro. Este épico só começa quando as interfaces internas (importador, auth, storage) estiverem estáveis por algumas versões.

---

### EP-14-T01 — Arquitetura de plugins

**Status:** Pendente · **Tamanho:** G

**Objetivo.** Definir o contrato antes de escrever o carregador.

**Escopo.**

- Pontos de extensão: importadores, provedores de auth, temas, formatadores de resposta, geradores de snippet.
- Manifesto do plugin com permissões declaradas; versionamento da API com política de compatibilidade.
- Documento de arquitetura em `docs/plugins.md` antes da implementação.

**Critérios de aceite.**

- [ ] Cada ponto de extensão tem interface tipada e exemplo
- [ ] Política de compatibilidade escrita e explícita

---

### EP-14-T02 — Carregamento e isolamento

**Status:** Pendente · **Tamanho:** G · **Depende de:** EP-14-T01

**Objetivo.** Um plugin ruim não compromete o app nem os dados do usuário.

**Escopo.**

- Carregamento a partir do diretório de dados do usuário, com sandbox reutilizando o modelo do script runner (EP-09).
- Permissões consentidas na instalação: rede, filesystem, acesso a segredos.
- Plugin que falha é desabilitado com mensagem, sem derrubar o app.

**Critérios de aceite.**

- [ ] Plugin não alcança segredos sem permissão explícita
- [ ] Crash ou loop infinito de plugin é contido
- [ ] Desabilitar um plugin não exige restart

---

### EP-14-T03 — Gestão de plugins

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-14-T02

**Objetivo.** Instalar e gerenciar plugins pela interface.

**Escopo.**

- Tela de plugins: instalados, permissões, ativar/desativar, atualizar, remover.
- Instalação por npm ou arquivo local.
- Índice comunitário de plugins conhecidos (lista curada em repositório, não marketplace).

**Critérios de aceite.**

- [ ] Instalar, atualizar e remover funcionam sem editar arquivo à mão
- [ ] Permissões de cada plugin visíveis a qualquer momento

---

### EP-14-T04 — Plugins de referência

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-14-T03

**Objetivo.** Provar a API construindo com ela.

**Escopo.**

- Migrar ao menos um importador do núcleo para plugin, validando o contrato.
- Plugin de tema e plugin de provedor de auth (ex.: OAuth 2.0) como exemplos.
- Template de plugin com build e testes prontos.

**Critérios de aceite.**

- [ ] Um importador roda como plugin com paridade de comportamento
- [ ] O template gera um plugin funcional em menos de 5 minutos
