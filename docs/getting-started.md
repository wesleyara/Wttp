# Getting started

Do download à primeira requisição.

---

## 1. Instalar

| SO          | Arquivo                                  | Como                                                                        |
| ----------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| **Windows** | `Wttp-<versão>-setup.exe`                | Baixe e execute. O instalador pede confirmação (UAC) uma vez.               |
| **macOS**   | `Wttp-<versão>-<arch>.dmg`               | Baixe, abra o `.dmg`, arraste o Wttp para `Applications`.                   |
| **Linux**   | `Wttp-<versão>-amd64.deb` ou `.AppImage` | `.deb`: `sudo dpkg -i Wttp-*.deb`. `.AppImage`: `chmod +x`, depois execute. |

Baixe na [página de Releases](https://github.com/wesleyara/Wttp/releases) do
GitHub — cada release lista os artefatos das três plataformas e um
`SHA256SUMS-<SO>.txt` para conferir a integridade do download antes de instalar
(veja [docs/release.md](release.md)).

---

## 2. Abrir ou criar um workspace

Na primeira execução o Wttp pergunta onde guardar seus workspaces (uma pasta comum,
tipo `~/Wttp` ou dentro de um repositório existente). Depois disso:

- **Create workspace** — cria uma pasta nova com um `wttp.yaml` vazio.
- **Open workspace** — aponta para uma pasta que já tem um `wttp.yaml` (um workspace
  clonado do Git, por exemplo).
- **Import** — converte uma collection do Postman, Insomnia ou um arquivo OpenAPI/cURL
  num workspace novo.

Um workspace é só uma pasta de arquivos YAML — sem conta, sem sincronização na nuvem.
Dá para versionar no Git exatamente como qualquer outro código
([docs/file-format.md](file-format.md)).

---

## 3. Sua primeira requisição

1. No `+` acima da árvore, **New collection** → dê um nome.
2. Com a collection selecionada, **New request**.
3. Escolha o método, digite uma URL (`https://postman-echo.com/get` funciona sem
   nenhuma configuração) e clique **Send**.
4. O corpo, os headers, o status e o tempo de resposta aparecem no painel da direita.
5. `Ctrl/Cmd+S` salva a request como um arquivo `.req.yaml` dentro da collection.

Para ver variáveis, auth e scripts em ação sem digitar nada, abra o workspace de
exemplo:

```
examples/postman-echo-demo/
```

(clonado junto com este repositório, ou baixável avulso da mesma página de
Releases). Ele tem duas collections — **Basics** (GET/POST simples) e **Auth
flow** (Basic auth herdado da collection, e um par Login → Bearer check que
guarda um token em tempo de execução e autentica a request seguinte sozinha) —
tudo contra `https://postman-echo.com`, sem precisar de conta nem chave de API.
Basta **Open workspace** apontando pra essa pasta e mandar ver.

---

## 4. Environments e variáveis

Um environment é um conjunto de variáveis (`{{base_url}}`, `{{api_key}}`, ...) que
você troca com um clique na barra de status — dev, staging, produção. Crie um em
**Manage environments**, uma variável marcada **Secret** nunca é gravada no YAML (vai
para o keychain do SO). Detalhes em [docs/file-format.md §5](file-format.md).

## 5. Auth

Bearer, Basic ou API Key — na request, numa pasta, ou numa collection inteira, com
herança: uma pasta marcada `inherit` (o padrão) usa a auth do nível acima. Ver a aba
**Auth** de qualquer request ou pasta.

## 6. Scripts

Cada request e cada pasta tem um script de pré-requisição e um de teste, JavaScript
puro rodando isolado (nunca `require`, nunca acesso a rede fora do `fetch` da própria
request). `wttp.setVar`/`wttp.getVar` leem e escrevem no environment ativo — é como o
exemplo "Login → Bearer check" acima guarda o token entre uma request e a próxima.
Referência completa em [docs/scripting.md](scripting.md).

---

## Próximos passos

- [docs/file-format.md](file-format.md) — o que cada arquivo do workspace guarda.
- [docs/backlog/README.md](backlog/README.md) — o que já existe e o que vem a seguir.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — quer contribuir com código?
