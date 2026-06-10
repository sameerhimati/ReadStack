import type { PipelineResponse, TopicNode, Lesson } from "./types";
import { MOCK } from "./mock";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// GET the cached pipeline snapshot — ZERO backend inference. This is the default
// load (what judges hit on every view); rebuilding is the explicit buildStack call.
// Falls back to MOCK so the demo always renders.
export async function fetchSnapshot(): Promise<{
  data: PipelineResponse;
  usedMock: boolean;
}> {
  try {
    const res = await fetch(`${API_URL}/snapshot`, { cache: "no-store" });
    if (!res.ok) throw new Error(`snapshot returned ${res.status}`);
    const data = (await res.json()) as PipelineResponse;
    if (!data || !data.topics || !data.lessons) {
      throw new Error("snapshot empty/invalid");
    }
    return { data, usedMock: false };
  } catch {
    return { data: MOCK, usedMock: true };
  }
}

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

export async function addUrl(
  url: string,
  topicId?: string
): Promise<AddResponse> {
  const res = await fetch(`${API_URL}/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(topicId ? { url, topic_id: topicId } : { url }),
  });
  if (!res.ok) throw new Error(`add returned ${res.status}`);
  return (await res.json()) as AddResponse;
}

// PATCH a topic's label. Pure metadata edit (no inference), so it's cheap and
// optimistic at the call site. Parses defensively; on ANY failure returns
// { ok: false } so the UI can revert the inline edit instead of crashing.
export type RenameResponse =
  | { ok: true; topic_id: string; label: string }
  | { ok: false; error?: string };

export async function renameTopic(
  topicId: string,
  label: string
): Promise<RenameResponse> {
  try {
    const res = await fetch(`${API_URL}/topic/${topicId}/label`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) throw new Error(`rename returned ${res.status}`);
    const data = (await res.json()) as RenameResponse;
    if (!data || !data.ok) throw new Error("rename returned an unsuccessful body");
    return data;
  } catch {
    return { ok: false };
  }
}

// POST an article move to a new topic. The backend re-derives affected topics
// and returns the full updated snapshot, so the caller swaps `data` wholesale.
// Parses defensively; on ANY failure returns { ok: false } so the UI keeps the
// current placement instead of crashing.
export type MoveResponse =
  | { ok: true; url: string; topic_id: string; snapshot: PipelineResponse }
  | { ok: false; error?: string };

export async function moveArticle(
  url: string,
  topicId: string
): Promise<MoveResponse> {
  try {
    const res = await fetch(`${API_URL}/article/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, topic_id: topicId }),
    });
    if (!res.ok) throw new Error(`move returned ${res.status}`);
    const data = (await res.json()) as MoveResponse;
    if (!data || !data.ok || !data.snapshot) {
      throw new Error("move returned an unsuccessful/invalid body");
    }
    return data;
  } catch {
    return { ok: false };
  }
}

// POST a topic + desired length to /lesson/regenerate. Costs one inference call
// (~1-3s), so callers show a loading state. Parses defensively and on ANY
// failure (network, non-200, malformed body) returns { ok: false } so the UI
// can keep the existing lesson text instead of crashing.
export type RegenerateResponse =
  | { ok: true; lesson: Lesson; length: string }
  | { ok: false; error?: string };

export async function regenerateLesson(
  topicId: string,
  length: string
): Promise<RegenerateResponse> {
  try {
    const res = await fetch(`${API_URL}/lesson/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic_id: topicId, length }),
    });
    if (!res.ok) throw new Error(`regenerate returned ${res.status}`);
    const data = (await res.json()) as RegenerateResponse;
    if (!data || !data.ok || !data.lesson) {
      throw new Error("regenerate returned an unsuccessful/invalid body");
    }
    return data;
  } catch {
    return { ok: false };
  }
}

// Resolve a stored audio_path (may be a bare filename or a path) to the
// backend's /media/<file> route.
export function mediaUrl(audioPath: string): string {
  const base = audioPath.split("/").pop() ?? audioPath;
  return `${API_URL}/media/${base}`;
}
