import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Real YouTube search via YouTube's public innertube endpoint (same one the
// youtube.com web player uses). No API key/quota required, works from the
// server runtime with plain fetch.

export interface YtVideo {
  id: string;
  title: string;
  channel: string;
  duration: string;
  views: string;
  thumb: string;
}

const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

type AnyRec = Record<string, any>;

function textOf(node: AnyRec | undefined): string {
  if (!node) return "";
  if (typeof node.simpleText === "string") return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r: AnyRec) => r.text ?? "").join("");
  return "";
}

function collectVideos(node: unknown, out: YtVideo[]) {
  if (!node || typeof node !== "object" || out.length >= 25) return;
  if (Array.isArray(node)) {
    for (const child of node) collectVideos(child, out);
    return;
  }
  const rec = node as AnyRec;
  const v = rec.videoRenderer as AnyRec | undefined;
  if (v && typeof v.videoId === "string") {
    out.push({
      id: v.videoId,
      title: textOf(v.title) || "Untitled",
      channel: textOf(v.ownerText) || textOf(v.longBylineText) || "",
      duration: textOf(v.lengthText),
      views: textOf(v.shortViewCountText),
      thumb: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
    });
  }
  for (const key of Object.keys(rec)) {
    if (key === "videoRenderer") continue;
    collectVideos(rec[key], out);
  }
}

export const searchYouTube = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ q: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }): Promise<{ videos: YtVideo[]; error?: string }> => {
    try {
      const res = await fetch(
        `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}&prettyPrint=false`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            context: {
              client: {
                clientName: "WEB",
                clientVersion: "2.20240101.00.00",
                hl: "en",
                gl: "US",
              },
            },
            query: data.q,
            params: "EgIQAQ%3D%3D", // videos only
          }),
        },
      );
      if (!res.ok) {
        return { videos: [], error: `YouTube search failed (${res.status})` };
      }
      const json = (await res.json()) as unknown;
      const out: YtVideo[] = [];
      collectVideos(json, out);
      const seen = new Set<string>();
      const videos = out.filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
      return { videos: videos.slice(0, 20) };
    } catch (e) {
      return { videos: [], error: e instanceof Error ? e.message : "Search unavailable" };
    }
  });

export const youtubeMeta = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().min(5).max(20) }).parse(data))
  .handler(async ({ data }): Promise<{ video: YtVideo | null }> => {
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${data.id}&format=json`,
      );
      if (!res.ok) return { video: null };
      const j = (await res.json()) as { title?: string; author_name?: string };
      return {
        video: {
          id: data.id,
          title: j.title ?? "YouTube video",
          channel: j.author_name ?? "",
          duration: "",
          views: "",
          thumb: `https://i.ytimg.com/vi/${data.id}/mqdefault.jpg`,
        },
      };
    } catch {
      return { video: null };
    }
  });