import { createFileRoute } from "@tanstack/react-router";

// Proxy Project Gutenberg plain text through the Worker so browser
// clients don't hit a CORS wall. The Gutenberg servers don't send
// Access-Control-Allow-Origin, so a direct browser fetch fails.
export const Route = createFileRoute("/api/public/book/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = String(params.id).replace(/[^0-9]/g, "");
        if (!id) return new Response("Bad id", { status: 400 });
        const urls = [
          `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
          `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
          `https://www.gutenberg.org/files/${id}/${id}.txt`,
        ];
        for (const url of urls) {
          try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const text = await res.text();
            return new Response(text, {
              status: 200,
              headers: {
                "content-type": "text/plain; charset=utf-8",
                "cache-control": "public, max-age=86400",
                "access-control-allow-origin": "*",
              },
            });
          } catch {
            /* try next */
          }
        }
        return new Response("Not found", { status: 404 });
      },
    },
  },
});