import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sql } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  const migrationsDir = join(__dirname, "../../migrations");
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const migration = readFileSync(join(migrationsDir, file), "utf8");
    await sql.unsafe(migration);
    console.log(`Applied migration: ${file}`);
  }

  console.log("Discord bot migrations applied.");
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  runMigrations()
    .then(() => sql.end({ timeout: 5 }))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
