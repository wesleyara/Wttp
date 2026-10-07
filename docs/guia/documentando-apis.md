# Documentando suas APIs

A documentação mora **no mesmo YAML da request**, versionada junto com o código — o
oposto de um wiki que envelhece. Dá para documentar cada request, cada pasta e cada
collection, ler tudo como um documento só dentro do app e exportar para quem não usa o
Wttp.

## Escrevendo

Na request, a aba **Docs**; na pasta ou collection, a aba **Overview**. É um editor de
markdown com duas abas, **Editor** e **Preview**, e um botão para expandir a prévia em
tela cheia.

- A barra de ferramentas cobre negrito, itálico, sublinhado, tachado, títulos, listas,
  lista de tarefas e o menu **Insert** (citação, código, link, imagem, tabela, diagrama e
  fórmula).
- Blocos de código têm realce de sintaxe, ` ```mermaid ` desenha diagramas e fórmulas
  funcionam com KaTeX — tudo empacotado no app, nada é baixado da internet.
- O menu **⋯ (More tools)** reúne atalhos: _Destaques_ (nota, dica, atenção, perigo),
  data e hora, emoji de status e prioridade, modelos (bug report, ata de reunião),
  maiúsculas/minúsculas, blocos extras (bloco recolhível, marca-texto, tecla, linha
  divisória) e copiar o markdown.
- **`{{variáveis}}` aparecem na prévia com o valor do environment ativo.** Variáveis
  **Secret** aparecem como `••••` e as que não resolvem ficam destacadas, como escritas.
- O texto é gravado como um bloco literal legível (`docs: |`), então o `git diff` mostra
  o markdown linha a linha.

## Imagens e vídeos

Anexos ficam na pasta **`attachments/`**, na raiz do workspace, e **vão para o Git** junto
com os YAMLs — quem clona o repositório vê as mesmas imagens.

- **Colar ou arrastar** uma imagem no editor anexa e insere a referência.
- O **clipe** da barra de ferramentas abre o seletor de arquivos (vários de uma vez) — é
  o caminho para **vídeos**, que colar e arrastar não cobrem.
- Tipos aceitos: `png`, `jpg`, `gif`, `webp`, `svg`, `mp4` e `webm`. Limite de **50 MB por
  arquivo**; acima disso o Wttp recusa e sugere [Git LFS](./versionamento#anexos) — vídeos
  grandes pesam no repositório de quem clona.
- O arquivo é gravado como `nome-1a2b3c4d.png` (o sufixo vem do conteúdo). Anexar o mesmo
  arquivo duas vezes dá um arquivo só, sem diff.
- No markdown a referência é `![descrição](attachments/nome-1a2b3c4d.png)`. A extensão
  decide: `mp4` e `webm` viram um player com controles, o resto vira imagem.

### Removendo anexos

**Apagar a referência do texto não apaga o arquivo.** O mesmo anexo pode estar em vários
`docs`, a edição é desfazível e o Git já guarda o arquivo. Limpar é uma ação à parte:

- O **clipe na barra de status** (canto direito), **Clean unused attachments…** no menu
  **+** da árvore e na busca rápida (`Ctrl+P`) abrem a lista do que nenhum `docs` cita
  mais, com miniatura e tamanho. Tudo vem marcado; desmarque o que quiser manter e
  confirme em **Move to trash**.
- Os arquivos vão para a **lixeira do sistema**, então dá para restaurar. Numa máquina sem
  lixeira o Wttp apaga de vez e avisa na hora.
- Conta como "em uso" qualquer menção a `attachments/arquivo` — em imagem, link ou bloco
  de código — no `docs` salvo de todo o workspace e também no das abas abertas, ainda que
  não salvas.
- Quando uma referência sai de um `docs` salvo e o anexo fica sem uso, aparece um aviso com
  o botão **Review**. Anexos que já estavam sem uso quando você abriu o workspace não geram
  aviso. O Wttp nunca apaga nada sozinho.

## Lendo a documentação

Clique direito numa pasta ou collection → **Read docs**. A aba que abre mostra a
collection como um documento: um **índice** à esquerda e, ao lado, a documentação da pasta
seguida das requests.

- Toda request aparece com a **assinatura mínima** — método, URL e params —, mesmo sem
  `docs`.
- Cada uma traz um **exemplo de requisição** (cURL, fetch ou axios, à escolha) e a
  **última resposta** registrada no histórico. Se a request nunca foi enviada, o painel
  avisa. **Refresh examples** relê o histórico.
- Ler não mexe nas abas de trabalho: elas continuam como estavam.

## Exportando

Na aba de leitura, **Export HTML** e **Export Markdown**.

- **HTML:** um único arquivo, sem CDN, que abre offline — índice navegável, busca, tema
  claro/escuro e os exemplos de cURL, fetch e axios de cada request. Imagens vão
  embutidas; vídeos até **8 MB** também, e acima disso o player dá lugar a um aviso.
- **Markdown:** um arquivo `.md` com o mesmo conteúdo. As referências a anexos continuam
  relativas, então leve a pasta `attachments/` junto.

**O que nunca sai no export:**

- valores de variáveis — ficam como `{{variável}}`, nunca o valor do environment;
- valores literais de autenticação e de headers sensíveis (`Authorization`, `Cookie`,
  `X-API-Key`, qualquer um com `token`, `secret` ou `password` no nome), que viram `****`.
  Uma referência `{{variável}}` é preservada;
- respostas executadas — o export documenta a request, não o que ela devolveu.
