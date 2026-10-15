import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { getConfigPath } from "../utils/paths.js";

export interface DevTagConfig {
  soundPath: string | null;
  enabled: boolean;
}

export const DEFAULT_CONFIG: DevTagConfig = { soundPath: null, enabled: true };
export interface ConfigOptions { configPath?: string }

function validateConfig(value: unknown): DevTagConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid DevTag configuration: expected a JSON object.");
  }
  const candidate = value as Record<string, unknown>;
  if (!(candidate.soundPath === null || (typeof candidate.soundPath === "string" && isAbsolute(candidate.soundPath)))) {
    throw new Error("Invalid DevTag configuration: soundPath must be an absolute path or null.");
  }
  if (typeof candidate.enabled !== "boolean") {
    throw new Error("Invalid DevTag configuration: enabled must be a boolean.");
  }
  return { soundPath: candidate.soundPath, enabled: candidate.enabled };
}

export async function loadConfig(options: ConfigOptions = {}): Promise<DevTagConfig> {
  const path = options.configPath ?? getConfigPath();
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_CONFIG };
    throw error;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(contents); }
  catch (error) { throw new Error(`Invalid DevTag configuration JSON at ${path}.`, { cause: error }); }
  return validateConfig(parsed);
}

export async function saveConfig(config: DevTagConfig, options: ConfigOptions = {}): Promise<void> {
  const validated = validateConfig(config);
  const path = options.configPath ?? getConfigPath();
  // Refuse to replace a malformed existing configuration without an explicit repair flow.
  await loadConfig({ configPath: path });
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
