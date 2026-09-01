/**
 * AI-leverantörsabstraktion: Anthropic (Claude) eller OpenAI.
 *
 * Nyckeln hämtas i första hand från Inställningar (settings.ai_api_key i
 * databasen — leverantör känns igen på prefixet), i andra hand från miljön
 * (ANTHROPIC_API_KEY / OPENAI_API_KEY). Anthropic föredras: bättre PDF-stöd.
 * Modell: settings.ai_model → ANTHROPIC_MODEL/OPENAI_MODEL → standard.
 */

export type AiFile = { base64: string; mimeType: string };

export type AiConfig = {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
};

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
export const DEFAULT_OPENAI_MODEL = "gpt-4o";

/**
 * Lös ut AI-konfigurationen. `settingsKey`/`settingsModel` kommer från
 * settings-tabellen (kan vara null); miljövariabler används som fallback
 * så en självhostad instans kan välja fritt.
 */
export function resolveAiConfig(
  settingsKey?: string | null,
  settingsModel?: string | null
): AiConfig | null {
  const key = settingsKey?.trim() || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return null;

  const provider: AiConfig["provider"] =
    key.startsWith("sk-ant-") || (!settingsKey?.trim() && !!process.env.ANTHROPIC_API_KEY)
      ? "anthropic"
      : key.startsWith("sk-") && !key.startsWith("sk-ant-")
        ? "openai"
        : "anthropic";

  const model =
    settingsModel?.trim() ||
    (provider === "anthropic"
      ? process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL
      : process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL);

  return { provider, apiKey: key, model };
}

export async function callAi(
  config: AiConfig,
  systemPrompt: string,
  userPrompt: string,
  file?: AiFile,
  maxTokens = 2000
): Promise<string> {
  if (config.provider === "anthropic") {
    return callAnthropic(config, systemPrompt, userPrompt, file, maxTokens);
  }
  return callOpenAi(config, systemPrompt, userPrompt, file, maxTokens);
}

async function callAnthropic(
  config: AiConfig, system: string, prompt: string, file?: AiFile, maxTokens = 2000
): Promise<string> {
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
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
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
  // Modeller med utökat tänkande kan leda med ett thinking-block — plocka textblocket.
  const textBlock = (data.content as { type?: string; text?: string }[] | undefined)
    ?.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}

async function callOpenAi(
  config: AiConfig, system: string, prompt: string, file?: AiFile, maxTokens = 2000
): Promise<string> {
  if (file?.mimeType === "application/pdf") {
    throw new Error(
      "OpenAI-nyckeln kan inte läsa PDF direkt — ladda upp en bild (foto/skärmdump) i stället, " +
      "eller använd en Anthropic-nyckel (sk-ant-…) som har PDF-stöd."
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
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
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
