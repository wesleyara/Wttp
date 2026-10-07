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
- **Anexos:** `attachments/` (imagens e vídeos da documentação) também vai para o Git —
  veja [Anexos](#anexos).
- **Nunca vai:** `.wttp/` — sessão de abas, rascunhos, histórico de execuções e o
  fallback de segredos. O Wttp cria o `.gitignore` com `.wttp/` ao inicializar o
  workspace.
- **Segredos:** variáveis marcadas **Secret** ficam no keychain do sistema, nunca no
  YAML. Quem clona o repositório precisa preencher os próprios valores.

## Anexos

As imagens e vídeos que você anexa à documentação ficam em `attachments/`, na raiz do
workspace, e são arquivos comuns do repositório: faça commit deles junto com o YAML que os
cita. O nome inclui um trecho do hash do conteúdo, então o mesmo arquivo nunca aparece
duplicado e dois arquivos diferentes nunca se sobrescrevem.

Arquivos binários grandes — vídeos, principalmente — pesam no repositório de todo mundo
que clona. O Wttp recusa arquivos acima de **50 MB**; se a sua equipe anexa vídeos com
frequência, considere o [Git LFS](https://git-lfs.com) para `attachments/*.mp4`. Para tirar
do disco o que a documentação não usa mais, veja
[Removendo anexos](./documentando-apis#removendo-anexos).

## Diffs previsíveis

A serialização é determinística: salvar sem alterar nada produz **bytes idênticos**, e o
diff de um pull request mostra só o que mudou de verdade. Editou um arquivo por fora
(no editor, num `git pull`)? O app percebe e atualiza a interface, sem se confundir com
o próprio save.

## Git dentro do app

Se o workspace está num repositório git (na raiz dele ou numa subpasta, como uma pasta
`api-tests/` dentro do repositório da API), o Wttp usa o `git` instalado no seu computador,
com a mesma configuração, credenciais e hooks do terminal.

- **Branch e mudanças:** a barra de status mostra a branch atual e quantos arquivos mudaram
  desde o último commit. Na árvore, cada request alterada ganha uma letra: **M** alterada,
  **U** nova, ainda fora do git, **A** nova e staged, **D** apagada. Uma pasta com mudanças
  dentro ganha um ponto. O botão ao lado do filtro mostra só o que mudou.
- **Aba Mudanças** (`Ctrl+Shift+G`, ou o "N alterado(s)" na barra de status): lista o que mudou,
  agrupado por pasta, e mostra o diff de cada request **campo a campo**, como uma request e
  não como YAML: "header `X-Api-Version` 1 → 2". Em **Comparar com** dá para escolher outra
  branch ou tag, sem trocar de branch.
- **Commit e descarte:** na mesma aba você faz stage por arquivo, pasta ou tudo, escreve a
  mensagem e dá `Ctrl+Enter`. Descartar volta o arquivo ao último commit e sempre pede
  confirmação, avisando o que será apagado e quais abas têm edições não salvas. O commit só
  leva arquivos do workspace; se houver algo staged fora dele, o Wttp pede para commitar pelo
  terminal. `.wttp/` nunca é commitada.
- **Branches:** clique no nome da branch na barra de status para buscar, trocar ou criar uma.
  Também dá para trazer uma branch remota como local. Com uma aba não salva, a troca é
  bloqueada até você salvar ou descartar. Se o workspace é uma subpasta, o Wttp avisa que a
  troca vale para o repositório inteiro. Depois da troca, a árvore e as abas mostram a branch
  nova; a aba de uma request que não existe nela fica marcada, sem fechar.
- **Sem repositório:** clique em "Não é um repositório git" na barra de status para criar um
  (`git init`, com o `.gitignore` de `.wttp/`). Sem `git` instalado, nada disso aparece e o
  resto do app funciona igual.

O Wttp nunca força nada: sem `--force`, sem merge nem rebase. Se o git recusa uma troca por
causa de mudanças locais, a mensagem dele aparece como está, e o terminal continua sendo o
lugar para resolver conflitos.

### Pull e push

Quando a branch tem um upstream, a barra de status mostra `↑2 ↓1` (commits para enviar e para receber). O Wttp roda `git fetch` em segundo plano ao abrir o workspace e a cada 5 minutos — ajuste ou desligue em **Preferências → Geral**.

No popover da branch ficam **Pull** e **Push**:

- **Pull** é sempre _fast-forward only_. Se a branch divergiu do remoto, o Wttp não altera nada e mostra o comando para resolver no terminal. Abas com alterações não salvas bloqueiam o pull.
- **Push** nunca usa `--force`. Se o remoto tem commits que você não tem, o push é recusado com uma mensagem clara. Uma branch ainda não publicada oferece **Publicar branch**.
- As credenciais vêm só do credential helper ou do ssh-agent do seu sistema. O Wttp nunca as pede, guarda ou registra; se a autenticação falhar, ele explica como configurar o helper.

### Linha do tempo e restaurar versão

Clique com o botão direito numa request, pasta ou collection (ou na aba de uma request) e escolha **Linha do tempo**; num environment, o botão **Linha do tempo** fica no editor. A lista mostra os commits que tocaram aquele arquivo — hash curto, autor, data relativa e mensagem — e acompanha renomeações: renomear a request na árvore não corta o histórico.

Clicar num commit mostra o diff campo a campo dele, contra o commit anterior ou contra o arquivo como está agora (**Arquivo atual**). **Restaurar esta versão** grava no arquivo exatamente o conteúdo daquele commit, como uma edição comum: ele aparece como modificado em **Changes** e nada é commitado. Se a aba da request tem alterações não salvas, o Wttp pergunta antes. Um arquivo que nunca foi commitado mostra um estado vazio explicando isso.
