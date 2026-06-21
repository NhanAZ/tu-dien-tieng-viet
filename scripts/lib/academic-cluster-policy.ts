export const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "bi",
  "boi",
  "cac",
  "cho",
  "co",
  "con",
  "cua",
  "duoc",
  "de",
  "la",
  "lam",
  "mot",
  "nhieu",
  "nhung",
  "nguoi",
  "nhu",
  "o",
  "su",
  "the",
  "thu",
  "trong",
  "va",
  "voi"
]);

export const ENTITY_RISK_LABELS = new Set([
  "proper-name-candidate",
  "place-name-candidate",
  "domain-or-encyclopedic-candidate",
  "punctuation-headword-candidate"
]);

export const HARD_RISK_LABELS = ENTITY_RISK_LABELS;

export interface ClusterPolicyRecord {
  source: string;
  language: string;
  confidence: number;
  source_rights: string;
  normalized_definition_key: string;
  risk_tags: string[];
  canonical_score: number;
  meaning: string;
}

export type ClusterStatus =
  | "auto_accepted"
  | "machine_clustered"
  | "machine_retained"
  | "needs_review"
  | "quarantined"
  | "entity_or_encyclopedic"
  | "reference_non_vi";

export type ConfidenceTier = "high" | "medium" | "low" | "quarantine" | "entity" | "reference";

export interface ClusterPolicyDecision {
  status: ClusterStatus;
  confidence_tier: ConfidenceTier;
  reasons: string[];
}

export function hasHardRisk(record: ClusterPolicyRecord): boolean {
  return record.risk_tags.some((tag) => HARD_RISK_LABELS.has(tag));
}

export function hasEntityRisk(record: ClusterPolicyRecord): boolean {
  return record.risk_tags.some((tag) => ENTITY_RISK_LABELS.has(tag));
}

export function isTrustedSignal(record: ClusterPolicyRecord): boolean {
  return (
    record.language === "vi" &&
    (record.source_rights === "open" || record.source_rights === "public-domain") &&
    record.confidence >= 0.75 &&
    !hasHardRisk(record)
  );
}

export function isSafeKey(records: ClusterPolicyRecord[]): boolean {
  const key = records[0]?.normalized_definition_key ?? "";
  const tokens = key.split(" ").filter((token) => token.length > 1 && !STOPWORDS.has(token));
  if (tokens.length >= 3) return true;
  return tokens.length >= 2 && key.length >= 10 && records.filter(isTrustedSignal).length >= 3;
}

export function chooseCanonical<T extends ClusterPolicyRecord>(records: T[]): T {
  return [...records].sort(
    (a, b) =>
      b.canonical_score - a.canonical_score ||
      b.confidence - a.confidence ||
      a.meaning.length - b.meaning.length ||
      a.source.localeCompare(b.source)
  )[0]!;
}

export function statusFor(
  records: ClusterPolicyRecord[],
  clusterType: "exact" | "singleton",
  canonical: ClusterPolicyRecord
): ClusterPolicyDecision {
  const reasons: string[] = [];
  const hasVi = records.some((record) => record.language === "vi");
  const sourceCount = new Set(records.map((record) => record.source)).size;
  const trustedSourceCount = new Set(records.filter(isTrustedSignal).map((record) => record.source)).size;
  const hardRiskCount = records.filter(hasHardRisk).length;
  const unclearCount = records.filter((record) => record.risk_tags.includes("documented-unclear-source")).length;
  const lowConfidenceCount = records.filter((record) => record.risk_tags.includes("low-confidence")).length;
  const missingPosCount = records.filter((record) => record.risk_tags.includes("missing-pos")).length;
  const entityRiskCount = records.filter(hasEntityRisk).length;
  const safeKey = isSafeKey(records);

  if (!hasVi) {
    return { status: "reference_non_vi", confidence_tier: "reference", reasons: ["no-vietnamese-definition"] };
  }
  if (hasEntityRisk(canonical) || entityRiskCount === records.length) {
    reasons.push("entity-or-encyclopedic-layer");
    if (hasEntityRisk(canonical)) reasons.push("canonical-definition-has-entity-risk");
    if (entityRiskCount === records.length) reasons.push("all-source-definitions-have-entity-risk");
    return { status: "entity_or_encyclopedic", confidence_tier: "entity", reasons };
  }
  if (clusterType === "exact" && trustedSourceCount >= 2 && safeKey) {
    reasons.push("exact-normalized-definition", "trusted-source-agreement");
    if (entityRiskCount > 0) reasons.push("risky-members-routed-to-entity-review");
    return { status: "auto_accepted", confidence_tier: "high", reasons };
  }
  if (
    clusterType === "exact" &&
    sourceCount >= 2 &&
    safeKey &&
    isTrustedSignal(canonical) &&
    entityRiskCount > 0 &&
    entityRiskCount < records.length
  ) {
    return {
      status: "machine_clustered",
      confidence_tier: "medium",
      reasons: [
        "exact-normalized-definition",
        "trusted-canonical-with-member-level-entity-risk",
        "risky-members-routed-to-entity-review"
      ]
    };
  }
  if (clusterType === "exact" && sourceCount >= 2 && safeKey && hardRiskCount === 0) {
    reasons.push("exact-normalized-definition", "source-agreement-but-not-enough-trusted-sources");
    return { status: "machine_clustered", confidence_tier: "medium", reasons };
  }
  if (
    clusterType === "exact" &&
    sourceCount >= 2 &&
    !hasEntityRisk(canonical) &&
    entityRiskCount > 0 &&
    entityRiskCount < records.length
  ) {
    return {
      status: "needs_review",
      confidence_tier: "low",
      reasons: [
        "exact-normalized-definition",
        "low-information-definition-kept-for-review",
        "risky-members-routed-to-entity-review"
      ]
    };
  }
  if (hardRiskCount > 0) {
    reasons.push("hard-risk-label");
    return { status: "quarantined", confidence_tier: "quarantine", reasons };
  }
  if (unclearCount > 0 || lowConfidenceCount > 0 || missingPosCount > 0) {
    if (unclearCount > 0) reasons.push("documented-unclear-source");
    if (lowConfidenceCount > 0) reasons.push("low-confidence");
    if (missingPosCount > 0) reasons.push("missing-pos");
    return { status: "needs_review", confidence_tier: "low", reasons };
  }
  return { status: "machine_retained", confidence_tier: "medium", reasons: ["singleton-or-unmerged-machine-retained"] };
}
