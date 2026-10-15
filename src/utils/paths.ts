import { homedir } from "node:os";
import { join as joinPosix, win32 } from "node:path";

export interface ConfigPathOptions {
  platform?: NodeJS.Platform;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}

export function getConfigPath(options: ConfigPathOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const home = options.homeDir ?? homedir();
  const env = options.env ?? process.env;
  const join = platform === "win32" ? win32.join : joinPosix;

  if (platform === "win32" && env.APPDATA) {
    return join(env.APPDATA, "DevTag", "config.json");
  }
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "DevTag", "config.json");
  }
  if (platform === "linux" || platform === "win32") {
    return join(env.XDG_CONFIG_HOME || join(home, ".config"), "devtag", "config.json");
  }
  return join(env.XDG_CONFIG_HOME || join(home, ".config"), "devtag", "config.json");
}
