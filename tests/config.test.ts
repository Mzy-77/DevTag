import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, saveConfig } from "../src/services/config.js";
import { getConfigPath } from "../src/utils/paths.js";

const dirs: string[] = [];
async function makeConfigPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "devtag-config-")); dirs.push(dir); return join(dir, "config.json");
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe("configuration service", () => {
  it("uses platform-specific per-user configuration directories", () => {
    expect(getConfigPath({ platform: "win32", homeDir: "C:\\Users\\A", env: { APPDATA: "C:\\Users\\A\\AppData\\Roaming" } })).toBe("C:\\Users\\A\\AppData\\Roaming\\DevTag\\config.json");
    expect(getConfigPath({ platform: "darwin", homeDir: "/Users/a", env: {} })).toBe("/Users/a/Library/Application Support/DevTag/config.json");
    expect(getConfigPath({ platform: "linux", homeDir: "/home/a", env: { XDG_CONFIG_HOME: "/tmp/config" } })).toBe("/tmp/config/devtag/config.json");
  });
  it("returns defaults when configuration is missing", async () => expect(await loadConfig({ configPath: await makeConfigPath() })).toEqual({ soundPath: null, enabled: true }));
  it("saves and reloads configuration", async () => {
    const configPath = await makeConfigPath();
    await saveConfig({ soundPath: "/tmp/win.wav", enabled: false }, { configPath });
    expect(await loadConfig({ configPath })).toEqual({ soundPath: "/tmp/win.wav", enabled: false });
  });
  it("rejects malformed JSON and preserves it when saving", async () => {
    const configPath = await makeConfigPath(); await writeFile(configPath, "{");
    await expect(loadConfig({ configPath })).rejects.toThrow("Invalid DevTag configuration JSON");
    await expect(saveConfig({ soundPath: null, enabled: true }, { configPath })).rejects.toThrow();
    expect(await readFile(configPath, "utf8")).toBe("{");
  });
  it("rejects invalid fields", async () => {
    const configPath = await makeConfigPath(); await writeFile(configPath, JSON.stringify({ soundPath: "relative.wav", enabled: true }));
    await expect(loadConfig({ configPath })).rejects.toThrow("soundPath must be an absolute path");
  });
});
