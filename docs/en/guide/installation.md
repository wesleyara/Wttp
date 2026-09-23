# Installation

| OS          | File                                      | How                                                                      |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| **Windows** | `Wttp-<version>-setup.exe`                | Download and run. The installer asks for confirmation (UAC) once.        |
| **macOS**   | `Wttp-<version>-<arch>.dmg`               | Download, open the `.dmg` and drag Wttp to `Applications`.               |
| **Linux**   | `Wttp-<version>-amd64.deb` or `.AppImage` | `.deb`: `sudo dpkg -i Wttp-*.deb`. `.AppImage`: `chmod +x`, then run it. |

Download from the GitHub [Releases page](https://github.com/wesleyara/Wttp/releases).
Every release ships the artifacts for all three platforms plus a
`SHA256SUMS-<OS>.txt` so you can verify the download before installing.

## Updates

The app checks for a new version on startup and every few hours, downloads it in the
background, and only swaps the binary on the next restart — or when you click
**Update now**. You can turn this off in **Preferences → Updates**.

::: tip Installed from the `.deb`?
Then updates come from your package manager (`apt`/`dpkg`), not from inside the app.
:::

## Language and theme

In **Preferences → General** you pick the language (English, Português, or follow the
system) and the theme (light, dark or system). Both apply immediately, no restart.

## Documentation inside the app

**Preferences → About** has two buttons: one opens this documentation in your browser,
the other opens a copy bundled with the app — it works offline.
