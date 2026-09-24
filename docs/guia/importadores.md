# Importadores

Traga o que você já tem — sempre para uma **collection nova**, sem tocar no que existe.

| Formato                     | Origem                                                    |
| --------------------------- | --------------------------------------------------------- |
| **Postman Collection v2.1** | `.json` exportado (e o environment do Postman, se houver) |
| **Insomnia v4**             | export `.json`/`.yaml`                                    |
| **OpenAPI 3.x**             | `.json`/`.yaml` — cada operação vira uma request          |
| **cURL**                    | um comando `curl …` colado                                |

## Como importar

- **Sem workspace aberto**: na tela inicial, **Import** — o resultado é um **workspace
  novo**.
- **Com workspace aberto**: **+ → Import** na barra lateral — a collection nova entra na
  raiz do workspace atual.

Cole o conteúdo ou escolha um arquivo; o formato é detectado sozinho. Antes de gravar, o
app mostra uma **prévia da árvore** e um **relatório** do que não pôde ser convertido
(um recurso sem equivalente, por exemplo) — nada some em silêncio.

## Colar um cURL na barra de URL

Para uma request só, não precisa do modal: cole um `curl …` (por exemplo, o "Copy as cURL"
do DevTools do navegador) direto na barra de URL. Método, URL, params, headers, body e auth
são preenchidos de uma vez.

- **Request vazia** (recém-criada): o cURL preenche a própria request.
- **Request com conteúdo**: ela fica intacta, e o cURL vai para uma **request nova** ao
  lado, aberta numa aba própria.
- **Comando que não dá para entender** (sem URL, por exemplo): nada é colado e aparece um
  aviso.

Nos dois primeiros casos a request fica com alterações não salvas; `Ctrl+S` grava.
