import { runGitShim } from "./git-integration.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export { runGitShim };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runGitShim().then((code) => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(`DevTag: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 127;
  });
}
