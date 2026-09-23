# Versionando com Git

O workspace é uma pasta de arquivos de texto — versione-a como qualquer código. O formato
em disco é um contrato público: legível, editável à mão, com diff limpo.

```
meu-workspace/
├── wttp.yaml              # manifesto do workspace
├── environments/          # um arquivo por environment
├── .wttp/                 # local da máquina — fora do Git
├── auth/
│   ├── folder.yaml        # configuração da pasta/collection
│   └── login.req.yaml     # uma request = um arquivo
└── users/…
```

## O que vai e o que não vai

- **Vai para o Git:** `wttp.yaml`, `folder.yaml`, `*.req.yaml` e `environments/*.yaml`.
- **Nunca vai:** `.wttp/` — sessão de abas, rascunhos, histórico de execuções e o
  fallback de segredos. O Wttp cria o `.gitignore` com `.wttp/` ao inicializar o
  workspace.
- **Segredos:** variáveis marcadas **Secret** ficam no keychain do sistema, nunca no
  YAML. Quem clona o repositório precisa preencher os próprios valores.

## Diffs previsíveis

A serialização é determinística: salvar sem alterar nada produz **bytes idênticos**, e o
diff de um pull request mostra só o que mudou de verdade. Editou um arquivo por fora
(no editor, num `git pull`)? O app percebe e atualiza a interface, sem se confundir com
o próprio save.
