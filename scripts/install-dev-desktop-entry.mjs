// Linux/Wayland (GNOME): o ícone da janela vem do arquivo `.desktop` cujo nome bate com o
// app id — `BrowserWindow({ icon })` é ignorado no Wayland. Instalado (`.deb`) o
// electron-builder já cria esse arquivo; rodando de `yarn dev`, do AppImage ou de
// `build:unpack` não existe nenhum, e o Shell mostra o ícone genérico de engrenagem.
// Este script cria uma entrada de usuário (`~/.local/share/applications/wttp.desktop`,
// o nome vem de `desktopName` no package.json) apontando para o ícone do repositório.
// Para desfazer: apagar esse arquivo.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform !== "linux") {
  console.log("Only needed on Linux; nothing to do.");
  process.exit(0);
}

const root = resolve(import.meta.dirname, "..");
const { desktopName } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const target = join(homedir(), ".local", "share", "applications", desktopName);

if (process.argv.includes("--remove")) {
  try {
    unlinkSync(target);
    console.log(`Removed ${target}`);
  } catch {
    console.log("Nothing to remove.");
  }
  process.exit(0);
}

// O arquivo de usuário tem precedência sobre o de `/usr/share/applications`: com o `.deb`
// instalado, esta entrada de dev passaria a ser o que o menu de aplicativos executa (o
// Electron do repositório, que costuma abortar por falta de `chrome-sandbox` setuid) e o
// Wttp instalado "deixaria de abrir".
if (existsSync(join("/usr/share/applications", desktopName))) {
  console.log(
    `${desktopName} is already installed system-wide (.deb); not creating a dev entry that would shadow it.`,
  );
  process.exit(0);
}

const electron = join(root, "node_modules", "electron", "dist", "electron");
const entry = `[Desktop Entry]
Type=Application
Name=Wttp (dev)
Comment=Wttp development build
Exec=${electron} ${root}
Icon=${join(root, "build", "icon.png")}
StartupWMClass=${desktopName.replace(/\.desktop$/, "")}
Categories=Development;
`;
mkdirSync(join(target, ".."), { recursive: true });
writeFileSync(target, entry);
console.log(`Wrote ${target}\nRestart the app (a full quit, not just a reload) to see the icon.`);
