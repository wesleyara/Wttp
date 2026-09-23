# Autenticação e herança

A aba **Auth** existe em três níveis: **request**, **pasta** e **collection**. Em pastas
e collections abra pelo menu de contexto → **Edit auth**.

## Tipos

| Tipo              | O que envia                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| **None**          | Nada — e **corta a herança**: nenhuma auth de níveis acima é aplicada. |
| **Herdar do pai** | Usa a auth do nível acima (o padrão).                                  |
| **Bearer**        | `Authorization: Bearer <token>`                                        |
| **Basic**         | `Authorization: Basic <base64(usuário:senha)>` (UTF-8)                 |
| **API Key**       | Um header ou query param à sua escolha.                                |

Os campos aceitam `{{variáveis}}` — o normal é guardar o token num environment (como
`{{token}}`, secreta) e referenciá-lo aqui. Campos sensíveis vêm mascarados, com um
botão de revelar por campo.

## Como a herança resolve

De dentro para fora: request → pasta → pasta pai → … → collection. A **primeira camada
que não for `inherit`** decide. Se nenhuma definir, a request sai sem auth — sem erro.
No modo **Herdar do pai** a aba mostra de onde a auth efetiva vem, e a aba **Auth** da request
carrega um selo com o tipo efetivo, com um aviso se depender de variável sem valor.

Um header `Authorization` digitado à mão na aba **Headers** tem prioridade sobre a auth
configurada.
