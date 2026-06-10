import type { PipelineResponse, TopicNode, Lesson } from "./types";
import { MOCK } from "./mock";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// POST the urls to the pipeline (empty array => backend's curated corpus).
// On ANY failure (network, non-200, empty body) fall back to the mock so the
// demo always renders. Returns a flag so the UI can surface sample-data state.
export async function buildStack(
  urls: string[]
): Promise<{ data: PipelineResponse; usedMock: boolean }> {
  try {
    const res = await fetch(`${API_URL}/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    if (!res.ok) throw new Error(`pipeline returned ${res.status}`);
    const data = (await res.json()) as PipelineResponse;
    if (!data || !data.topics || !data.lessons) {
      throw new Error("pipeline returned an empty/invalid body");
    }
    return { data, usedMock: false };
  } catch {
    return { data: MOCK, usedMock: true };
  }
}

// POST a single url to /add. The endpoint is being built in parallel, so the
// shape may be partial — we parse defensively and the UI handles nulls. Throws
// on failure so the caller can surface a friendly error (no silent mock here:
// the optimistic row is the fallback UX).
export type AddResponse = {
  topics?: TopicNode;
  lesson?: Lesson | null;
  article?: { url: string; title?: string };
};

export async function addUrl(url: string): Promise<AddResponse> {
  const res = await fetch(`${API_URL}/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`add returned ${res.status}`);
  return (await res.json()) as AddResponse;
}

// Resolve a stored audio_path (may be a bare filename or a path) to the
// backend's /media/<file> route.
export function mediaUrl(audioPath: string): string {
  const base = audioPath.split("/").pop() ?? audioPath;
  return `${API_URL}/media/${base}`;
}
