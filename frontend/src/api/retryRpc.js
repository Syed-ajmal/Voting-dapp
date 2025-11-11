// src/api/retryRpc.js
export async function withRetries(fn, { retries = 3, initialDelay = 300 } = {}) {
  let attempt = 0;
  let delay = initialDelay;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const msg = String(err?.message || err || "");
      const retriable =
        msg.includes("Too Many Requests") ||
        msg.includes("429") ||
        msg.includes("missing response") ||
        msg.toLowerCase().includes("rate") ||
        msg.toLowerCase().includes("timeout");
      if (!retriable || attempt > retries) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}
