export const GETTABLE_VERY = "Very Gettable";
export const GETTABLE_LIKELY = "Likely Gettable";
export const GETTABLE_MAYBE = "Maybe Gettable";
export const GETTABLE_NOT = "Not Gettable";
export const GETTABLE_NOT_A_THING = "Not a Thing";

export const DESIRABILITY_PREFER = "Prefer";
export const DESIRABILITY_NORMAL = "Normal";
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
  | typeof DESIRABILITY_AVOID;

// Keep gettability mappings in sync with cruzi-aws crosswordListExtractor.ts.
const VERY_GETTABLE_UNITY = new Set(["Concept", "Collocation"]);
const LIKELY_GETTABLE_UNITY = new Set(["Concept", "Collocation", "Formula", "Partial"]);

const VERY_GETTABLE_FAMILIARITY = new Set(["Ubiquitous", "Active"]);
const LIKELY_GETTABLE_FAMILIARITY = new Set([
  "Ubiquitous",
  "Active",
  "Literal",
  "Common Name",
  "General Knowledge",
  "Inferred",
]);
const MAYBE_GETTABLE_FAMILIARITY = new Set(["Niche", "Literal", "Non-Unit", "Non-unit"]);
const NOT_GETTABLE_FAMILIARITY = new Set(["Obscure", "Barely Exists"]);

const PREFER_QUALITY = new Set(["Idiomatic", "Interesting", "Feel-Good", "Trendy"]);
const NORMAL_QUALITY = new Set(["Normal"]);
const AVOID_QUALITY = new Set(["Non-unit", "Uncommon Derivation", "Clunky"]);

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
): GettableNess {
  if (isNonsense(classification) || isNonsense(unityBucket) || isNonsense(familiarityBucket)) {
    return GETTABLE_NOT_A_THING;
  }
  if (isUnset(unityBucket) || isUnset(familiarityBucket)) {
    return GETTABLE_MAYBE;
  }

  const unity = unityBucket as string;
  const familiarity = familiarityBucket as string;

  if (VERY_GETTABLE_UNITY.has(unity) && VERY_GETTABLE_FAMILIARITY.has(familiarity)) {
    return GETTABLE_VERY;
  }
  if (LIKELY_GETTABLE_UNITY.has(unity) && LIKELY_GETTABLE_FAMILIARITY.has(familiarity)) {
    return GETTABLE_LIKELY;
  }
  if (MAYBE_GETTABLE_FAMILIARITY.has(familiarity)) {
    return GETTABLE_MAYBE;
  }
  if (NOT_GETTABLE_FAMILIARITY.has(familiarity)) {
    return GETTABLE_NOT;
  }
  return GETTABLE_MAYBE;
}

export function classifyDesirability(
  qualityBucket: string | null | undefined,
  hasAvoidTag = false,
): Desirability {
  if (hasAvoidTag || (!isUnset(qualityBucket) && AVOID_QUALITY.has(qualityBucket as string))) {
    return DESIRABILITY_AVOID;
  }
  if (isUnset(qualityBucket)) {
    return DESIRABILITY_NORMAL;
  }

  const quality = qualityBucket as string;
  if (PREFER_QUALITY.has(quality)) {
    return DESIRABILITY_PREFER;
  }
  if (NORMAL_QUALITY.has(quality)) {
    return DESIRABILITY_NORMAL;
  }
  return DESIRABILITY_NORMAL;
}
