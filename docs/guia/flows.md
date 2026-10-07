# Flows

Um **flow** é um cenário que junta requests de **qualquer pasta** num desenho (um canvas): faça login, pegue o token da resposta, use-o para criar um recurso, espere um job terminar, e siga por um caminho ou outro conforme o resultado — tudo **sem escrever script** (e, quando precisar de lógica livre, com um nó de **função** em JavaScript).

Diferente do [Runner](/guia/runner-e-ci), que roda uma pasta em ordem e depende de `wttp.setVar` nos scripts, o flow declara a passagem de dados e as decisões — fica visível, executável com um clique e versionado no Git.

[[toc]]

## Passo a passo: login → criar → buscar

Este exemplo monta o clássico "faz login, cria um usuário, busca o usuário criado" passando o token e o id entre as requests.

1. **Crie o flow.** No menu **+** da barra lateral, escolha **Novo flow**. Ele aparece na seção **Flows**, abaixo da árvore, e abre numa aba com o canvas vazio.
2. **Traga as requests.** Arraste **Login**, **Criar usuário** e **Buscar usuário** da árvore para o canvas — cada uma vira um nó. (Alternativa: escolha a request no seletor do topo e clique em **Adicionar request**; o nó novo já é ligado ao fim do fluxo.)
3. **Ligue os nós.** Arraste da bolinha à direita de **Login** até **Criar usuário**, e de **Criar usuário** até **Buscar usuário**. As setas definem a ordem.
4. **Execute uma vez** (botão **Executar**). Sem mapeamentos o token ainda não chega às requests seguintes, mas cada nó acende e guarda a resposta — é ela que alimenta o próximo passo.
5. **Ligue os dados.** Marque **Portas de dados**. Cada nó de request passa a mostrar, à esquerda, as `{{variáveis}}` que ele usa e, à direita, os campos da última resposta. **Arraste `data.token` de Login até `token` em Criar usuário.** Execute de novo: agora Criar usuário responde 201 e expõe o `id`. **Arraste `id` de Criar usuário até `user_id` em Buscar usuário.**
6. **Execute.** Os três nós acendem em verde e o resumo mostra "Flow passou". Clique em qualquer nó para ver o que foi enviado e recebido.
7. **Salve** com **Ctrl+S** (ou o botão **Salvar**). O flow vira o arquivo `flows/novo-flow.flow.yaml`, pronto para o `git add`.

