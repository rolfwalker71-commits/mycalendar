import dotenv from "dotenv";
import { GEMINI_API_KEY } from "./config.js";
import { query } from "./db.js";

const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

let cachedKey: string | null | undefined;

type GeminiError = Error & { code: string; status?: number };

function geminiError(message: string, code: string, status?: number): GeminiError {
  return Object.assign(new Error(message), { code, status });
}

function envKey(): string {
  return (process.env.GEMINI_API_KEY ?? GEMINI_API_KEY ?? "").trim();
}

export async function loadGeminiKey(): Promise<string | null> {
  if (!cachedKey) {
    dotenv.config();
  }
  const fromEnv = envKey();
  if (fromEnv && fromEnv !== cachedKey) {
    cachedKey = fromEnv;
    await query(
      `INSERT INTO app_settings (key, value) VALUES ('gemini_api_key', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [fromEnv],
    );
    return cachedKey;
  }
  if (cachedKey) return cachedKey;
  const { rows } = await query<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'gemini_api_key'",
  );
  cachedKey = rows[0]?.value?.trim() || null;
  if (cachedKey) console.log("Gemini-API-Schlüssel aus der Datenbank geladen.");
  return cachedKey;
}

export function geminiAvailable(): boolean {
  if (cachedKey || envKey()) return true;
  dotenv.config();
  return Boolean(envKey());
}

function extractText(data: {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
}): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const visible = parts.filter((p) => p.text && !p.thought).map((p) => p.text ?? "");
  const fallback = parts.map((p) => p.text ?? "");
  return (visible.length ? visible : fallback).join("").trim();
}

function publicGeminiMessage(raw: string, fallback: string): string {
  const message = raw.replace(/\s+/g, " ").trim();
  if (/prepayment credits are depleted|billing#prepay/i.test(message)) {
    return "Gemini-Guthaben ist aufgebraucht. Bitte in Google AI Studio aufladen: https://aistudio.google.com/";
  }
  if (/API key not valid|API_KEY_INVALID/i.test(message)) {
    return "Gemini-API-Schlüssel ist ungültig. GEMINI_API_KEY in der .env prüfen.";
  }
  if (/Generative Language API has not been used|API has not been enabled/i.test(message)) {
    return "Die Generative Language API ist für diesen Schlüssel nicht aktiviert.";
  }
  return message || fallback;
}

function isFatalStatus(status: number, message: string): boolean {
  if (status === 401 || status === 403) return true;
  if (status === 429 && /depleted|billing|quota/i.test(message)) return true;
  if (/api key|PERMISSION_DENIED|API_KEY_INVALID/i.test(message)) return true;
  return false;
}

export async function generateGeminiText(prompt: string): Promise<string> {
  const key = await loadGeminiKey();
  if (!key) {
    throw geminiError("Gemini ist nicht konfiguriert.", "gemini_config", 503);
  }
  let last = "Gemini antwortet nicht.";
  let lastStatus = 502;
  for (const model of MODELS) {
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.25, maxOutputTokens: 2048 },
          }),
        },
      );
    } catch (err) {
      last = err instanceof Error ? err.message : last;
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string };
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      promptFeedback?: { blockReason?: string };
    };
    if (!res.ok) {
      last = publicGeminiMessage(data.error?.message || last, last);
      lastStatus = res.status;
      console.warn(`Gemini ${model}: HTTP ${res.status} — ${last}`);
      if (isFatalStatus(res.status, data.error?.message || last)) {
        const code = /guthaben|billing|depleted/i.test(last) ? "gemini_billing" : "gemini";
        throw geminiError(last, code, res.status);
      }
      continue;
    }
    const text = extractText(data);
    if (text) return text;
    last = data.promptFeedback?.blockReason
      ? `Gemini hat die Antwort blockiert (${data.promptFeedback.blockReason}).`
      : "Gemini lieferte keinen Text.";
  }
  throw geminiError(last, "gemini", lastStatus);
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
