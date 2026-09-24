# Primeiro workspace

Um workspace é só uma pasta de arquivos YAML — sem conta, sem sincronização na nuvem.

Na primeira execução o Wttp mostra a tela inicial:

- **Create workspace** — cria uma pasta nova com um `wttp.yaml`. Antes, defina a **pasta
  raiz de workspaces** em **Preferências → Workspaces**; os workspaces novos ficam em
  `<pasta raiz>/wttp/`.
- **Open workspace** — aponta para uma pasta que já tem um `wttp.yaml` (um workspace
  clonado do Git, por exemplo). Se a pasta não for um workspace, o app oferece
  inicializá-la.
- **Import** — converte uma collection do Postman, Insomnia, OpenAPI ou um comando cURL
  num workspace novo. Veja [Importadores](./importadores).

Workspaces abertos recentemente aparecem em **Recent**, e os que estão na pasta raiz
aparecem em **Workspaces**.

## A árvore

A barra lateral mostra collections, pastas e requests. No botão **+** você cria uma
**collection**, **pasta**, **request** ou **importa** algo para dentro do workspace.

- **Clique** numa request abre uma aba de _preview_ (título em itálico); **duplo clique**
  — na árvore ou na própria aba — fixa a aba.
- **Menu de contexto** (botão direito): nova request/pasta, configurações, renomear
  (`F2`), duplicar (`Ctrl/Cmd+D`), mover ou copiar para…, mostrar no gerenciador de
  arquivos e excluir (`Delete`, vai para a lixeira do sistema).
- **Arrastar e soltar** reordena e move; com **Ctrl/Cmd+clique** você seleciona vários
  itens e arrasta o grupo inteiro.
- **Filtrar…** no topo filtra a árvore por nome.
- **Busca rápida** (`Ctrl/Cmd+P`) encontra qualquer request por nome, caminho ou URL.

## Abas e sessão

Cada request abre na sua aba. Clique direito numa aba para **Fechar**, **Fechar outras**
ou **Fechar todas**; arraste para reordenar. Ao fechar o app, as abas voltam do jeito
que estavam — inclusive o que você digitou e não salvou (a aba reaparece marcada como
suja).

## Workspace de exemplo

O repositório traz `examples/postman-echo-demo/`, com duas collections — **Basics**
(GET/POST simples) e **Auth flow** (Basic herdado da collection, e um Login → Bearer
check que guarda o token e autentica a request seguinte) — tudo contra
`https://postman-echo.com`, sem conta nem chave de API. Basta **Open workspace** nessa
pasta.
