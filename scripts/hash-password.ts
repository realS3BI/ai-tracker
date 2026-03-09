import argon2 from "argon2";

async function main(): Promise<void> {
  const password = process.argv[2];
  if (!password) {
    console.error("Usage: pnpm tsx scripts/hash-password.ts <password>");
    process.exit(1);
  }

  const hash = await argon2.hash(password);
  console.log(hash);
}

void main();
