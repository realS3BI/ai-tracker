import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";

export async function readEnvFile(envFilePath: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(envFilePath, "utf8");
    return parse(raw);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function formatEnvValue(value: string): string {
  if (value.length === 0) {
    return '""';
  }

  if (/^[^\s"'#\r\n]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/"/g, '\\"')}"`;
}

export async function upsertEnvValue(envFilePath: string, key: string, value: string): Promise<void> {
  const resolvedPath = path.resolve(envFilePath);
  let current = "";

  try {
    current = await readFile(resolvedPath, "utf8");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const normalized = current.replace(/\r\n/g, "\n");
  const lines = normalized.length > 0 ? normalized.split("\n") : [];
  const assignment = `${key}=${formatEnvValue(value)}`;
  const existingIndex = lines.findIndex((line) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line) && line.split("=")[0]?.trim() === key);

  if (existingIndex >= 0) {
    lines[existingIndex] = assignment;
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    lines.push(assignment);
  }

  const next = `${lines.join("\n").replace(/\n*$/, "\n")}`;
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, next, "utf8");
}
