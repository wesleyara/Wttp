# Montar e enviar uma request

1. No **+** da árvore, crie uma collection e, dentro dela, uma **request**.
2. Escolha o método, digite a URL (`https://postman-echo.com/get` funciona sem
   configuração) e clique em **Send** — ou `Ctrl/Cmd+Enter`.
3. A resposta aparece no painel ao lado (ou embaixo — o botão da barra de status alterna
   a posição).
4. `Ctrl/Cmd+S` salva como um arquivo `.req.yaml` dentro da collection.

## A configuração da request

| Aba         | O que faz                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Params**  | Query params (tabela sincronizada com a URL) e _path params_ — `:nome` na URL vira um campo.                                                        |
| **Headers** | Headers da request. Marque/desmarque cada linha sem apagá-la.                                                                                       |
| **Body**    | None, JSON, URL Encoded, Raw (texto/XML/HTML, com `Content-Type` à escolha), Multipart (com arquivos) ou Binary. O `Content-Type` acompanha o tipo. |
| **Auth**    | Bearer, Basic, API Key, ou herdar — veja [Autenticação](./autenticacao).                                                                            |
| **Scripts** | Pre-request e post-response — veja [Scripts e testes](./scripts).                                                                                   |
| **Docs**    | Markdown com a documentação da request, gravado no mesmo YAML.                                                                                      |

Pastas e collections têm as suas próprias abas de configuração (variáveis, auth, scripts
e docs) que valem para tudo abaixo delas.

## A resposta

O painel de resposta mostra status, tempo e tamanho, e tem abas:

- **Response** — com realce de sintaxe, visualização **Pretty**/**Raw** e **Preview** para HTML, imagens e
  PDF. **Copy** copia o texto; **Save** grava os bytes originais em disco.
- **Headers** e **Cookies**.
- **History** — as 10 últimas execuções da request, gravadas em disco (segredos e o
  header `Authorization` são mascarados antes). Clique numa entrada para vê-la; limpar
  apaga o histórico daquela request.
- **Tests** — resultado das asserções e o console dos scripts.

Seguir redirects, timeout e validação de TLS são configuráveis por workspace (`wttp.yaml`,
bloco `settings`). Um envio em andamento pode ser cancelado.

## Variáveis na request

Escreva `{{nome}}` em qualquer campo — URL, params, headers, body, auth. Variáveis
resolvidas ficam realçadas, com tooltip do valor e autocomplete ao digitar duas chaves de abertura. Se sobrar
alguma sem valor, o Wttp pergunta antes de enviar. Veja
[Environments e variáveis](./environments).

## Ferramenta JWT

O ícone de chave na barra de status abre a ferramenta JWT: **Decode** mostra header e
payload de qualquer token (qualquer algoritmo, tudo local) e **Encode** assina um token
HS256 com o segredo que você informar.
