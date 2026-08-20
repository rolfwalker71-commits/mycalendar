import { GEMINI_API_KEY } from "./config.js";
import { query } from "./db.js";

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];

let cachedKey: string | null | undefined;

export async function loadGeminiKey(): Promise<string | null> {
  if (cachedKey !== undefined) return cachedKey;
  const env = GEMINI_API_KEY;
  if (env) {
    cachedKey = env;
    await query(
      `INSERT INTO app_settings (key, value) VALUES ('gemini_api_key', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [env],
    );
    return cachedKey;
  }
  const { rows } = await query<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'gemini_api_key'",
  );
  cachedKey = rows[0]?.value?.trim() || null;
  if (cachedKey) console.log("Gemini-API-Schlüssel aus der Datenbank geladen.");
  return cachedKey;
}

export function geminiAvailable(): boolean {
  return Boolean(cachedKey);
}

export async function generateGeminiText(prompt: string): Promise<string> {
  const key = await loadGeminiKey();
  if (!key) {
    throw Object.assign(new Error("Gemini ist nicht konfiguriert."), { code: "gemini_config" });
  }
  let last = "Gemini antwortet nicht.";
  for (const model of MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.25, maxOutputTokens: 768 },
        }),
      },
    );
    const data = (await res.json()) as {
      error?: { message?: string };
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    if (!res.ok) {
      last = data.error?.message || last;
      continue;
    }
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    if (text) return text;
  }
  throw Object.assign(new Error(last), { code: "gemini" });
}

export async function cachedGemini(
  userId: string,
  kind: string,
  ref: string,
  prompt: string,
): Promise<{ text: string; cached: boolean }> {
  const { rows } = await query<{ text: string }>(
    `SELECT text FROM gemini_cache
      WHERE user_id = $1 AND kind = $2 AND ref = $3
        AND created_at > NOW() - INTERVAL '12 hours'`,
    [userId, kind, ref],
  );
  if (rows[0]?.text) return { text: rows[0].text, cached: true };
  const text = await generateGeminiText(prompt);
  await query(
    `INSERT INTO gemini_cache (user_id, kind, ref, text)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, kind, ref) DO UPDATE SET text = EXCLUDED.text, created_at = NOW()`,
    [userId, kind, ref, text],
  );
  return { text, cached: false };
}
