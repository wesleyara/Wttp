# Overview

O Wttp é uma solução open source para desenvolver, testar e distribuir APIs de forma rápida e eficiente. Ele fornece uma estrutura robusta para realizar chamadas HTTP, gerenciar rotas, workspaces, collections, enviroments e variáveis, além de permitir a documentação das APIs.

## Features

- **HTTP Requests**: Suporte para todos os métodos HTTP (GET, POST, PUT, DELETE, etc.) com facilidade de configuração.
- **Routing**: Gerenciamento de rotas para organizar suas APIs de forma clara e eficiente.
- **Workspaces**: Criação de workspaces para separar diferentes projetos ou ambientes de desenvolvimento.
- **Collections**: Agrupamento de endpoints relacionados em coleções para melhor organização.
- **Environments**: Configuração de diferentes ambientes (desenvolvimento, teste, produção) com variáveis específicas para cada um.
- **Variables**: Suporte para variáveis globais e locais, permitindo reutilização de valores em diferentes partes da aplicação.
- **Documentation**: Geração automática de documentação para suas APIs, facilitando a comunicação com outros desenvolvedores e equipes.
- **Versionamento**: Controle versão de workspaces e collections usando arquivos de configuração salvos em sua máquina local, permitindo fácil compartilhamento e colaboração.
- **Open Source**: Totalmente open source, permitindo que você contribua para o projeto e adapte-o às suas necessidades.
- **Extensibility**: Possibilidade de adicionar plugins e extensões para aumentar a funcionalidade do Wttp conforme suas necessidades.

## UI

Design pensado para ser intuitivo e fácil de usar, com uma interface limpa e organizada que facilita a navegação entre workspaces, collections e endpoints. Utilizando como base algumas aplicações já consolidadas no mercado, como Postman, Insomnia e Bruno, o Wttp busca oferecer uma experiência de usuário agradável e eficiente, permitindo que desenvolvedores se concentrem na criação e teste de APIs sem distrações.

## Documentação

Este documento descreve o _que_ o Wttp é. O _como_ está nos documentos abaixo.

| Documento                            | Conteúdo                                                         |
| ------------------------------------ | ---------------------------------------------------------------- |
| [architecture.md](architecture.md)   | Processos do Electron, contrato IPC, fluxo de uma requisição     |
| [file-format.md](file-format.md)     | Especificação do YAML em disco — o contrato com o Git do usuário |
| [design-system.md](design-system.md) | Paleta, tokens semânticos, tipografia, componentes base          |
| [conventions.md](conventions.md)     | Convenções de código, estado, lint, testes e git                 |
| [backlog/](backlog/README.md)        | Épicos e tasks do MVP e da evolução futura                       |

### Decisões de base

- **Desktop app em Electron** ([electron-vite](https://electron-vite.org/)), renderer em Vue 3 + TypeScript.
- **Local-first**: workspaces, collections e environments são arquivos YAML na máquina do usuário — um arquivo por request, sem conta e sem nuvem.
- **Git-friendly**: serialização determinística para que o diff reflita apenas o que mudou de fato.
- **Segredos fora do versionamento**: valores sensíveis vivem no keychain do sistema operacional.
