import { accessSync, constants as fsConstants, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { delimiter, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { playSoundInBackground } from "./audio.js";

const MARKER = "DevTag git shim v1";
const sourceDir = dirname(fileURLToPath(import.meta.url));

export function isPushCommand(args: string[]): boolean {
  const valueOptions = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"]);
  const pathspecOptions = ["--glob-pathspecs", "--noglob-pathspecs", "--icase-pathspecs"];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") return false;
    if (arg === "push") return !args.slice(i + 1).some((item) => item === "--dry-run" || item === "-n");
    if (arg.startsWith("--")) {
      if (["--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env", "--super-prefix"].some((option) => arg.startsWith(`${option}=`))) continue;
      if (["--no-pager", "--paginate", "--bare", "--literal-pathspecs", "--no-optional-locks", "--no-replace-objects", ...pathspecOptions].includes(arg)) continue;
      return false;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      if (valueOptions.has(arg)) { i++; continue; }
      if ((arg.startsWith("-C") || arg.startsWith("-c")) && arg.length > 2) continue;
      if (["-p", "-P", "-v", "-q", "-f", "-b"].includes(arg)) continue;
      return false;
    }
    return false;
  }
  return false;
}

function integrationDir(): string {
  if (process.platform === "win32" && process.env.APPDATA) return join(process.env.APPDATA, "DevTag", "shim");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "DevTag", "shim");
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "devtag", "shim");
}

function shimSourcePath(): string {
  const adjacent = resolve(sourceDir, "git-shim.js");
  if (existsSync(adjacent)) return adjacent;

  // `npm run dev` loads this module from src/services, while the runtime shim
  // is emitted under dist/services by `npm run build`.
  const built = resolve(sourceDir, "../../dist/services/git-shim.js");
  if (existsSync(built)) return built;
  throw new Error("Could not find the Git shim runtime. Run `npm run build` and try again.");
}

export async function installIntegration(options: { directory?: string; scriptPath?: string; platform?: NodeJS.Platform } = {}): Promise<string> {
  const platform = options.platform ?? process.platform;
  const dir = options.directory ?? integrationDir();
  await mkdir(dir, { recursive: true });
  const script = options.scriptPath ?? shimSourcePath();
  const shellQuotedScript = `'${script.replaceAll("'", "'\\''")}'`;
  const files: [string, string][] = platform === "win32"
    ? [[join(dir, "git.cmd"), `@echo off\r\nrem ${MARKER}\r\nnode "${script}" %*\r\n`]]
    : [[join(dir, "git"), `#!/bin/sh\n# ${MARKER}\nexec node ${shellQuotedScript} "$@"\n`]];
  for (const [path, contents] of files) {
    try { await readFile(path); throw new Error(`Refusing to overwrite existing file: ${path}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await writeFile(path, contents, { flag: "wx", mode: 0o755 });
    if (platform !== "win32") await chmod(path, 0o755);
  }
  const pathExample = platform === "win32" ? `$env:Path = "${dir};$env:Path"` : `export PATH="${dir}:$PATH"`;
  return `Installed DevTag's Git shim at ${dir}.\nAdd this directory to the front of your PATH to enable it (current shell: ${pathExample}). Restart terminals and IDEs afterward. Clients using an absolute Git path bypass the shim.`;
}

export async function uninstallIntegration(options: { directory?: string; platform?: NodeJS.Platform } = {}): Promise<string> {
  const dir = options.directory ?? integrationDir();
  const paths = (options.platform ?? process.platform) === "win32" ? [join(dir, "git.cmd")] : [join(dir, "git")];
  let removed = 0;
  for (const path of paths) {
    let contents: string;
    try { contents = await readFile(path, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    if (!contents.includes(MARKER)) throw new Error(`Refusing to remove file without DevTag marker: ${path}`);
    await rm(path); removed++;
  }
  return removed ? "DevTag Git shim removed. Remove its directory from PATH if you added it." : "No DevTag Git shim was installed.";
}

export function locateRealGit(env: NodeJS.ProcessEnv = process.env, shimDir = integrationDir()): string | undefined {
  const names = process.platform === "win32" ? ["git.exe", "git.cmd", "git.bat"] : ["git"];
  for (const entry of (env.PATH ?? "").split(delimiter)) {
    if (!entry || resolve(entry).toLowerCase() === resolve(shimDir).toLowerCase()) continue;
    for (const name of names) {
      const candidate = join(entry, name);
      try { accessSync(candidate, fsConstants.X_OK); return candidate; } catch { /* continue searching PATH */ }
    }
  }
  return undefined;
}

export interface GitShimOptions {
  args?: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  runner?: (command: string, args: string[], options: { stdio: "inherit"; env: NodeJS.ProcessEnv; cwd: string }) => ChildProcess;
  play?: (path: string) => Promise<void>;
  configPath?: string;
  shimDir?: string;
}

export async function runGitShim(options: GitShimOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const args = options.args ?? process.argv.slice(2);
  const realGit = env.DEVTAG_REAL_GIT || locateRealGit(env, options.shimDir);
  if (!realGit) { console.error("DevTag: Could not find the real Git executable on PATH. Set DEVTAG_REAL_GIT to its full path."); return 127; }
  const child = (options.runner ?? ((command, childArgs, childOptions) => spawn(command, childArgs, childOptions)))(realGit, args, {
    stdio: "inherit", env, cwd: options.cwd ?? process.cwd(),
  });
  return await new Promise<number>((resolvePromise) => {
    child.once("error", (error) => { console.error(`DevTag: Could not run Git: ${error.message}`); resolvePromise(127); });
    child.once("close", async (code, signal) => {
      const result = code ?? (signal ? 128 + (signal === "SIGINT" ? 2 : signal === "SIGTERM" ? 15 : 1) : 1);
      if (result === 0 && isPushCommand(args)) {
        try {
          const config = await loadConfig(options.configPath ? { configPath: options.configPath } : {});
          if (config.enabled && config.soundPath) await (options.play ?? playSoundInBackground)(config.soundPath);
        } catch (error) { console.error(`DevTag: Sound playback failed: ${error instanceof Error ? error.message : String(error)}`); }
      }
      resolvePromise(result);
    });
  });
}
