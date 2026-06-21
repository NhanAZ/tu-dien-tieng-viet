import crypto from "node:crypto";

import type { SourceTrace } from "./types.js";

export function rawRecordHash(value: string): string {
  return crypto.createHash("sha256").update(value.normalize("NFC")).digest("hex");
}

export function sourceTrace(
  sourceId: string,
  sourceEntryId: string | null,
  rawRecord: string,
  options: {
    sourceRevision?: string | null;
    confidence?: number;
    reviewStatus?: SourceTrace["review_status"];
  } = {}
): SourceTrace {
  return {
    source_id: sourceId,
    source_entry_id: sourceEntryId,
    source_revision: options.sourceRevision ?? null,
    raw_record_hash: rawRecordHash(rawRecord),
    confidence: options.confidence ?? 0.8,
    review_status: options.reviewStatus ?? "machine-checked"
  };
}
