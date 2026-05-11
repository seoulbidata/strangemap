const KANANA_ENDPOINT =
  "https://kanana-o.a2s-endpoint.kr-central-2.kakaocloud.com/v1/chat/completions";

function getApiKeys(): string[] {
  const keys: string[] = [];
  if (process.env.KANANA_API_KEY) keys.push(process.env.KANANA_API_KEY);
  if (process.env.KANANA_API_KEY_2) keys.push(process.env.KANANA_API_KEY_2);
  return keys;
}

export async function callKananaWithFallback(
  messages: { role: string; content: string }[],
  maxTokens: number
): Promise<string | null> {
  const keys = getApiKeys();
  if (keys.length === 0) return null;

  for (const key of keys) {
    try {
      const response = await fetch(KANANA_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "kanana-o", messages, max_tokens: maxTokens }),
      });
      if (response.status === 429) {
        console.warn("[Kanana] rate limit on key, trying next...");
        continue;
      }
      if (!response.ok) {
        console.error("[Kanana] HTTP", response.status);
        return null;
      }
      const data = await response.json();
      return data.choices?.[0]?.message?.content ?? null;
    } catch {
      console.error("[Kanana] fetch error, trying next key...");
      continue;
    }
  }
  return null;
}
