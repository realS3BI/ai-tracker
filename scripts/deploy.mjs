import { spawnSync } from "node:child_process";

const commands = [
  "pnpm test",
  "pnpm build",
  "npm whoami",
  "npm pack --dry-run",
  "npm publish --access public"
];

for (const command of commands) {
  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
