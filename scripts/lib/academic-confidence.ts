export const SOURCE_RIGHTS_WEIGHTS: Record<string, number> = {
  "public-domain": 35,
  open: 28,
  "documented-unclear": -18
};

export const SOURCE_QUALITY_WEIGHTS: Record<string, number> = {
  "học thuật": 30,
  "cộng đồng": 16,
  "tổng hợp": 8,
  "OCR cần soát": 2
};

export interface AcademicConfidenceRecord {
  source: string;
  confidence: number;
  canonical_score: number;
  source_rights: string;
  source_quality: string;
}

export interface AcademicConfidenceBreakdown {
  model_version: "heuristic-v1";
  source_confidence: number;
  cluster_confidence: number;
  canonical_selection_confidence: number;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number): number {
  return Number(clamp(value).toFixed(4));
}

export function sourceBaseScore(rights: string, quality: string): number {
  return (SOURCE_RIGHTS_WEIGHTS[rights] ?? 0) + (SOURCE_QUALITY_WEIGHTS[quality] ?? 0);
}

export function confidenceForCluster(
  records: AcademicConfidenceRecord[],
  canonical: AcademicConfidenceRecord,
  clusterType: "exact" | "singleton",
  trustedSourceCount: number
): AcademicConfidenceBreakdown {
  if (clusterType === "singleton") {
    return {
      model_version: "heuristic-v1",
      source_confidence: rounded(canonical.confidence),
      cluster_confidence: 1,
      canonical_selection_confidence: 1
    };
  }

  const sourceCount = new Set(records.map((record) => record.source)).size;
  const sorted = [...records].sort((a, b) => b.canonical_score - a.canonical_score);
  const runnerUp = sorted.find((record) => record !== canonical);
  const scoreMargin = runnerUp ? Math.max(0, canonical.canonical_score - runnerUp.canonical_score) : 0;
  const clusterConfidence =
    0.56 + Math.min(0.18, Math.max(0, sourceCount - 1) * 0.06) + Math.min(0.2, trustedSourceCount * 0.08);
  const canonicalSelectionConfidence =
    0.45 + canonical.confidence * 0.3 + Math.min(0.24, scoreMargin / 80);

  return {
    model_version: "heuristic-v1",
    source_confidence: rounded(canonical.confidence),
    cluster_confidence: rounded(clusterConfidence),
    canonical_selection_confidence: rounded(canonicalSelectionConfidence)
  };
}
