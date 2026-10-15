import { confirm, input } from "@inquirer/prompts";
import { loadConfig, saveConfig } from "../services/config.js";
import { ensureFfplay, playSound, validateSoundPath } from "../services/audio.js";

export async function setSound(): Promise<void> {
  const entered = await input({ message: "Enter the path to your sound file:" });
  const absolutePath = await validateSoundPath(entered);
  console.log("File found and readable.");
  if (!(await ensureFfplay(absolutePath))) { console.log("Sound selection cancelled."); return; }
  const accepted = await confirm({ message: "Use this sound?", default: true });
  if (!accepted) { console.log("Sound selection cancelled."); return; }
  const config = await loadConfig();
  await saveConfig({ ...config, soundPath: absolutePath });
  console.log("DevTag sound configured successfully.");
}

export async function testSound(): Promise<void> {
  const config = await loadConfig();
  if (!config.soundPath) throw new Error("No sound is configured. Run `devtag sound set` first.");
  if (!(await ensureFfplay(config.soundPath))) { console.log("Playback cancelled."); return; }
  await playSound(config.soundPath);
  console.log("Sound played successfully.");
}
