# EP-07 — Autenticação

**Status:** Pendente · **Alvo:** v0.1 · **Depende de:** EP-06

Quase toda API real exige autenticação. Sem isto, o usuário monta o header `Authorization` à mão em cada request.

Referência: [file-format.md §4](../file-format.md)

---

### EP-07-T01 — Modelo e herança de auth

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-06-T01

**Objetivo.** Definir auth uma vez na collection e usar em todas as requests.

**Escopo.**

- `AuthConfig` em `@shared` como union por `type`: `none`, `inherit`, `bearer`, `basic`, `apikey`.
- Resolução da herança subindo request → pasta → pasta pai → collection; `inherit` é o padrão de request nova.
- `none` corta explicitamente a herança.
- Serialização conforme o formato de arquivo.

**Critérios de aceite.**

- [ ] Herança resolvida corretamente com três níveis de pasta
- [ ] `none` numa request ignora a auth da collection
- [ ] Nenhuma auth em lugar nenhum resulta em requisição sem header, sem erro

---

### EP-07-T02 — Aplicação no engine

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-07-T01, EP-03-T02

**Objetivo.** A auth vira header ou query no momento certo.

**Escopo.**

- Aplicar auth **depois** da resolução de variáveis — o token normalmente é `{{access_token}}`.
- `bearer` → `Authorization: Bearer <token>`; `basic` → base64 de `user:pass`; `apikey` → header ou query, conforme `in`.
- Header `Authorization` definido à mão na request tem precedência sobre a auth configurada.

**Critérios de aceite.**

- [ ] Os três tipos verificados contra servidor de teste
- [ ] `basic` codifica corretamente caracteres não-ASCII na senha
- [ ] Header manual vence a configuração, com aviso na UI
- [ ] Credencial não aparece em log nem em mensagem de erro

---

### EP-07-T03 — Aba Auth

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-07-T02, EP-02-T03

**Objetivo.** Configurar auth pela interface, em qualquer nível.

**Escopo.**

- Aba Auth da request com seletor de tipo e campos correspondentes; suporte a `{{variáveis}}` em todos.
- Mesma aba disponível em pasta e collection.
- Modo `inherit` mostra de onde a auth vem e qual tipo será aplicado, em somente leitura.
- Senhas e tokens mascarados por padrão.

**Critérios de aceite.**

- [ ] `inherit` informa a origem efetiva, não só a palavra "inherit"
- [ ] Trocar o tipo preserva o que já foi preenchido nos outros tipos
- [ ] Campo mascarado tem botão revelar e não é copiado por acidente

---

### EP-07-T04 — Indicador de auth na request

**Status:** Pendente · **Tamanho:** P · **Depende de:** EP-07-T03

**Objetivo.** Saber se a request está autenticada sem abrir a aba.

**Escopo.**

- Badge na aba Auth indicando o tipo efetivo e se é herdado.
- Aviso quando a auth depende de variável não resolvida.

**Critérios de aceite.**

- [ ] O tipo efetivo é visível sem abrir a aba
- [ ] Auth com variável não resolvida é sinalizada antes do envio
