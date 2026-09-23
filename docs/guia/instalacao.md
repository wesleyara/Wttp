# Instalação

| SO          | Arquivo                                  | Como                                                                        |
| ----------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| **Windows** | `Wttp-<versão>-setup.exe`                | Baixe e execute. O instalador pede confirmação (UAC) uma vez.               |
| **macOS**   | `Wttp-<versão>-<arch>.dmg`               | Baixe, abra o `.dmg` e arraste o Wttp para `Applications`.                  |
| **Linux**   | `Wttp-<versão>-amd64.deb` ou `.AppImage` | `.deb`: `sudo dpkg -i Wttp-*.deb`. `.AppImage`: `chmod +x`, depois execute. |

Baixe na [página de Releases](https://github.com/wesleyara/Wttp/releases) do GitHub.
Cada release traz os artefatos das três plataformas e um `SHA256SUMS-<SO>.txt` para
conferir a integridade do download antes de instalar.

## Atualizações

O app verifica se há versão nova ao abrir e a cada poucas horas, baixa em segundo plano
e só troca o binário no próximo reinício — ou quando você clica em **Update now**. Dá
para desligar em **Preferências → Atualizações**.

::: tip Instalou pelo `.deb`?
Nesse caso as atualizações vêm do seu gerenciador de pacotes (`apt`/`dpkg`), não de
dentro do app.
:::

## Idioma e tema

Em **Preferências → Geral** você escolhe o idioma (Português ou English, ou seguir o
sistema) e o tema (claro, escuro ou sistema). As duas trocas valem na hora, sem
reiniciar.

## Documentação dentro do app

**Preferências → Sobre** tem dois botões: um abre esta documentação no navegador, o outro
abre uma cópia empacotada no próprio app — funciona sem internet.
