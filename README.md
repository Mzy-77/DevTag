# DevTag

DevTag is a small Node.js CLI that plays a sound after an ordinary `git push` succeeds. It does not contact GitHub or require credentials.

## Requirements

- Node.js 22.12 or newer (use an active Node.js LTS release)
- Git
- An audio file in WAV, MP3, M4A, AAC, OGG/OGA, FLAC, AIFF/AIF, or WMA format
- For playback: WAV uses `afplay` on macOS, Windows PowerShell, or `aplay` on Linux. macOS uses `afplay` for MP3, M4A, AAC, and AIFF. Other compressed formats use `ffplay` (included with FFmpeg); install FFmpeg on Windows/Linux and for OGG, FLAC, or WMA on macOS. DevTag does not bundle an audio decoder. On Linux, install `alsa-utils` if `aplay` is unavailable.

## Install and configure

```sh
npm install
npm run build
npm link
devtag init
devtag sound set
devtag sound test
devtag config
```

`devtag sound set` asks for a file path in the terminal. Relative paths are resolved from the current directory. DevTag checks that the path is readable, points to a regular file, and has a recognized audio extension and matching file signature before asking for confirmation. WAV files must contain uncompressed PCM audio. Paths with spaces can be pasted as-is. Cancelling leaves the previous setting unchanged.

Configuration is stored per user, outside repositories:

- Windows: `%APPDATA%\\DevTag\\config.json`
- macOS: `~/Library/Application Support/DevTag/config.json`
- Linux: `$XDG_CONFIG_HOME/devtag/config.json`, or `~/.config/devtag/config.json`

Malformed configuration is reported and preserved. `enabled` can be set to `false` in the JSON file to disable playback without removing the sound path.

## Ordinary `git push` integration

Git has no local post-push hook. Its `pre-push` hook runs before the push completes, so it cannot safely distinguish a successful push. DevTag uses a small Git executable shim instead: it forwards the original arguments, environment, working directory, standard streams, and exit result to the real Git executable, then starts sound playback only if Git exits successfully and the command was a push.

```sh
devtag install
```

This creates a shim in the per-user DevTag configuration directory and prints the PATH entry to add at the **front** of PATH. Add it only after reviewing the printed location and instruction. DevTag does not edit PATH or shell startup files, and refuses to overwrite a file at its shim location. Restart terminals and IDEs after updating PATH. Remove the PATH entry yourself when uninstalling:

```sh
devtag uninstall
```

The shim is conditional on command resolution: shells and applications that find DevTag's `git` first use it. VS Code, GUI clients, IDEs, scripts, or configured Git paths that invoke an absolute Git executable bypass it. DevTag cannot observe those pushes. The shim also cannot guarantee transparent behavior if another wrapper or unusual Git launcher changes process semantics. Git aliases do not override Git's built-in `push`; `-C`, `-c`, and common global options before `push` are recognized. All remaining arguments are passed unchanged.

On Windows, the shim is a `git.cmd` launcher in the PATH directory. The real `git.exe` is located later on PATH and invoked directly. Set `DEVTAG_REAL_GIT` to the full executable path if Git is not discoverable through PATH. On Unix-like systems, the shim is a small executable script that starts the installed Node-based forwarder. In either case the user PATH must put the shim directory before the regular Git directory.

## Development

```sh
npm install
npm run dev -- --help
npm run build
npm test
```

The package executable is `devtag`. The compiled program is emitted to `dist/` with a Node shebang. No real remote push is needed for tests.

## Troubleshooting

- `Could not find the real Git executable`: make sure Git is on PATH after the shim, or set `DEVTAG_REAL_GIT` to its full path.
- No sound after a successful push: verify `devtag config`, ensure the application resolves `git` through the shim, and try `devtag sound test`.
- Linux WAV player unavailable: install `aplay` (for example, the `alsa-utils` package for your distribution). For compressed formats, install FFmpeg so `ffplay` is available.
- A failed push should not play sound. The shim returns Git's original nonzero status; playback errors are reported separately and do not change a successful Git exit result.
