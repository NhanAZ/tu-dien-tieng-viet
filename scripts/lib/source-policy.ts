import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { ROOT } from "./paths.js";

export type SourcePolicyProfile = "open-only" | "documented";

interface SourcePolicyFile {
  profile?: SourcePolicyProfile;
  collection_frozen?: boolean;
  disabled_sources?: string[];
}

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readPolicyFile(): SourcePolicyFile {
  const filePath = path.join(ROOT, "data", "source-policy.json");
  if (!existsSync(filePath)) return {};
  return JSON.parse(readFileSync(filePath, "utf8")) as SourcePolicyFile;
}

const filePolicy = readPolicyFile();

export const SOURCE_POLICY_PROFILE: SourcePolicyProfile =
  process.env.SOURCE_POLICY === "open-only" || process.env.SOURCE_POLICY === "documented"
    ? process.env.SOURCE_POLICY
    : (filePolicy.profile ?? "documented");

export const COLLECTION_FROZEN = filePolicy.collection_frozen ?? false;

export const DISABLED_SOURCES = new Set([
  ...(filePolicy.disabled_sources ?? []),
  ...parseList(process.env.EXCLUDE_SOURCES)
]);

export function sourceIsDisabled(key: string): boolean {
  return DISABLED_SOURCES.has(key);
}
