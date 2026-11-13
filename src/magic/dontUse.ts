import { CHAL_API } from "../lib/chalApi";

/** Record each crossed-out answer as a dont_use tag, inserting 1 or incrementing it. */
export async function saveDontUseEntries(entries: string[], lang = "en"): Promise<void> {
  const unique = [...new Set(entries.map(entry => entry.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  const res = await fetch(`${CHAL_API}/magicPuzzle/dontUse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries: unique, lang }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data && typeof data.error === "string" ? data.error : `Couldn't save don't-use entries (${res.status})`;
    throw new Error(message);
  }
}