Para esperar um job assíncrono antes de seguir, veja [Repetir até](#repetir-ate); para seguir por caminhos diferentes conforme o resultado, veja [Condição](#condicao) e [Função](#funcao).

## A interface

A aba de um flow tem, de cima para baixo:

- **Cabeçalho**: o nome do flow (clique para renomear — o arquivo é renomeado junto), a marca **Alterações não salvas**, o environment ativo (o mesmo do rodapé do app), **Portas de dados**, **Parar na primeira falha**, **Salvar** e **Executar**/**Parar**.
- **Paleta**: o seletor **Escolha uma request…** com **Adicionar request**, e os botões que criam nós de controle: **Condição**, **Repetir até**, **Espera** e **Função**.
- **Resumo do último run**: resultado, quantas requests passaram, duração e, se parou antes, por quê.
- **Canvas**: onde os nós e as setas ficam. **Arraste o fundo** para mover a vista, use a **roda do mouse** para aproximar/afastar (30% a 180%), e o botão de ajuste para enquadrar tudo. Os botões de zoom ficam no canto inferior esquerdo.
- **Painel do nó**: à direita, mostra o nó selecionado — o que ele fez na última execução e os campos para editá-lo.

### Redimensionar o painel do nó

O painel pode ser alargado para caber código (a função) ou condições longas. **Arraste a borda esquerda dele** para os lados. Pelo teclado, foque a borda (Tab) e use **←/→** (com **Shift**, passos maiores) ou **Home/End** para o mínimo e o máximo; **duplo clique** volta ao tamanho padrão. A largura escolhida fica lembrada.

### Selecionar, mover e remover

Clique num nó para selecioná-lo; arraste-o pelo corpo para movê-lo (as posições são gravadas no arquivo e encaixam numa grade). **Delete** remove o nó selecionado (ou use a lixeira no painel). Para tirar uma ligação, clique na seta e aperte **Delete**, ou use **Desconectar** no painel. **Começar por aqui**, no painel, define o nó onde a execução começa (por padrão, o primeiro que você adicionou).

### Salvar

As edições ficam num rascunho: a aba e o cabeçalho mostram a bolinha de "não salvo". **Ctrl+S** grava o arquivo; fechar a aba com alterações pergunta se salva ou descarta. **Executar** roda o que está na tela, salvo ou não.

## Ligar os nós

Cada nó tem uma bolinha de **entrada** à esquerda e uma ou mais de **saída** à direita. Arraste de uma saída até outro nó — soltar na bolinha de entrada ou em qualquer parte do nó liga. Cada saída tem **um único destino**: ligar de novo troca a ligação anterior.

A ordem de execução é o caminho que as setas desenham, a partir do nó inicial. Um nó sem saída ligada **encerra** o flow. Só a **Condição** (duas saídas) e a **Função** (até dez) se dividem em caminhos.

## Passar dados entre as requests

Um **mapeamento** pega um pedaço da resposta de um nó e o guarda numa variável que os nós seguintes leem como `{{variável}}`.

**Pelas portas** (com **Portas de dados** marcado): a coluna da esquerda de cada request lista as `{{variáveis}}` que ela usa; a da direita lista os campos da **última resposta conhecida** — da última execução do flow ou do histórico da request (execute o flow uma vez para vê-los). **Arraste um campo da direita até uma variável de outro nó.** Linhas tracejadas verdes no canvas mostram os mapeamentos existentes.

**Pelo formulário** (sem mouse): selecione o nó de request e use **Mapeamentos** no painel — escolha de onde ler (**Caminho do body**, **Header** ou **Status**) e o nome da variável.

| Origem              | O que escrever                                | Exemplo                                  |
| ------------------- | --------------------------------------------- | ---------------------------------------- |
| **Caminho do body** | um acesso ao JSON da resposta                 | `data.token`, `items[0].id`, `["x-y"].z` |
| **Header**          | o nome do header (sem diferenciar maiúsculas) | `Location`                               |
| **Status**          | nada — o código HTTP                          | —                                        |

O valor vira texto (números e booleanos pelo seu texto, objetos e listas como JSON). Um mapeamento que **não acha o valor** — caminho inexistente, corpo que não é JSON, header ausente — **falha o nó** com uma mensagem, em vez de guardar uma variável vazia. A exceção é o nó cuja saída vai para uma **condição** ou um **repetir até**: aí o aviso aparece no resultado e é a condição que decide o caminho (assim "se criou segue por A, senão por B" funciona mesmo quando a resposta de erro não traz o campo).

As variáveis valem **só durante a execução**: nada é gravado nos seus environments, collections ou arquivos.

## Os nós

### Request

Executa uma request do workspace, exatamente como no envio avulso: auth herdada da pasta, variáveis de collection, scripts de pre-request e de tests. Um nó **referencia** a request — não a copia — então editar a request vale para todo flow que a usa. A mesma request pode aparecer em vários nós.

- **Saída**: uma. **Entrada**: uma.
- Mostra, depois de executar, o status e se passou. No painel: a request enviada, a resposta, as asserções, as variáveis que os mapeamentos guardaram e o corpo da resposta.
- Uma resposta 4xx/5xx sem asserções **não reprova** o nó (mesma regra do Runner); o que reprova é uma asserção que falha, um erro de rede ou um mapeamento sem valor.
- Se a request foi removida por fora, o nó fica marcado com um aviso e o flow não executa até você corrigi-lo. Renomear ou mover a request na árvore atualiza os flows que a citam.

<a id="condicao"></a>

### Condição

Olha a resposta da **última request executada** e escolhe um de dois caminhos.

| Campo              | Valores                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| **Verificar**      | **Código de status**, **Campo do body**, **Header** ou **Asserções passaram**                             |
| **Caminho / nome** | o campo do JSON (`job.state`) ou o nome do header — só para body e header                                 |
| **Operador**       | é igual a, é diferente de, é maior que, é no mínimo, é menor que, é no máximo, contém, existe, não existe |
| **Valor**          | o que comparar (como texto; como número em maior/menor) — não existe para "existe"/"não existe"           |

**Asserções passaram** vale quando a request tem ao menos uma asserção e todas passaram.

- **Saídas**: duas — a bolinha **verde** (verdadeiro) e a **vermelha** (falso). Um ramo sem ligação encerra o flow ali.
- Uma condição sem nenhuma request antes dela falha com uma mensagem (não há resposta para avaliar).
- Condições são **estruturadas, nunca código**: operador + caminho + valor. Para lógica livre, use uma [Função](#funcao).

<a id="repetir-ate"></a>

### Repetir até (poll until)

Reexecuta a **request logo antes dele** até uma condição bater — o jeito de esperar um job assíncrono terminar. Precisa de **exatamente uma** request ligada à entrada dele.

| Campo                       | Regra                                                        |
| --------------------------- | ------------------------------------------------------------ |
| **Condição**                | a mesma de um nó Condição                                    |
| **Espera entre tentativas** | em milissegundos, **mínimo 1000**                            |
| **Máximo de tentativas**    | **obrigatório**, de 1 a 1000 — o nó nunca espera para sempre |

A primeira avaliação usa a resposta que já existe; se não bater, espera o intervalo, reexecuta a request e avalia de novo. Termina na **primeira** vez que a condição bate (nem uma chamada a mais) e segue pela sua única saída. Ao atingir o limite sem bater, o nó **falha** com a mensagem "was not met after N attempts". No painel, o resultado mostra quantas tentativas foram feitas.

### Espera (delay)

Uma pausa fixa, em milissegundos (0 a 600000, ou seja, até 10 minutos). Uma entrada, uma saída.

<a id="funcao"></a>

### Função

Escreve **JavaScript** que decide por qual saída o flow segue — como o nó de função do Node-RED. Você escolhe **quantas saídas** ele tem (de 1 a 10); cada uma é uma bolinha numerada no nó que você liga a um nó. Reduzir o número de saídas remove as ligações das que deixaram de existir.

O código é o **corpo de uma função** e enxerga:

| Nome                                | O que é                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `res`                               | a resposta da última request (`status`, `headers`, `body`, `json`), ou `undefined` se nenhuma rodou ainda  |
| `vars`                              | as variáveis do flow — o que você escrever aqui vale como `{{nome}}` nas próximas requests, sem mapeamento |
| `wttp`, `test`, `expect`, `console` | como num [script de request](/guia/scripts) (o `console.log` aparece no painel do nó)                      |

```js
console.log("status", res.status);
vars.token = res.json.data.token; // vale como {{token}} adiante
if (res.status === 201) return 1; // segue pela saída 1
return 2; // ...ou pela saída 2
```

O que o código **devolve** escolhe o caminho:

| Retorno                                  | Efeito                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| um número `N` (de 1 ao nº de saídas)     | segue pela saída `N`                                                          |
| um array como `[null, x]`                | estilo Node-RED: segue pela **primeira** posição que não é `null`/`undefined` |
| nada, `null` ou `undefined`              | nenhuma saída — o flow **termina ali**, sem erro                              |
| outra coisa, ou uma saída que não existe | o nó **falha** com uma mensagem, e o flow para                                |

O código roda **isolado**, num processo à parte e com timeout (o mesmo dos scripts de request, `scriptTimeout` do workspace): não tem acesso a `require`, `process` nem ao sistema de arquivos. Uma exceção, um erro de sintaxe ou um timeout falham o nó, e o flow para mesmo sem **Parar na primeira falha** — nenhuma saída foi escolhida, então não há para onde seguir. As variáveis escritas até o ponto da falha são mantidas. No painel você edita o código num editor com autocomplete (`res`, `vars`, `wttp`, `console` e atalhos de padrões comuns).

A referência completa da API está em [API de scripts](/guia/api-de-scripts).

## Executar

**Executar** roda o que está na tela no **environment ativo** (o nome aparece no cabeçalho). Cada nó acende conforme roda: **pendente** → **rodando** → **ok** ou **falha**; as setas percorridas ficam destacadas e o ramo que não foi percorrido fica apagado. O resumo no topo mostra o resultado, quantas requests passaram e a duração.

- **Parar** interrompe: aborta a request em andamento e não roda mais nada.
- **Parar na primeira falha** (ligado por padrão): o flow para na primeira request que falhar — os nós seguintes costumam depender dela. Desligado, ele segue pelo caminho mesmo depois de uma falha.
- **Clique num nó** para ver, no painel, a request enviada, a resposta, as asserções, o console, as variáveis que ele guardou e, num repetir até, as tentativas.
- Durante a execução, o canvas fica travado para edição.

### Antes de rodar

O Wttp valida o flow antes de enviar qualquer coisa. Um nó de request cuja request não existe mais, ou um **repetir até** sem uma request logo antes, impedem a execução com uma mensagem apontando o nó.

### Limites

| O quê                        | Limite                                                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passos por execução          | **100** (cada nó executado conta, e cada repetição de um poll também). Ao estourar, o flow para com uma mensagem — protege contra laços infinitos. Mude com `maxSteps` no arquivo (até 1000). |
| Saídas de uma função         | 1 a 10                                                                                                                                                                                        |
| Tentativas de um repetir até | 1 a 1000, intervalo mínimo de 1 s                                                                                                                                                             |
| Espera                       | até 600000 ms                                                                                                                                                                                 |

Um flow **pode ter laços** (ligar um nó de volta a um anterior, por exemplo num ramo "tentar de novo"); o limite de passos garante que ele sempre termina.

## Teclado

Cada nó recebe foco com **Tab** e fica selecionado. Com ele focado:

| Tecla                      | Ação                     |
| -------------------------- | ------------------------ |
| **Shift + setas**          | move o nó (passos de 20) |
| **Delete** / **Backspace** | remove o nó              |

Condições, repetir até, espera, função e mapeamentos têm formulário no painel — **nada exige o mouse**. A borda do painel também é focável (veja [Redimensionar o painel do nó](#redimensionar-o-painel-do-no)).

## O arquivo

Flows moram em `flows/<nome>.flow.yaml`, versionados com o resto do workspace, e você pode editá-los à mão:

```yaml
wttp: 2
name: Create or recover
nodes:
  - { id: login, type: request, request: auth/login.req.yaml, x: 0, y: 0 }
  - { id: create, type: request, request: users/create.req.yaml, x: 280, y: 0 }
  - { id: created, type: condition, when: { source: status, op: eq, value: "201" }, x: 560, y: 0 }
  - id: route
    type: function
    outputs: 2
    code: |
      if (res.status === 409) return 1;
      return 2;
    x: 840
    y: 100
edges:
  - { from: login, to: create }
  - { from: create, to: created }
  - { from: created, to: route, when: false }
mappings:
  - { from: login.res.body.data.token, to: token }
```

Um nó de **função** é gravado em bloco, com o `code` em literal `|`, para o diff continuar legível. Flows criados nas versões anteriores (uma lista linear de requests) abrem normalmente e são migrados para este formato quando você salva. A especificação completa está no formato de arquivo do Wttp (seção 10).

## Solução de problemas

**"O flow não tem nós"** — o flow está vazio. Arraste uma request da árvore para o canvas (o botão **Executar** fica desabilitado enquanto não há nenhum nó).

**O nó tem um triângulo de aviso e o flow não executa** — a request que ele referencia foi removida ou está inválida. Remova o nó ou restaure a request.

**As portas de saída mostram "execute para ver os campos"** — ainda não há uma resposta conhecida para essa request. Execute o flow uma vez (ou envie a request avulsa, que grava no histórico).

**Um mapeamento falhou** — veja a mensagem no painel do nó: caminho inexistente na resposta, corpo que não é JSON ou header ausente.

**O flow parou com "Stopped at the step limit"** — ele provavelmente tem um laço que nunca sai. Confira as ligações, ou aumente `maxSteps` no arquivo se o laço é intencional.

**Uma função falhou com "chose output N, but this node has M outputs"** — o código devolveu uma saída que o nó não tem. Aumente o número de saídas ou corrija o `return`.

Execução paralela de ramos, sub-flows e `wttp run` de flows na CLI ficam para depois.
