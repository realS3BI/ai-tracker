import { hashPassword } from "../src/auth/password.js";

function main(): void {
  const password = process.argv[2];
  if (!password) {
    console.error("Usage: pnpm hash-password <password>");
    process.exit(1);
  }

  console.log(hashPassword(password));
}

main();
