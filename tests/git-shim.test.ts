import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { installIntegration, isPushCommand, runGitShim, uninstallIntegration } from "../src/services/git-integration.js";
import { saveConfig } from "../src/services/config.js";

function runnerWithExit(code: number, capture: { command?: string; args?: string[]; options?: unknown }) {
  return (command: string, args: string[], options: unknown) => {
    capture.command = command; capture.args = args; capture.options = options;
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", code, null));
    return child as ChildProcess;
  };
}

describe("Git shim", () => {
  it("recognizes push after Git global options", () => {
    expect(isPushCommand(["-C", "/repo", "push", "--force"])).toBe(true);
    expect(isPushCommand(["--git-dir=/repo/.git", "push"])).toBe(true);
    expect(isPushCommand(["-C", "/repo", "push", "--dry-run"])).toBe(false);
    expect(isPushCommand(["push", "-n"])).toBe(false);
    expect(isPushCommand(["status"])).toBe(false);
  });
  it("preserves arguments and exit status and plays once after successful push", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devtag-shim-"));
    try {
    const configPath = join(dir, "config.json");
    await saveConfig({ soundPath: "/some/sound.wav", enabled: true }, { configPath });
    const capture: { command?: string; args?: string[]; options?: unknown } = {};
    const play = vi.fn(async () => undefined);
    const result = await runGitShim({
      args: ["-C", "/repo with spaces", "push", "origin", "main"],
      env: { DEVTAG_REAL_GIT: "/fake/git", PATH: "" }, runner: runnerWithExit(0, capture),
      play, configPath,
    });
    expect(result).toBe(0);
    expect(capture.command).toBe("/fake/git");
    expect(capture.args).toEqual(["-C", "/repo with spaces", "push", "origin", "main"]);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith("/some/sound.wav");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("does not play for failed pushes or ordinary commands", async () => {
    const play = vi.fn(async () => undefined);
    const base = { env: { DEVTAG_REAL_GIT: "/fake/git", PATH: "" }, runner: runnerWithExit(1, {}) as never, play };
    expect(await runGitShim({ ...base, args: ["push"] })).toBe(1);
    expect(await runGitShim({ ...base, args: ["status"] })).toBe(1);
    expect(play).not.toHaveBeenCalled();
  });
  it("does not let playback failures change Git's successful exit status", async () => {
    const result = await runGitShim({ args: ["push"], env: { DEVTAG_REAL_GIT: "/fake/git", PATH: "" }, runner: runnerWithExit(0, {}), play: async () => { throw new Error("player unavailable"); } });
    expect(result).toBe(0);
  });
  it("returns 127 with a clear result when Git is unavailable", async () => {
    expect(await runGitShim({ args: ["status"], env: { PATH: "" }, shimDir: "/shim" })).toBe(127);
  });
  it("installs and removes only its own shim file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devtag-install-"));
    try {
      await installIntegration({ directory: dir, scriptPath: "/opt/devtag/git-shim.js", platform: "linux" });
      const launcher = await readFile(join(dir, "git"), "utf8");
      expect(launcher).toContain("DevTag git shim v1");
      expect(launcher).toContain("/opt/devtag/git-shim.js");
      expect(await uninstallIntegration({ directory: dir, platform: "linux" })).toContain("removed");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("refuses to overwrite an existing launcher", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devtag-install-"));
    try {
      await writeFile(join(dir, "git"), "user file");
      await expect(installIntegration({ directory: dir, platform: "linux" })).rejects.toThrow("Refusing to overwrite");
      expect(await readFile(join(dir, "git"), "utf8")).toBe("user file");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
