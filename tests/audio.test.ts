import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateSoundPath } from "../src/services/audio.js";

let dir = "";
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = ""; });
function wav(): Buffer {
  const fmt = Buffer.alloc(24); fmt.write("fmt ", 0); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(1, 8); fmt.writeUInt16LE(1, 10); fmt.writeUInt32LE(8000, 12); fmt.writeUInt32LE(16000, 16); fmt.writeUInt16LE(2, 20); fmt.writeUInt16LE(16, 22);
  const data = Buffer.alloc(10); data.write("data", 0); data.writeUInt32LE(2, 4);
  const body = Buffer.concat([Buffer.from("WAVE"), fmt, data, Buffer.alloc(2)]);
  const head = Buffer.alloc(8); head.write("RIFF", 0); head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}
describe("audio validation", () => {
  it("accepts a structurally valid WAV and returns an absolute path", async () => {
    dir = await mkdtemp(join(tmpdir(), "devtag-audio-")); await writeFile(join(dir, "ok.wav"), wav());
    expect(await validateSoundPath("ok.wav", dir)).toBe(join(dir, "ok.wav"));
  });
  it("rejects missing paths, directories, and files with a false extension", async () => {
    dir = await mkdtemp(join(tmpdir(), "devtag-audio-")); await mkdir(join(dir, "folder")); await writeFile(join(dir, "fake.wav"), "not audio");
    await expect(validateSoundPath("missing.wav", dir)).rejects.toThrow("Cannot read sound file");
    await expect(validateSoundPath("folder", dir)).rejects.toThrow("not a regular file");
    await expect(validateSoundPath("fake.wav", dir)).rejects.toThrow("invalid WAV");
  });
});
