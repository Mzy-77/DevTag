#!/usr/bin/env node
import { Command } from "commander";
import { initialize } from "./commands/init.js";
import { setSound, testSound } from "./commands/sound.js";
import { showConfig } from "./commands/config.js";

const program = new Command();

program
  .name("devtag")
  .description("Play a custom sound after a successful Git push")
  .showSuggestionAfterError()
  .addHelpText("after", "\nExamples:\n  $ devtag init\n  $ devtag sound set\n  $ devtag install\n")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize DevTag configuration")
  .action(initialize);

const sound = program.command("sound").description("Configure or test the success sound");
sound.command("set").description("Choose a WAV file by entering its path").action(setSound);
sound.command("test").description("Play the configured sound").action(testSound);
program.command("config").description("Display the current configuration").action(showConfig);
program.command("install").description("Install the Git command shim").action(async () => {
  const { installIntegration } = await import("./services/git-integration.js");
  console.log(await installIntegration());
});
program.command("uninstall").description("Remove the Git command shim").action(async () => {
  const { uninstallIntegration } = await import("./services/git-integration.js");
  console.log(await uninstallIntegration());
});

program.parseAsync().catch((error: unknown) => {
  console.error(`DevTag: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
