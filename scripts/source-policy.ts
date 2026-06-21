import { readFile } from "node:fs/promises";
import path from "node:path";

import { ROOT, writeJson } from "./lib/paths.js";
import { SOURCES } from "./lib/sources.js";

interface PolicyFile {
  profile: "open-only" | "documented";
  collection_frozen: boolean;
  disabled_sources: string[];
}

const [action, sourceId] = process.argv.slice(2);
const allowedActions = new Set(["enable", "disable", "freeze", "unfreeze", "profile"]);

if (!action || !allowedActions.has(action)) {
  console.error(
    "Usage: tsx scripts/source-policy.ts <enable|disable|freeze|unfreeze|profile> [source_id|open-only|documented]"
  );
  process.exit(1);
}

if ((action === "enable" || action === "disable") && !SOURCES.some((source) => source.key === sourceId)) {
  console.error(`[source-policy] Unknown source: ${sourceId ?? "(missing)"}`);
  process.exit(1);
}

if (action === "profile" && sourceId !== "open-only" && sourceId !== "documented") {
  console.error("[source-policy] Profile must be open-only or documented");
  process.exit(1);
}

const filePath = path.join(ROOT, "data", "source-policy.json");
const policy = JSON.parse(await readFile(filePath, "utf8")) as PolicyFile;
const disabled = new Set(policy.disabled_sources ?? []);

if (action === "disable" && sourceId) disabled.add(sourceId);
if (action === "enable" && sourceId) disabled.delete(sourceId);
if (action === "freeze") policy.collection_frozen = true;
if (action === "unfreeze") policy.collection_frozen = false;
if (action === "profile") policy.profile = sourceId as PolicyFile["profile"];

policy.disabled_sources = [...disabled].sort();
await writeJson(filePath, policy);
console.log(`[source-policy] ${action}${sourceId ? ` ${sourceId}` : ""}`);
