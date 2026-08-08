import { createFileRoute } from "@tanstack/react-router";

// Streaming text-to-speech for the live call translator.
// Public route (called from the call UI); the API key stays server-side.
// Returns the Lovable AI SSE stream unchanged so playback can start early.
export const Route = createFileRoute("/api/public/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("TTS not configured", { status: 503 });

        let body: { text?: string; lang?: string; voice?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const text = (body.text ?? "").trim().slice(0, 700);
        if (!text) return new Response("Missing text", { status: 400 });

        const voice = /^[a-z]{3,12}$/.test(body.voice ?? "") ? body.voice! : "alloy";
        const langHint =
          body.lang === "hi" ? "Hindi" : body.lang === "zh" ? "Mandarin Chinese" : "English";

        try {
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input: text,
              voice,
              instructions: `Speak in ${langHint} as a natural live interpreter: conversational, clear, brisk.`,
              stream_format: "sse",
              response_format: "pcm",
            }),
          });
          if (!upstream.ok || !upstream.body) {
            const msg = await upstream.text().catch(() => "");
            console.error("tts failed", upstream.status, msg);
            return new Response(msg || "TTS failed", { status: upstream.status || 502 });
          }
          return new Response(upstream.body, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
          });
        } catch (e) {
          console.error("tts error", e);
          return new Response("TTS unavailable", { status: 502 });
        }
      },
    },
  },
});
