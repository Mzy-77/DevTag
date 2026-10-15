import { access, open, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn, type SpawnOptions } from "node:child_process";
import { basename, extname, resolve } from "node:path";

const FORMATS = new Set([".wav", ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".flac", ".aiff", ".aif", ".wma"]);

export async function validateSoundPath(filePath: string, cwd = process.cwd()): Promise<string> {
  const trimmed = filePath.trim();
  if (!trimmed) throw new Error("Enter a path to an audio file.");
  const absolutePath = resolve(cwd, trimmed);
  let fileStat;
  try {
    await access(absolutePath, constants.R_OK);
    fileStat = await stat(absolutePath);
  } catch (error) {
    throw new Error(`Cannot read sound file: ${absolutePath}`, { cause: error });
  }
  if (!fileStat.isFile()) throw new Error(`Sound path is not a regular file: ${absolutePath}`);
  const extension = extname(absolutePath).toLowerCase();
  if (!FORMATS.has(extension)) {
    throw new Error(`Unsupported audio format. Supported extensions: ${[...FORMATS].join(", ")}: ${absolutePath}`);
  }

  // Check the container/header for compressed formats too, so a renamed text
  // file is not accepted as a configured sound.
  const handle = await open(absolutePath, "r");
  let header: Buffer;
  try {
    header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    header = header.subarray(0, bytesRead);
  } finally { await handle.close(); }

  const validHeader = (() => {
    if (extension === ".wav") return header.length >= 12 && header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WAVE";
    if (extension === ".mp3") return header.length >= 3 && (header.toString("ascii", 0, 3) === "ID3" || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0));
    if ([".m4a", ".aac"].includes(extension)) return header.length >= 8 && (header.toString("ascii", 4, 8) === "ftyp" || (header[0] === 0xff && (header[1] & 0xf6) === 0xf0));
    if ([".ogg", ".oga"].includes(extension)) return header.toString("ascii", 0, 4) === "OggS";
    if (extension === ".flac") return header.toString("ascii", 0, 4) === "fLaC";
    if ([".aiff", ".aif"].includes(extension)) return header.toString("ascii", 0, 4) === "FORM" && ["AIFF", "AIFC"].includes(header.toString("ascii", 8, 12));
    // ASF container used by WMA.
    return header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11]));
  })();
  if (!validHeader) throw new Error(`Unsupported audio format or invalid ${extension.slice(1).toUpperCase()} file: ${basename(absolutePath)}`);
  if (extension !== ".wav") return absolutePath;
  if (fileStat.size < 44) throw new Error(`Unsupported audio format or invalid WAV file: ${basename(absolutePath)}`);
  const wavHandle = await open(absolutePath, "r");
  try {
    const riffEnd = header.readUInt32LE(4) + 8;
    if (riffEnd > fileStat.size || riffEnd < 44) throw new Error(`Unsupported or invalid WAV file: ${absolutePath}`);
    // Check that this is a structurally plausible WAV, not merely a renamed file.
    let offset = 12;
    let hasFormat = false;
    let dataSize = 0;
    let pcmFormat = false;
    let blockAlign = 0;
    const chunkHeader = Buffer.alloc(8);
    while (offset + 8 <= riffEnd) {
      const { bytesRead } = await wavHandle.read(chunkHeader, 0, 8, offset);
      if (bytesRead !== 8) break;
      const chunkId = chunkHeader.toString("ascii", 0, 4);
      const chunkSize = chunkHeader.readUInt32LE(4);
      if (offset + 8 + chunkSize > riffEnd) break;
      if (chunkId === "fmt " && chunkSize >= 16) {
        const fmt = Buffer.alloc(16);
        await wavHandle.read(fmt, 0, fmt.length, offset + 8);
        const encoding = fmt.readUInt16LE(0);
        const channels = fmt.readUInt16LE(2);
        const sampleRate = fmt.readUInt32LE(4);
        blockAlign = fmt.readUInt16LE(12);
        const bitsPerSample = fmt.readUInt16LE(14);
        hasFormat = true;
        pcmFormat = encoding === 1 && [1, 2].includes(channels) && sampleRate >= 8000 && sampleRate <= 192000
          && [8, 16, 24, 32].includes(bitsPerSample) && blockAlign === channels * bitsPerSample / 8;
      }
      if (chunkId === "data" && chunkSize > 0) dataSize = chunkSize;
      offset += 8 + chunkSize + (chunkSize % 2);
    }
    if (!hasFormat || !dataSize || !blockAlign || dataSize % blockAlign !== 0 || !pcmFormat) {
      throw new Error(`Unsupported or invalid WAV file. Use uncompressed PCM WAV (mono or stereo): ${absolutePath}`);
    }
  } finally { await wavHandle.close(); }
  return absolutePath;
}

type SpawnFunction = (command: string, args: string[], options: SpawnOptions) => ReturnType<typeof spawn>;
export interface AudioOptions { spawnProcess?: SpawnFunction; platform?: NodeJS.Platform }

function playerFor(platform: NodeJS.Platform, path: string): [string, string[]] {
  const extension = extname(path).toLowerCase();
  const macNative = new Set([".wav", ".mp3", ".m4a", ".aac", ".aiff", ".aif"]);
  if (extension !== ".wav" && (platform !== "darwin" || !macNative.has(extension))) {
    return ["ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", path]];
  }
  if (platform === "darwin") return ["afplay", [path]];
  if (platform === "win32") {
    const script = `$p = New-Object System.Media.SoundPlayer '${path.replaceAll("'", "''")}'; $p.PlaySync()`;
    return ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]];
  }
  // aplay is available on many Linux installations with ALSA.
  return ["aplay", [path]];
}

export async function playSound(path: string, options: AudioOptions = {}): Promise<void> {
  const absolutePath = await validateSoundPath(path);
  const [command, args] = playerFor(options.platform ?? process.platform, absolutePath);
  const run = options.spawnProcess ?? spawn;
  await new Promise<void>((resolvePromise, reject) => {
    let child;
    try { child = run(command, args, { stdio: "ignore", windowsHide: true }); }
    catch (error) { reject(new Error(`Could not start audio player ${command}.`, { cause: error })); return; }
    child.once("error", (error) => reject(new Error(`Could not start audio player ${command}. Install or enable a supported system audio player.`, { cause: error })));
    child.once("close", (code) => code === 0 ? resolvePromise() : reject(new Error(`Audio player ${command} exited with status ${code}.`)));
  });
}

/** Starts playback without holding up a completed Git command. */
export async function playSoundInBackground(path: string, options: AudioOptions = {}): Promise<void> {
  const absolutePath = await validateSoundPath(path);
  const [command, args] = playerFor(options.platform ?? process.platform, absolutePath);
  const run = options.spawnProcess ?? spawn;
  await new Promise<void>((resolvePromise, reject) => {
    let child;
    try { child = run(command, args, { stdio: "ignore", windowsHide: true, detached: process.platform !== "win32" }); }
    catch (error) { reject(new Error(`Could not start audio player ${command}.`, { cause: error })); return; }
    child.once("error", (error) => reject(new Error(`Could not start audio player ${command}.`, { cause: error })));
    child.once("spawn", () => { child.unref(); resolvePromise(); });
  });
}
