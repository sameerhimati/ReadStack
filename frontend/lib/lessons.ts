import type { Lesson, PipelineResponse, TopicNode } from "./types";

// A single playable unit on the Reading home: one lesson, the topic it belongs
// to, and the article URLs that ground it. Leaf topics map 1:1 to a lesson; a
// top topic with children surfaces each child leaf as its own item so the home
// stays a flat, readable list of playable lessons.
export type LessonItem = {
  id: string;
  // The top-level topic this item lives under (equals `id` when the top topic
  // is itself the leaf). Lets the Map's parent-topic clicks scroll here.
  topId: string;
  title: string;
  lesson: Lesson;
  articleUrls: string[];
};

// Flatten the topic tree into playable lesson items, in tree order.
// - Top topic that is itself a leaf with a lesson  -> one item.
// - Top topic with children                        -> one item per child leaf
//   that has a lesson.
export function deriveLessonItems(
  data: PipelineResponse,
  lessonByTopic: Map<string, Lesson>
): LessonItem[] {
  const items: LessonItem[] = [];

  const pushLeaf = (topic: TopicNode, topId: string) => {
    const lesson = lessonByTopic.get(topic.id);
    if (!lesson) return;
    items.push({
      id: topic.id,
      topId,
      title: topic.label,
      lesson,
      articleUrls: topic.article_urls,
    });
  };

  for (const top of data.topics.children) {
    if (top.children.length === 0) {
      pushLeaf(top, top.id);
    } else {
      top.children.forEach((child) => pushLeaf(child, top.id));
    }
  }

  return items;
}

// The hero: the first lesson with audio attached (the NotebookLM moment), else
// the most-grounded lesson. Returns null only when there are no items at all.
export function pickFeatured(items: LessonItem[]): LessonItem | null {
  if (items.length === 0) return null;
  const withAudio = items.find((it) => it.lesson.audio_path);
  if (withAudio) return withAudio;
  return [...items].sort(
    (a, b) => b.lesson.grounding_score - a.lesson.grounding_score
  )[0];
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// First ~N sentences of a script, for the hero lead and one-line synthesis.
export function firstSentences(text: string, n: number): string {
  const parts = text.trim().match(/[^.!?]+[.!?]+/g);
  if (!parts || parts.length === 0) return text.trim();
  return parts.slice(0, n).join(" ").trim();
}
