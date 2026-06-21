import { confidenceForCluster } from "./lib/academic-confidence.js";
import { chooseCanonical, statusFor, type ClusterPolicyRecord } from "./lib/academic-cluster-policy.js";
import { splitCatusfNumberedDefinitions, stripCatusfLineSenseMarker } from "./normalizers/catusf.js";
import { splitKaikkiNumberedGloss } from "./normalizers/kaikki.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const numbered = splitCatusfNumberedDefinitions(
  "đgt. 1. Phân ra một tổng thể. 2. Tìm một thừa số: 10 chia 2 được 5. 3. Phân quyền lợi."
);
assert(numbered.length === 3, `Expected 3 numbered definitions, received ${numbered.length}`);
assert(numbered[0] === "đgt. Phân ra một tổng thể.", "The POS prefix must stay with the first definition");
assert(
  numbered[1] === "Tìm một thừa số: 10 chia 2 được 5.",
  "Numbers inside an example must not be split as sense markers"
);
assert(numbered[2] === "Phân quyền lợi.", "The third sequential marker must be split");

const homonym = splitCatusfNumberedDefinitions("2 dt. Đồ dùng bằng sắt, lưỡi mỏng.");
assert(homonym.length === 1 && homonym[0] === "dt. Đồ dùng bằng sắt, lưỡi mỏng.", "Homonym marker must be removed");

for (const literal of ["10 đồng (tiền cổ Việt Nam).", "49 days after someone's death"]) {
  const result = splitCatusfNumberedDefinitions(literal);
  assert(result.length === 1 && result[0] === literal, `Literal number must be preserved: ${literal}`);
}

assert(
  stripCatusfLineSenseMarker("14. Hùng Anh") === "Hùng Anh",
  "A numbered CatusF list line must lose its sense marker"
);
assert(
  stripCatusfLineSenseMarker("10 đồng (tiền cổ Việt Nam).") === "10 đồng (tiền cổ Việt Nam).",
  "A literal CatusF quantity must keep its number"
);

const kaikkiNumbered = splitKaikkiNumberedGloss(
  "1. t Đi trước mở đường. 2. d. Cầu thủ chạy hàng đầu trong một đội bóng đá."
);
assert(kaikkiNumbered.length === 2, "A Kaikki gloss containing two numbered senses must split in two");
assert(kaikkiNumbered[0] === "t Đi trước mở đường.", "Kaikki first sense marker must be removed");
assert(
  kaikkiNumbered[1] === "d. Cầu thủ chạy hàng đầu trong một đội bóng đá.",
  "Kaikki second sense marker must be removed"
);
assert(
  splitKaikkiNumberedGloss("1. Tiếng nghé hay trâu kêu.")[0] === "Tiếng nghé hay trâu kêu.",
  "A single Kaikki sense marker must be removed"
);
assert(
  splitKaikkiNumberedGloss("T. 1. Vỡ một tí, khuyết một tí ở cạnh.")[0] ===
    "Vỡ một tí, khuyết một tí ở cạnh.",
  "A Kaikki POS prefix before a numbered sense must be removed with the marker"
);
assert(splitKaikkiNumberedGloss("2.").length === 0, "A marker-only Kaikki gloss must be discarded");
assert(
  splitKaikkiNumberedGloss("10 đồng (tiền cổ Việt Nam).")[0] === "10 đồng (tiền cổ Việt Nam).",
  "A literal Kaikki quantity must keep its number"
);

const singletonRecord = {
  source: "fixture",
  confidence: 0.65,
  canonical_score: 10,
  source_rights: "documented-unclear",
  source_quality: "tổng hợp"
};
const singletonConfidence = confidenceForCluster([singletonRecord], singletonRecord, "singleton", 0);
assert(singletonConfidence.source_confidence === 0.65, "Source confidence must preserve provenance confidence");
assert(singletonConfidence.cluster_confidence === 1, "A singleton has no merge ambiguity");

function policyRecord(overrides: Partial<ClusterPolicyRecord> = {}): ClusterPolicyRecord {
  return {
    source: "trusted-a",
    language: "vi",
    confidence: 0.9,
    source_rights: "open",
    normalized_definition_key: "dinh nghia du dai",
    risk_tags: [],
    canonical_score: 100,
    meaning: "Định nghĩa đủ dài.",
    ...overrides
  };
}

const exactTrustedRecords = [policyRecord(), policyRecord({ source: "trusted-b", canonical_score: 90 })];
const exactTrustedDecision = statusFor(
  exactTrustedRecords,
  "exact",
  chooseCanonical(exactTrustedRecords)
);
assert(exactTrustedDecision.status === "auto_accepted", "Two trusted exact sources must auto-accept");

const shortExactRecords = [
  policyRecord({ normalized_definition_key: "rat tot", meaning: "Rất tốt." }),
  policyRecord({ source: "trusted-b", canonical_score: 90, normalized_definition_key: "rat tot", meaning: "Rất tốt." })
];
const shortExactDecision = statusFor(shortExactRecords, "exact", chooseCanonical(shortExactRecords));
assert(
  shortExactDecision.status === "machine_retained",
  "Short exact definitions must not bypass the safe-key guard"
);

const priorityRecords = [
  policyRecord({ source: "lower-priority", canonical_score: 70, confidence: 0.99 }),
  policyRecord({ source: "higher-priority", canonical_score: 90, confidence: 0.8 })
];
assert(
  chooseCanonical(priorityRecords).source === "higher-priority",
  "Canonical selection must prioritize canonical score before provenance confidence"
);

const mixedRiskRecords = [
  policyRecord({ source: "trusted" }),
  policyRecord({
    source: "catusf_vietviet",
    source_rights: "documented-unclear",
    confidence: 0.65,
    canonical_score: 20,
    risk_tags: ["documented-unclear-source", "low-confidence", "proper-name-candidate"]
  })
];
const mixedRiskDecision = statusFor(mixedRiskRecords, "exact", chooseCanonical(mixedRiskRecords));
assert(
  mixedRiskDecision.status === "machine_clustered",
  "A safe exact canonical must remain in core when only a member has entity risk"
);
assert(
  mixedRiskDecision.reasons.includes("risky-members-routed-to-entity-review"),
  "Mixed-risk classification must explicitly route risky members to entity review"
);

const shortMixedRiskRecords = mixedRiskRecords.map((record) => ({
  ...record,
  normalized_definition_key: "tin tuc",
  meaning: "Tin tức."
}));
const shortMixedRiskDecision = statusFor(
  shortMixedRiskRecords,
  "exact",
  chooseCanonical(shortMixedRiskRecords)
);
assert(
  shortMixedRiskDecision.status === "needs_review",
  "A low-information exact mixed-risk cluster must leave quarantine without being machine-accepted"
);
assert(
  shortMixedRiskDecision.reasons.includes("low-information-definition-kept-for-review"),
  "A short mixed-risk cluster must preserve an explicit review reason"
);

const allEntityRiskRecords = mixedRiskRecords.map((record) => ({
  ...record,
  risk_tags: ["proper-name-candidate"]
}));
assert(
  statusFor(allEntityRiskRecords, "exact", chooseCanonical(allEntityRiskRecords)).status ===
    "entity_or_encyclopedic",
  "An all-risk exact cluster must stay in the entity layer"
);

console.log("[test:academic-fixtures] PASS: parser, confidence and cluster-policy fixtures");
