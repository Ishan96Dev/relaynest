import "server-only";

/** API keys for the model providers. Optional at startup: each is checked when a model that needs it is called. */
export function aiKeys() {
  return {
    nvidia: process.env.NVIDIA_API_KEY?.trim() || undefined,
    gateway: process.env.AI_GATEWAY_API_KEY?.trim() || undefined,
  };
}
