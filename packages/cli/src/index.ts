import { Command } from "commander";
import { createCommand } from "./commands/create.js";
import { statusCommand } from "./commands/status.js";
import { fundCommand } from "./commands/fund.js";
import { policyCommand } from "./commands/policy.js";
import { pauseCommand, unpauseCommand } from "./commands/pause.js";
import { sessionCommand } from "./commands/session.js";
import { configCommand } from "./commands/config.js";

const program = new Command();

program
  .name("smartagentkit")
  .description(
    "CLI tool for managing policy-governed AI agent smart wallets",
  )
  .version(process.env.npm_package_version ?? "0.1.0");

program.addCommand(createCommand);
program.addCommand(statusCommand);
program.addCommand(fundCommand);
program.addCommand(policyCommand);
program.addCommand(pauseCommand);
program.addCommand(unpauseCommand);
program.addCommand(sessionCommand);
program.addCommand(configCommand);

program.parse();
