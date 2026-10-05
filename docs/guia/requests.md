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

### Comparar duas execuções

Na aba **Histórico**, marque duas execuções e clique em **Comparar**, ou use o ícone de
comparar na mais recente para compará-la com a anterior. O diff mostra o status, os headers e
o body. Num body JSON, a comparação é **por caminho**: a ordem das chaves não importa, e cada
diferença sai como `$.data.items[2].price: 10 → 12`. Um campo que muda sempre (timestamp,
request id, o header `Date`) vira ruído: clique com o botão direito nele (ou no ícone de olho)
e escolha **Ignorar este caminho**. A lista de ignorados fica guardada por request, no seu
computador. **Ignorar headers** esconde todos os headers da comparação.

### Filtrar uma resposta JSON

Numa resposta JSON, o ícone de funil ao lado de **Pretty**/**Raw** (ou `Ctrl+F` com o foco
no body) abre um filtro **JSONPath**: digite `$.data.items[*].id` e o painel mostra só o que
casa, com a contagem de resultados. Funciona com membros (`$.a.b`, `$['a-b']`), índices e
fatias (`[0]`, `[-1]`, `[0:2]`), curingas (`[*]`), busca recursiva (`$..id`) e filtros
(`[?(@.price > 10 && @.active == true)]`). O body original não muda, e limpar o filtro (✕
ou `Esc`) volta à resposta inteira. O último filtro de cada request fica guardado no seu
computador (`.wttp/`, nunca no YAML versionado).

Seguir redirects, timeout e validação de TLS são configuráveis por workspace (`wttp.yaml`,
bloco `settings`). Um envio em andamento pode ser cancelado.

## Variáveis na request

Escreva `{{nome}}` em qualquer campo — URL, params, headers, body, auth. Variáveis
resolvidas ficam realçadas, com tooltip do valor e autocomplete ao digitar duas chaves de abertura. Se sobrar
alguma sem valor, o Wttp pergunta antes de enviar. Veja
[Environments e variáveis](./environments).

## Copiar como cURL

Clique com o botão direito na aba da request ou nela na árvore e escolha **Copiar como
cURL**. Também dá para digitar "curl" na busca rápida (`Ctrl+P`). O comando sai pronto para
colar num terminal bash/zsh e manda a mesma request que o **Send**: variáveis, path params e
auth herdada já resolvidos, com edições ainda não salvas incluídas. Os scripts de
pre-request não rodam.

Por padrão os valores de auth e das variáveis secretas saem como `****`. Para copiar os
valores reais, use a ação separada **Copiar como cURL (com segredos)**. Uma `{{variável}}`
sem valor fica literal no comando, e o aviso diz qual.

## Ferramenta JWT

O ícone de chave na barra de status abre a ferramenta JWT: **Decode** mostra header e
payload de qualquer token (qualquer algoritmo, tudo local) e **Encode** assina um token
HS256 com o segredo que você informar.

## Visualizador de JSON

O ícone `{}` na barra de status abre o visualizador de JSON: cole qualquer documento e
explore na aba **Árvore** (clique direito num valor copia o valor ou o caminho) ou na aba
**Formatado**. **Formatar** e **Minificar** reescrevem o texto colado. Se o JSON for
inválido, a mensagem aponta a linha e a coluna do erro. Funciona sem uma request aberta e
tudo roda local.
