import { loadConfig } from "../services/config.js";

export async function showConfig(): Promise<void> {
  console.log(JSON.stringify(await loadConfig(), null, 2));
}
