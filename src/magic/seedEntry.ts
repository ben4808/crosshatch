import { postJson } from "../lib/magicPuzzle";

/**
 * If this seed is not already an entry, add it with default fields.
 * display_text is the textbox value, not the normalized grid letters.
 */
export async function ensureSeedEntry(displayText: string, lang = "en"): Promise<void> {
  await postJson("/magicPuzzle/ensureSeedEntry", { displayText, lang });
}
