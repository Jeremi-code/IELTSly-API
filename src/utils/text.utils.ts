import { createHash } from "crypto";

/**
 * Counts the number of words in a string.
 * @param {string} text Input text
 * @returns {number} Total word count
 */
export function wordCount(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Computes a deterministic SHA-1 hash of the prompt text for deduplication.
 * @param {string} text Prompt text string
 * @returns {string} SHA-1 hash hex string
 */
export function computeTextHash(text: string): string {
  return createHash("sha1").update(text.trim().toLowerCase()).digest("hex");
}
