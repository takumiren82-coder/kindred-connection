import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPlayableYouTubeMeta, searchPlayableYouTube } from "./youtube.server";

export interface YtVideo {
  id: string;
  title: string;
  channel: string;
  duration: string;
  views: string;
  thumb: string;
}

export const searchYouTube = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ q: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }): Promise<{ videos: YtVideo[]; error?: string }> => searchPlayableYouTube(data.q));

export const youtubeMeta = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().min(5).max(20) }).parse(data))
  .handler(async ({ data }): Promise<{ video: YtVideo | null; error?: string }> => getPlayableYouTubeMeta(data.id));