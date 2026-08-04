export interface YouTubeVideoDto {
  id: string;
  title: string;
  channel: string;
  duration: string;
  views: string;
  thumb: string;
}

type AnyRecord = Record<string, unknown>;

const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const PLAYER_CLIENT = {
  clientName: "ANDROID",
  clientVersion: "20.10.38",
  androidSdkVersion: 35,
  hl: "en",
  gl: "US",
};

function textOf(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const rec = node as AnyRecord;
  if (typeof rec.simpleText === "string") return rec.simpleText;
  if (!Array.isArray(rec.runs)) return "";
  return rec.runs
    .map((run) => (run && typeof run === "object" && typeof (run as AnyRecord).text === "string" ? (run as AnyRecord).text : ""))
    .join("");
}

function collectVideos(node: unknown, out: YouTubeVideoDto[]) {
  if (!node || typeof node !== "object" || out.length >= 40) return;
  if (Array.isArray(node)) {
    for (const child of node) collectVideos(child, out);
    return;
  }
  const rec = node as AnyRecord;
  const renderer = rec.videoRenderer;
  if (renderer && typeof renderer === "object") {
    const video = renderer as AnyRecord;
    if (typeof video.videoId === "string") {
      out.push({
        id: video.videoId,
        title: textOf(video.title) || "Untitled",
        channel: textOf(video.ownerText) || textOf(video.longBylineText),
        duration: textOf(video.lengthText),
        views: textOf(video.shortViewCountText),
        thumb: `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`,
      });
    }
  }
  for (const [key, value] of Object.entries(rec)) {
    if (key !== "videoRenderer") collectVideos(value, out);
  }
}

async function getPlayability(id: string): Promise<{ playable: boolean; reason?: string }> {
  try {
    const response = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "com.google.android.youtube/20.10.38" },
        body: JSON.stringify({
          context: { client: PLAYER_CLIENT },
          videoId: id,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      },
    );
    if (!response.ok) return { playable: false, reason: "YouTube could not verify this video." };
    const json = (await response.json()) as AnyRecord;
    const status = (json.playabilityStatus ?? {}) as AnyRecord;
    const playable = status.status === "OK" && status.playableInEmbed !== false && Boolean(json.streamingData);
    return {
      playable,
      reason: typeof status.reason === "string" ? status.reason : undefined,
    };
  } catch {
    return { playable: false, reason: "YouTube could not verify this video." };
  }
}

export async function searchPlayableYouTube(query: string): Promise<{ videos: YouTubeVideoDto[]; error?: string }> {
  try {
    const response = await fetch(
      `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}&prettyPrint=false`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          context: { client: { clientName: "WEB", clientVersion: "2.20260801.00.00", hl: "en", gl: "US" } },
          query,
          params: "EgIQAQ%3D%3D",
        }),
      },
    );
    if (!response.ok) return { videos: [], error: `YouTube search failed (${response.status})` };

    const found: YouTubeVideoDto[] = [];
    collectVideos(await response.json(), found);
    const unique = found.filter((video, index, all) => all.findIndex((item) => item.id === video.id) === index);
    const checked = await Promise.all(
      unique.slice(0, 24).map(async (video) => ({ video, playable: (await getPlayability(video.id)).playable })),
    );
    return { videos: checked.filter((item) => item.playable).map((item) => item.video).slice(0, 15) };
  } catch (error) {
    return { videos: [], error: error instanceof Error ? error.message : "Search unavailable" };
  }
}

export async function getPlayableYouTubeMeta(id: string): Promise<{ video: YouTubeVideoDto | null; error?: string }> {
  const playability = await getPlayability(id);
  if (!playability.playable) {
    return { video: null, error: playability.reason || "This video cannot be played inside a watch room." };
  }
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (!response.ok) return { video: null, error: "YouTube video details are unavailable." };
    const json = (await response.json()) as { title?: string; author_name?: string };
    return {
      video: {
        id,
        title: json.title ?? "YouTube video",
        channel: json.author_name ?? "",
        duration: "",
        views: "",
        thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      },
    };
  } catch {
    return { video: null, error: "YouTube video details are unavailable." };
  }
}