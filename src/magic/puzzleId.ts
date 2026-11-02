const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** 11-character URL-safe base64 id for a saved magic_puzzle row. */
export function generateMagicPuzzleId(): string {
  const bytes = new Uint8Array(11);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < bytes.length; i++) {
    id += ALPHABET[bytes[i] & 63];
  }
  return id;
}
