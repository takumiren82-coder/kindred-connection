import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const LANGS = {
  hi: { label: "Hindi", name: "Hindi", bcp: "hi-IN" },
  zh: { label: "Chinese (Mandarin)", name: "Mandarin Chinese (Simplified)", bcp: "zh-CN" },
  en: { label: "English", name: "English", bcp: "en-US" },
} as const;

export type LangCode = keyof typeof LANGS;

const Input = z.object({
  text: z.string().min(1).max(600),
  from: z.enum(["hi", "zh", "en"]),
  to: z.enum(["hi", "zh", "en"]),
});

/**
 * Low-latency sentence/segment translation used by the live call translator.
 * Runs on the server so LOVABLE_API_KEY never reaches the browser.
 */
export const translateSegment = createServerFn({ method: "POST" })
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data }): Promise<{ text: string; error?: string }> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { text: "", error: "AI not configured" };
    if (data.from === data.to) return { text: data.text };

    const src = LANGS[data.from].name;
    const dst = LANGS[data.to].name;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-lite",
          messages: [
            {
              role: "system",
              content:
                `You are a live speech interpreter. Translate the user's ${src} speech into natural spoken ${dst}. ` +
                `It is a fragment of live conversation — it may be incomplete. Output ONLY the ${dst} translation, ` +
                `no quotes, no romanisation, no explanation. Keep it short and colloquial.`,
            },
            { role: "user", content: data.text },
          ],
          temperature: 0.2,
          max_tokens: 300,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("translate failed", res.status, body);
        return { text: "", error: res.status === 429 ? "rate limited" : res.status === 402 ? "out of credits" : "translation failed" };
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return { text: (json.choices?.[0]?.message?.content ?? "").trim() };
    } catch (e) {
      console.error("translate error", e);
      return { text: "", error: "translation unavailable" };
    }
  });
