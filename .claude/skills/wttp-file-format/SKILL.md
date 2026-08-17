---
name: wttp-file-format
description: Lê, grava, valida ou migra os arquivos YAML de workspace do Wttp. Use ao mexer em src/main/storage, no parser ou serializer, ao adicionar campo a request/folder/environment/workspace, ou ao alterar a especificação do formato. Garante serialização determinística, diffs limpos e que segredos não vazem para o Git.
---

# Formato de arquivo do Wttp

Especificação: [docs/file-format.md](../../../docs/file-format.md) — leia a seção relevante antes de editar.

Estes arquivos vão para o Git do usuário. Um bug aqui aparece como diff sujo em pull request alheio, ou como perda de dados.

## As sete regras

Cada uma existe por um motivo concreto. Nenhuma é negociável.

1. **`wttp: 1` é a versão do schema.** Mudança incompatível incrementa e exige migrador em `src/main/storage/migrations/`. Versão maior que a suportada → erro claro, nunca adivinhação.

2. **Serialização determinística.** Ordem de chaves **definida em código**, não a ordem de inserção do objeto. Ler e salvar sem alterar nada produz bytes idênticos. É o que impede o Wttp de poluir o diff do usuário.

3. **`seq` manda na ordenação.** Nunca infira ordem de nome de arquivo ou de `readdir`.

4. **`enabled: false` preserva a linha.** Desabilitar um header o mantém no arquivo. Apagar é outra ação.

5. **Segredos jamais em YAML.** `secret: true` grava valor vazio; o valor vai para o keychain sob `wttp:<workspaceId>:<env>:<name>`.

6. **Nome de arquivo é derivado; `name` é a verdade.** `Login` → `login.req.yaml`, mas o rótulo autoritativo é o `name` dentro do YAML.

7. **Campos desconhecidos são preservados.** Chave que esta versão não entende é mantida e regravada — assim um usuário numa versão antiga não destrói dados de um colega numa versão nova.

## Ao adicionar um campo

1. Atualize [docs/file-format.md](../../../docs/file-format.md) **primeiro** — a especificação lidera, o código segue.
2. Adicione o tipo em `@shared`.
3. Insira o campo na ordem de chaves do serializer, na posição que fizer sentido para leitura humana.
4. Trate a ausência do campo em arquivos existentes — campo novo é sempre opcional, ou tem migrador.
5. Escreva o teste de round-trip.

Campo novo **não** incrementa `wttp:`. Só mudança que quebra a leitura por versões anteriores incrementa.

## Teste de round-trip

Todo tipo de arquivo tem um. É o teste que protege a regra 2:

```ts
it("round-trips sem alterar bytes", async () => {
  const original = await readFile(fixture, "utf8");
  const parsed = parseRequest(original);
  expect(serializeRequest(parsed)).toBe(original);
});
```

Se falhar, o problema está no serializer — nunca "conserte" a fixture para o teste passar.

## Escrita em disco

- **Atômica**: arquivo temporário + rename. Interromper o app durante um save nunca pode deixar arquivo truncado.
- Caminhos de arquivo em bodies são **relativos à raiz do workspace**. Recuse qualquer caminho que escape dela.
- Slug de nome com colisão resolvida por sufixo; trate caracteres reservados do Windows (`< > : " / \ | ? *`).
- Blocos literais (`|`) para body, scripts e docs — nunca string escapada de uma linha só, que é ilegível no diff.

## Validação

Arquivo inválido **não** derruba o workspace. O nó é marcado como inválido na árvore, com mensagem, caminho e linha; o resto continua utilizável.

```
users/list-users.req.yaml:7
  SCHEMA_INVALID — "method" deve ser um método HTTP válido (recebido: "GETT")
```

Nenhuma exceção não tratada escapa da camada de storage.

## Checklist

- [ ] Especificação atualizada antes do código
- [ ] Ordem de chaves explícita no serializer
- [ ] Teste de round-trip byte a byte passa
- [ ] Campos desconhecidos sobrevivem a um ciclo de leitura e escrita
- [ ] Nenhum valor secreto no YAML, verificado por teste
- [ ] Escrita atômica
- [ ] Alterar um campo produz diff de uma linha
