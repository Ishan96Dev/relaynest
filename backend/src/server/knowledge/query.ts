const STOP = new Set("the and for are but not you your with that this from have has had was were what when where which who how why can could would should will shall about into than then them they their there here our out use used using does did doing any all more most some such only own same too very just also its it's i'm you're don't".split(" "));

/** Turns a question into an OR query of plain words. Only letters and digits survive, so it is safe for to_tsquery. */
export function keywordQuery(text: string): string {
  const words = text.toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && w.length <= 40 && !STOP.has(w));
  return [...new Set(words)].slice(0, 24).join(" | ");
}

