// Sends one tiny chat request to a model and prints status, latency and the start of the answer.
// Never prints the API key. Usage: node --env-file=.env scripts/check-ai-provider.mjs [model-id] [nvidia|vercel]
const model = process.argv[2] ?? "nvidia/nemotron-3.5-lightning-30b-a3b";
const source = process.argv[3] ?? "nvidia";
const key = source === "nvidia" ? process.env.NVIDIA_API_KEY : process.env.AI_GATEWAY_API_KEY;
const base = source === "nvidia" ? "https://integrate.api.nvidia.com/v1" : "https://ai-gateway.vercel.sh/v1";

if (!key) {
  console.log(`${source === "nvidia" ? "NVIDIA_API_KEY" : "AI_GATEWAY_API_KEY"} is empty or missing in .env`);
  process.exit(1);
}
const started = Date.now();
try {
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "Say hi in five words." }], max_tokens: 64, stream: false }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  console.log(`status ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(text.slice(0, 400));
} catch (e) {
  console.log(`failed after ${((Date.now() - started) / 1000).toFixed(1)}s: ${e.name}: ${e.message}`);
}
