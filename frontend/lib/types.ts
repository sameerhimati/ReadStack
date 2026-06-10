// Shared types — mirrors the backend `POST /pipeline` response shape exactly.
// The UI codes against these so it can run standalone off the mock fixture.

export type Article = {
  url: string;
  title: string;
  tags: string[];
};

export type TopicNode = {
  id: string;
  label: string;
  article_urls: string[];
  children: TopicNode[];
  depth: number;
};

export type Lesson = {
  topic_id: string;
  script: string;
  grounded: boolean;
  grounding_score: number;
  audio_path: string | null;
  video_path: string | null;
};

export type Metrics = {
  calls_by_tier: { embed: number; weak: number; mid: number; strong: number };
  total_calls: number;
  cost_usd: number;
  baseline_cost_usd: number; // if everything ran on the strong tier
  savings_x: number; // baseline_cost_usd / cost_usd
  grounding: { checked: number; unsupported_caught: number; catch_rate: number };
};

export type PipelineResponse = {
  articles: Article[];
  topics: TopicNode; // root node of the tree
  lessons: Lesson[];
  metrics: Metrics;
};

// Tier metadata used by the metric panel.
export type Tier = "embed" | "weak" | "mid" | "strong";
