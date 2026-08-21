import { createHash } from "crypto";

/**
 * Utility functions for text processing
 */

export function wordCount(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Computes a deterministic SHA-1 hash of the question text.
 * Used for deduplication: identical questions produce the same hash.
 */
export function computeTextHash(text: string): string {
  return createHash("sha1").update(text.trim().toLowerCase()).digest("hex");
}
