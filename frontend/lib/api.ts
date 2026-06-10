import type { PipelineResponse } from "./types";
import { MOCK } from "./mock";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// A handful of real web links from the knowledge-vault reading queue, used by
// the "Load demo corpus" button. Web links only — no auth-walled sources.
export const DEMO_CORPUS: string[] = [
  "https://www.deeplearning.ai/the-batch/issue-235",
  "https://huggingface.co/blog/llama-3-1-8b",
  "https://blog.vllm.ai/2024/continuous-batching",
  "https://www.akamai.com/blog/edge-inference-gpus",
  "https://arxiv.org/abs/2401.04088",
  "https://www.pinecone.io/learn/vector-embeddings",
  "https://txt.cohere.com/semantic-clustering",
  "https://eugeneyan.com/writing/llm-grounding",
  "https://www.anthropic.com/research/measuring-faithfulness",
  "https://hamel.dev/blog/posts/llm-judge",
];

// POST the urls to the pipeline. On ANY failure (network, non-200, empty body)
// fall back to the mock so the demo always shows something. Returns a flag so
// the UI can surface that it's running on sample data.
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
