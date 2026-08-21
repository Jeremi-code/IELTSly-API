/**
 * Calculates official IELTS overall band score from 4 module scores according to official rounding rules.
 * @param {number} listening Listening band score
 * @param {number} reading Reading band score
 * @param {number} writing Writing band score
 * @param {number} speaking Speaking band score
 * @returns {number} Rounded overall band score
 */
export function calculateOverallBand(
  listening: number,
  reading: number,
  writing: number,
  speaking: number
): number {
  const avg = (listening + reading + writing + speaking) / 4;
  const floor = Math.floor(avg);
  const frac = avg - floor;

  if (frac < 0.25) {
    return floor;
  } else if (frac < 0.75) {
    return floor + 0.5;
  } else {
    return floor + 1.0;
  }
}

/**
 * Converts raw correct question count (out of 40) for Listening or Reading to IELTS Band Score.
 * @param {number} raw Number of correct answers out of 40
 * @param {"listening" | "reading"} module Module type
 * @returns {number} IELTS Band score (2.0 to 9.0)
 */
export function rawToBand(raw: number, module: "listening" | "reading"): number {
  if (raw >= 39) return 9.0;
  if (raw >= 37) return 8.5;
  if (raw >= 35) return 8.0;
  if (raw >= 32) return 7.5;
  if (raw >= 30) return 7.0;
  if (raw >= 26) return 6.5;
  if (raw >= 23) return 6.0;
  if (raw >= 18) return 5.5;
  if (raw >= 16) return 5.0;
  if (raw >= 13) return 4.5;
  if (raw >= 10) return 4.0;
  if (raw >= 7) return 3.5;
  if (raw >= 5) return 3.0;
  return 2.0;
}
