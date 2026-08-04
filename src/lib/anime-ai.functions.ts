import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Server function: transforms a photo into a Studio-Ghibli / anime style
// using the Lovable AI Gateway (Gemini 3.1 Flash Image – "Nano Banana 2").
// This gives ~WhatsApp-quality results because it's a real image model, not
// a hand-rolled canvas filter.
//
// The client sends a base64 JPEG/PNG (no data URL prefix). We return a
// base64 PNG of the stylized image.

const StylePrompts: Record<string, string> = {
  anime:
    "Redraw this exact photo in a beautiful hand-painted Studio Ghibli / Makoto Shinkai anime style. Preserve the subject, composition, pose and background layout precisely. Use soft cel-shading, clean confident line art, warm cinematic lighting, painterly watercolor textures and rich saturated colors. Do not add text, watermarks or extra characters. Output a single high-quality illustration only.",
  warm:
    "Redraw this photo as a warm, sun-drenched anime illustration with golden-hour lighting and gentle painterly brush strokes. Preserve subject, composition and layout exactly. No text or watermark.",
  moody:
    "Redraw this photo as a moody cinematic anime illustration with cool teal shadows, dramatic rim lighting and painterly detail. Preserve subject, composition and layout exactly. No text or watermark.",
  bw:
    "Redraw this photo as a black-and-white manga-style ink illustration with clean line art, screentones and dramatic contrast. Preserve subject, composition and layout exactly. No text or watermark.",
};

export const stylizeAnime = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        imageBase64: z.string().min(100),
        mimeType: z.string().default("image/jpeg"),
        style: z.enum(["anime", "warm", "moody", "bw"]).default("anime"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured. Please contact support.");

    const prompt = StylePrompts[data.style] ?? StylePrompts.anime;
    const dataUrl = `data:${data.mimeType};base64,${data.imageBase64}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Anime AI is busy right now. Please try again in a moment.");
      if (res.status === 402) throw new Error("AI credits are exhausted. Please add credits in your workspace.");
      throw new Error(`Anime AI failed (${res.status}). ${text.slice(0, 180)}`);
    }

    const json = (await res.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("Anime AI returned no image. Try a different photo.");
    return { b64, mimeType: "image/png" };
  });
