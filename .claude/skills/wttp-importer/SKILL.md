---
name: wttp-importer
description: Adiciona ou corrige um importador de formato externo no Wttp — Postman, Insomnia, OpenAPI, cURL, HAR. Use ao mexer em src/main/importers ou ao dar suporte a um formato novo. Garante o pipeline parse/normalize/emit, fixture real com snapshot e relatório do que não pôde ser convertido.
---

# Importador no Wttp

Importadores são a porta de entrada do produto: ninguém recomeça uma collection de 200 endpoints do zero.

**Princípio:** a importação nunca é silenciosamente parcial. Tudo que não pôde ser convertido aparece no `ImportReport`, com motivo.

## Pipeline

Três fases separadas, em `src/main/importers/<formato>/`:

```
parse      texto bruto → estrutura do formato de origem, validada
normalize  estrutura de origem → modelo do Wttp (@shared)
emit       modelo → arquivos, pela camada de storage do EP-04
```

Separadas porque cada uma falha diferente: `parse` falha por arquivo inválido, `normalize` por incompatibilidade semântica, `emit` por problema de filesystem. Misturar as três produz mensagens de erro inúteis.

O importador **não escreve arquivo diretamente** — `emit` usa a camada de storage. É o que garante que a importação respeite as regras do formato (ver skill `wttp-file-format`).

## Interface

```ts
export interface Importer {
  readonly format: ImportFormat
  detect(payload: string): boolean
  parse(payload: string): SourceDocument
  normalize(doc: SourceDocument): { tree: WorkspaceTree; report: ImportReport }
}
```

`detect` olha o conteúdo, não a extensão — o usuário cola JSON numa caixa de texto tanto quanto escolhe um arquivo.

## O relatório

Toda perda de informação vira uma entrada:

```ts
report.unsupported.push({
  path: "Auth / Login",
  feature: "pm.sendRequest",
  reason: "Requisições dentro de script não são suportadas",
  action: "O código foi preservado como comentário no script",
})
```

Diga também **o que fazer** com o item. "Não suportado" sem saída deixa o usuário travado.

Quando houver equivalente parcial, converta e reporte. Quando não houver, **preserve o original como comentário** — nunca descarte silenciosamente o trabalho de alguém.

## Mapeamentos que exigem atenção

| Origem | Cuidado |
|---|---|
| Variáveis Postman/Insomnia | `{{var}}` já é compatível; template tags do Insomnia (`{% ... %}`) não são — reporte |
| Scripts Postman | `pm.environment.set` → `wttp.setVar`, `pm.test` → `test`, `pm.response` → `res`. O resto vira comentário |
| Auth | Mapeie os tipos suportados; OAuth e afins vão para o relatório até o EP-14 |
| OpenAPI `$ref` | Resolva refs internos; detecte ciclo, não estoure a pilha |
| OpenAPI `servers` | Um environment por servidor, com `base_url` |
| Caminhos de arquivo | Devem virar **relativos à raiz do workspace**; caminho absoluto da máquina de origem vai para o relatório |
| Segredos embutidos | Token hardcoded no arquivo de origem vira variável marcada `secret: true`, com aviso |

## Testes

Todo importador tem:

- **Fixture real** — arquivo exportado de verdade da ferramenta de origem, em `src/main/importers/<formato>/__fixtures__/`. Nunca um exemplo escrito à mão, que não tem as esquisitices do formato real.
- **Teste de snapshot** da árvore normalizada.
- **Teste do relatório** — o que deve ser reportado como não convertido é verificado explicitamente.
- Teste de arquivo malformado: erro claro, sem importar lixo.

## Checklist

- [ ] `parse`, `normalize` e `emit` separados
- [ ] `detect` olha conteúdo, não extensão
- [ ] `emit` usa a camada de storage, não `fs` direto
- [ ] Toda perda de informação está no relatório, com ação sugerida
- [ ] Nada é descartado em silêncio; sem equivalente, preserve como comentário
- [ ] Fixture real (não sintética) com teste de snapshot
- [ ] Arquivo malformado produz erro claro
- [ ] Nada é gravado em disco antes da confirmação do usuário na UI
