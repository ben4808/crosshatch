export const GETTABLE_VERY = "Very Gettable";
export const GETTABLE_LIKELY = "Likely Gettable";
export const GETTABLE_MAYBE = "Maybe Gettable";
export const GETTABLE_NOT = "Not Gettable";
export const GETTABLE_NOT_A_THING = "Not a Thing";

export const DESIRABILITY_PREFER = "Prefer";
export const DESIRABILITY_NORMAL = "Normal";
export const DESIRABILITY_SLIGHT_PENALTY = "Slight Penalty";
export const DESIRABILITY_PENALTY = "Penalty";
export const DESIRABILITY_AVOID = "Avoid";

export type GettableNess =
  | typeof GETTABLE_VERY
  | typeof GETTABLE_LIKELY
  | typeof GETTABLE_MAYBE
  | typeof GETTABLE_NOT
  | typeof GETTABLE_NOT_A_THING;

export type Desirability =
  | typeof DESIRABILITY_PREFER
  | typeof DESIRABILITY_NORMAL
  | typeof DESIRABILITY_SLIGHT_PENALTY
  | typeof DESIRABILITY_PENALTY
  | typeof DESIRABILITY_AVOID;

/** Codes written by cruzi-aws crosswordListExtractor.ts. */
export const GETTABLE_BY_CODE: Record<string, GettableNess> = {
  vg: GETTABLE_VERY,
  lg: GETTABLE_LIKELY,
  mg: GETTABLE_MAYBE,
  ng: GETTABLE_NOT,
  nt: GETTABLE_NOT_A_THING,
};

export const DESIRABILITY_BY_CODE: Record<string, Desirability> = {
  p: DESIRABILITY_PREFER,
  n: DESIRABILITY_NORMAL,
  sp: DESIRABILITY_SLIGHT_PENALTY,
  pn: DESIRABILITY_PENALTY,
  a: DESIRABILITY_AVOID,
};

const GETTABLE_NAMES: GettableNess[] = [
  GETTABLE_VERY, GETTABLE_LIKELY, GETTABLE_MAYBE, GETTABLE_NOT, GETTABLE_NOT_A_THING,
];
const GETTABLE_BY_NAME = new Map(GETTABLE_NAMES.map(value => [value.toLowerCase(), value] as const));

const DESIRABILITY_NAMES: Desirability[] = [
  DESIRABILITY_PREFER, DESIRABILITY_NORMAL, DESIRABILITY_SLIGHT_PENALTY, DESIRABILITY_PENALTY, DESIRABILITY_AVOID,
];
const DESIRABILITY_BY_NAME = new Map(DESIRABILITY_NAMES.map(value => [value.toLowerCase(), value] as const));

/** Expand a gettableness token; codes (vg) or full names ("Very Gettable"). */
export function decodeGettableNess(token: string | undefined): GettableNess | undefined {
  const trimmed = (token || "").trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  return GETTABLE_BY_CODE[lower] ?? GETTABLE_BY_NAME.get(lower);
}

/** Expand a desirability token; codes (p/n/sp/pn/a) or full names ("Prefer"). */
export function decodeDesirability(token: string | undefined): Desirability | undefined {
  const trimmed = (token || "").trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  return DESIRABILITY_BY_CODE[lower] ?? DESIRABILITY_BY_NAME.get(lower);
}

// Keep gettability/desirability mappings in sync with cruzi-aws crosswordListExtractor.ts.
const VERY_GETTABLE_UNITY = new Set(["Concept", "Collocation", "Formula", "Variant"]);
const LIKELY_GETTABLE_UNITY = new Set([
  "Concept",
  "Collocation",
  "Formula",
  "Variant",
  "Partial",
  "Formulaic",
]);
const CORE_UNITY = new Set(["Concept", "Collocation", "Formula"]);

const VERY_GETTABLE_FAMILIARITY = new Set(["Ubiquitous", "Active"]);
const LIKELY_GETTABLE_FAMILIARITY = new Set([
  "Ubiquitous",
  "Active",
  "Literal",
  "Regionalism",
  "General Knowledge",
  "Inferred",
]);

const PREFER_QUALITY = new Set(["Idiomatic", "Interesting", "Feel-Good", "Trendy"]);

function isUnset(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

function isNonsense(value: string | null | undefined): boolean {
  return !isUnset(value) && value === "Nonsense";
}

export function classifyGettableNess(
  classification: string | null | undefined,
  unityBucket: string | null | undefined,
  familiarityBucket: string | null | undefined,
  crosswordBucket: string | null | undefined = null,
): GettableNess {
  if (isNonsense(classification) || isNonsense(unityBucket) || isNonsense(familiarityBucket)) {
    return GETTABLE_NOT_A_THING;
  }
  if (isUnset(unityBucket) || isUnset(familiarityBucket)) {
    return GETTABLE_MAYBE;
  }

  const unity = unityBucket as string;
  const familiarity = familiarityBucket as string;

  if (
    VERY_GETTABLE_UNITY.has(unity)
    && VERY_GETTABLE_FAMILIARITY.has(familiarity)
    && crosswordBucket !== "Unexpected Form"
    && classification !== "Contraction"
  ) {
    return GETTABLE_VERY;
  }
  if (LIKELY_GETTABLE_UNITY.has(unity) && LIKELY_GETTABLE_FAMILIARITY.has(familiarity)) {
    return GETTABLE_LIKELY;
  }
  if (
    familiarity === "Niche"
    || (familiarity === "Literal" && !CORE_UNITY.has(unity))
  ) {
    return GETTABLE_MAYBE;
  }
  if (familiarity === "Obscure") {
    return GETTABLE_NOT;
  }
  return GETTABLE_MAYBE;
}

export interface ClassifyDesirabilityInput {
  qualityBucket?: string | null;
  unityBucket?: string | null;
  baseForm?: string | null;
  classification?: string | null;
  crosswordBucket?: string | null;
  hasAvoidTag?: boolean;
  hasSensitiveTag?: boolean;
}

export function classifyDesirability(
  qualityBucket: string | null | undefined,
  hasAvoidTag = false,
  extras: Omit<ClassifyDesirabilityInput, "qualityBucket" | "hasAvoidTag"> = {},
): Desirability {
  const crosswordBucket = extras.crosswordBucket;
  if (crosswordBucket === "Contrived" || hasAvoidTag) {
    return DESIRABILITY_AVOID;
  }
  if (crosswordBucket === "Convenient" || crosswordBucket === "Uncommon Derivation" || extras.hasSensitiveTag) {
    return DESIRABILITY_PENALTY;
  }
  if (!isUnset(extras.baseForm) || extras.classification === "Acronym/Abbreviation") {
    return DESIRABILITY_SLIGHT_PENALTY;
  }
  if (
    (!isUnset(qualityBucket) && PREFER_QUALITY.has(qualityBucket as string))
    || crosswordBucket === "High-Scrabble"
    || crosswordBucket === "Unexpected Form"
  ) {
    return DESIRABILITY_PREFER;
  }
  return DESIRABILITY_NORMAL;
}
