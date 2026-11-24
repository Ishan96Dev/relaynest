/**
 * Loads the browser Supabase client on demand. supabase-js is ~75 kB gzipped; importing it statically would put it in the
 * first-load bundle of every page that merely might talk to Supabase later. Awaiting this keeps it out of that bundle.
 */
export async function createClient() {
  return (await import("./client")).createClient();
}

/** Starts downloading the client in the background (after the page is interactive) so the first click is not delayed. */
export function preloadSupabase() {
  const run = () => { void import("./client"); };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}
