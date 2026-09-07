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

const VERY_GETTABLE_UNITY = new Set(["Concept", "Formula"]);
const LIKELY_GETTABLE_UNITY = new Set(["Concept", "Collocation", "Formula", "Partial"]);
const MAYBE_GETTABLE_UNITY = new Set(["Concept", "Collocation", "Formula", "Partial", "Variant"]);
const NOT_GETTABLE_UNITY = new Set(["Concept", "Collocation", "Formula", "Partial"]);
const NOT_A_THING_UNITY = new Set(["Non-unit", "Nonsense"]);

const VERY_GETTABLE_FAMILIARITY = new Set(["Beginner Core", "Ubiquitous", "Active", "Colloquial"]);
const LIKELY_GETTABLE_FAMILIARITY = new Set(["Common Name", "Easy Collocation", "Literal", "Inferred"]);
const MAYBE_GETTABLE_FAMILIARITY = new Set(["General Knowledge", "Niche", "Variant"]);
const NOT_GETTABLE_FAMILIARITY = new Set(["Obscure", "Barely Exists"]);

const PREFER_QUALITY = new Set(["Idiomatic", "Interesting", "Appealing", "Positive", "Trendy"]);
const NORMAL_QUALITY = new Set(["Normal", "Sensitive"]);
const AVOID_QUALITY = new Set(["Non-unit", "Uncommon Inflection", "Clunky"]);

function isUnset(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

export function classifyGettableNess(
  unityBucket: string | null | undefined,
  familiarityBucket: string | null | undefined,
): GettableNess {
  if (isUnset(unityBucket) || isUnset(familiarityBucket)) {
    return GETTABLE_MAYBE;
  }

  const unity = unityBucket as string;
  const familiarity = familiarityBucket as string;

  if (NOT_A_THING_UNITY.has(unity)) {
    return GETTABLE_NOT_A_THING;
  }
  if (VERY_GETTABLE_UNITY.has(unity) && VERY_GETTABLE_FAMILIARITY.has(familiarity)) {
    return GETTABLE_VERY;
  }
  if (LIKELY_GETTABLE_UNITY.has(unity) && LIKELY_GETTABLE_FAMILIARITY.has(familiarity)) {
    return GETTABLE_LIKELY;
  }
  if (MAYBE_GETTABLE_UNITY.has(unity) && MAYBE_GETTABLE_FAMILIARITY.has(familiarity)) {
    return GETTABLE_MAYBE;
  }
  if (NOT_GETTABLE_UNITY.has(unity) && NOT_GETTABLE_FAMILIARITY.has(familiarity)) {
    return GETTABLE_NOT;
  }
  return GETTABLE_MAYBE;
}

export function classifyDesirability(qualityBucket: string | null | undefined): Desirability {
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
  if (AVOID_QUALITY.has(quality)) {
    return DESIRABILITY_AVOID;
  }
  return DESIRABILITY_NORMAL;
}
