/**
 * AI-leverantörsabstraktion: Anthropic (Claude) eller OpenAI — vilken nyckel
 * som än finns i miljön används (Anthropic föredras: bättre PDF-stöd).
 *
 * .env.local: ANTHROPIC_API_KEY=sk-ant-…  eller  OPENAI_API_KEY=sk-…
 * Valfritt: ANTHROPIC_MODEL / OPENAI_MODEL för att byta modell.
 */

export type AiFile = { base64: string; mimeType: string };

export function aiConfigured(): { provider: "anthropic" | "openai" } | null {
  if (process.env.ANTHROPIC_API_KEY) return { provider: "anthropic" };
  if (process.env.OPENAI_API_KEY) return { provider: "openai" };
  return null;
}

export async function callAi(
  systemPrompt: string,
  userPrompt: string,
  file?: AiFile,
  maxTokens = 2000
): Promise<string> {
  const config = aiConfigured();
  if (!config) throw new Error("Ingen AI-nyckel konfigurerad.");

  if (config.provider === "anthropic") {
    return callAnthropic(systemPrompt, userPrompt, file, maxTokens);
  }
  return callOpenAi(systemPrompt, userPrompt, file, maxTokens);
}

async function callAnthropic(system: string, prompt: string, file?: AiFile, maxTokens = 2000): Promise<string> {
  const content: unknown[] = [];
  if (file) {
    if (file.mimeType === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: file.base64 },
      });
    } else {
      content.push({
        type: "image",
        source: { type: "base64", media_type: file.mimeType, data: file.base64 },
      });
    }
  }
  content.push({ type: "text", text: prompt });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(90_000), // häng aldrig — hellre tydligt fel än evig spinner
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
    }),
  }).catch((e: Error) => {
    throw e.name === "TimeoutError"
      ? new Error("AI-anropet tog för lång tid (>90 s) — prova igen, gärna med en mindre bild.")
      : e;
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

async function callOpenAi(system: string, prompt: string, file?: AiFile, maxTokens = 2000): Promise<string> {
  if (file?.mimeType === "application/pdf") {
    throw new Error(
      "OpenAI-nyckeln kan inte läsa PDF direkt — ladda upp en bild (foto/skärmdump) i stället, " +
      "eller lägg in en ANTHROPIC_API_KEY som har PDF-stöd."
    );
  }
  const content: unknown[] = [];
  if (file) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${file.mimeType};base64,${file.base64}` },
    });
  }
  content.push({ type: "text", text: prompt });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** Plocka ut JSON ur AI-svar (hanterar ```json-staket och omgivande text) */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const objStart = candidate.indexOf("{");
  const arrStart = candidate.indexOf("[");
  const useArray = arrStart >= 0 && (objStart < 0 || arrStart < objStart);
  const start = useArray ? arrStart : objStart;
  const end = useArray ? candidate.lastIndexOf("]") : candidate.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("AI-svaret innehöll ingen JSON.");
  return JSON.parse(candidate.slice(start, end + 1));
}
