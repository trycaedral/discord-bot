import { registerSlashCommands } from "./register-commands.js";

registerSlashCommands().catch((err) => {
  console.error(err);
  process.exit(1);
});