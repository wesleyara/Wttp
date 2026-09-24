# Environments e variáveis

Um **environment** é um conjunto de variáveis (`{{base_url}}`, `{{api_key}}`, …) que você
troca com um clique na barra de status — dev, staging, produção.

## Criar e editar

Na barra de status, **Manage** abre o editor de environments numa aba própria. Lá você
cria, renomeia, duplica e exclui environments e edita as variáveis de cada um: nome,
valor, descrição e se está habilitada.

- Escolha o environment ativo no seletor da barra de status. A escolha é lembrada por
  workspace. Um environment cujo nome contém `prod` ganha o selo **PROD**.
- Uma variável marcada **Secret** **nunca é gravada no YAML**: o valor vai para o keychain
  do sistema (Keychain no macOS, Credential Vault no Windows, libsecret no Linux). Sem
  keychain disponível, o Wttp usa um arquivo em `.wttp/` (que fica fora do Git) e avisa.

## Onde uma variável pode viver

Do mais forte para o mais fraco, quando o mesmo nome aparece em mais de um lugar:

1. **Runtime** — valores definidos por scripts durante a execução.
2. **Environment** ativo.
3. **Pasta / collection** — variáveis do `folder.yaml` (a mais próxima da request vence).
4. **Workspace** — variáveis globais do `wttp.yaml`.
5. **Dinâmicas** — geradas na hora: `{{$uuid}}`, `{{$timestamp}}`, `{{$isoTimestamp}}`,
   `{{$randomInt}}`.

Uma variável pode referenciar outra (`{{base_url}}/v1`); um ciclo é detectado e vira um
erro claro. Variáveis não resolvidas continuam como `{{nome}}` — e o Wttp pede
confirmação antes de enviar.

## Path params

`:id` numa URL como `https://api.exemplo.com/users/:id` vira um campo na aba **Params**.
O valor pode ser uma `{{variável}}`.
