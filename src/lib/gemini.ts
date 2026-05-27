const DEFAULT_MODEL = "gemini-3.1-flash-lite";

type GenerateGeminiJsonTextOptions = {
  prompt: string;
  systemInstruction: string;
  maxOutputTokens: number;
  responseSchema?: unknown;
};

function convertSchemaToLowercase(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;

  if (Array.isArray(schema)) {
    return schema.map(convertSchemaToLowercase);
  }

  const result: any = {};
  for (const key in schema) {
    if (key === "type" && typeof schema[key] === "string") {
      result[key] = schema[key].toLowerCase();
    } else {
      result[key] = convertSchemaToLowercase(schema[key]);
    }
  }
  return result;
}

/**
 * 구글 AI 스튜디오 Native Gemini 3.1 Flash Lite API를 직접 호출하여 0.5초대 초고속 응답을 보장합니다.
 */
export async function generateGeminiJsonText({
  prompt,
  systemInstruction,
  maxOutputTokens,
  responseSchema,
}: GenerateGeminiJsonTextOptions): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[Gemini Native] Error: GEMINI_API_KEY가 설정되지 않았습니다.");
    return null;
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: maxOutputTokens,
          responseMimeType: "application/json",
          ...(responseSchema ? {
            responseSchema: convertSchemaToLowercase(responseSchema),
          } : {}),
        },
      }),
      signal: AbortSignal.timeout(15000), // 15초 타임아웃
    });

    if (!response.ok) {
      console.error("[Gemini Native] HTTP 에러:", response.status, await response.text().catch(() => ""));
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    return text;
  } catch (error) {
    console.error("[Gemini Native] API 호출 실패:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export function extractJsonObjectText(text: string): string | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

export function extractJsonArrayText(text: string): string | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

export function parseJsonWithEscapedControlChars<T>(jsonText: string): T | null {
  try {
    return JSON.parse(jsonText) as T;
  } catch (originalError) {
    let repaired = "";
    let inString = false;
    let escaped = false;

    for (const char of jsonText) {
      if (escaped) {
        repaired += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        repaired += char;
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = !inString;
        repaired += char;
        continue;
      }

      if (inString && char === "\n") {
        repaired += "\\n";
        continue;
      }

      if (inString && char === "\r") {
        repaired += "\\r";
        continue;
      }

      if (inString && char === "\t") {
        repaired += "\\t";
        continue;
      }

      repaired += char;
    }

    try {
      return JSON.parse(repaired) as T;
    } catch (repairedError) {
      console.error("[JSON parse] failed", {
        length: jsonText.length,
        starts: jsonText.slice(0, 1),
        ends: jsonText.slice(-1),
        originalError: originalError instanceof Error ? originalError.message : String(originalError),
        repairedError: repairedError instanceof Error ? repairedError.message : String(repairedError),
      });
      return null;
    }
  }
}
