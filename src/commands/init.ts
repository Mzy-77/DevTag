import { loadConfig, saveConfig } from "../services/config.js";

export async function initialize(): Promise<void> {
  const config = await loadConfig();
  await saveConfig(config);
  console.log("DevTag is initialized.");
  if (!config.soundPath) console.log("Choose a sound with `devtag sound set`.");
}
