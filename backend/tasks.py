"""(B) The inference layer — tag / embed / cluster-name / lesson / verify.

THE HEART OF THE THESIS. Every function calls router.route() to pick a tier,
records that decision into metrics.RUN, then either calls Akamai (real) or
returns a deterministic mock (when MOCK_INFERENCE / no endpoint). The routing
metric is real either way — only the model OUTPUT is stubbed.

Sameer owns the REAL prompts + parsing. The mock branches below exist purely so
the full pipeline + frontend demo runs today; swap each `if akamai.MOCK` block
for a real `await akamai.chat(...)` call and its parse. Look for `# REAL:` notes.
"""
from __future__ import annotations

import hashlib
import re
from collections import Counter

import akamai
import metrics
from contracts import Article, Lesson, Task, TopicNode
from router import route

_TEXT_CAP = 6000  # chars of article text fed to a model; keeps volume calls cheap


async def tag(article: Article) -> list[str]:
    """Extract a few topic tags for one article (high volume, weak tier)."""
    tier = route(Task.TAG).tier
    metrics.RUN.record(Task.TAG, tier)

    if akamai.MOCK:
        tags = _keywords(article.title or article.text, k=4)
    else:
        # REAL: prompt the weak model for 3-5 comma-separated topic tags.
        out = await akamai.chat(
            tier.value,
            f"Give 3-5 short topic tags (comma-separated, lowercase) for:\n"
            f"Title: {article.title}\n{article.text[:_TEXT_CAP]}",
            system="You label articles with concise topic tags.",
        )
        tags = [t.strip().lower() for t in out.split(",") if t.strip()][:5]

    article.tags = tags
    return tags


async def embed(articles: list[Article]) -> list[Article]:
    """Embed every article (highest volume task -> the embed tier)."""
    for _ in articles:
        metrics.RUN.record(Task.EMBED, route(Task.EMBED).tier)
    vectors = await akamai.embed([a.text[:_TEXT_CAP] or a.title for a in articles])
    for a, v in zip(articles, vectors):
        a.embedding = v
    return articles


async def cluster_name(articles: list[Article], *, avoid: list[str] | None = None) -> str:
    """Name a cluster from its articles (structural, weak tier).

    `avoid` carries the parent/sibling labels already chosen so a child never
    repeats its parent ("Reinforcement -> Reinforcement") — it must be a more
    specific, distinct facet."""
    tier = route(Task.CLUSTER).tier
    metrics.RUN.record(Task.CLUSTER, tier)

    if akamai.MOCK:
        return _mock_label(articles)

    # REAL: ask the weak model for a specific 2-4 word label given the titles.
    titles = "\n".join(f"- {a.title}" for a in articles[:12])
    avoid = [a for a in (avoid or []) if a]
    avoid_line = (
        f"\nDo NOT reuse these broader labels — choose a more specific, distinct "
        f"facet: {', '.join(avoid)}." if avoid else ""
    )
    out = await akamai.chat(
        tier.value,
        f"Give a specific 2-4 word topic label for this group of articles. "
        f"Reply with ONLY the label, no quotes.\n{titles}{avoid_line}",
        system="You name topic clusters concisely and distinctly.",
        max_tokens=16,
        temperature=0.2,
    )
    label = out.strip().strip('"')
    label = label.splitlines()[0][:48] if label else ""
    return label or "Misc"


# length picker -> (target words, max_tokens budget for the model)
_LESSON_LEN = {"short": (70, 160), "medium": (160, 340), "long": (340, 700)}


async def lesson(topic: TopicNode, articles: list[Article], length: str = "medium") -> Lesson:
    """Write the lesson a human consumes, at the chosen length (short/medium/long).

    Hero topics (big clusters) escalate to the strong tier via route()."""
    tier = route(Task.LESSON, topic_size=len(articles)).tier
    metrics.RUN.record(Task.LESSON, tier)
    target_words, max_tok = _LESSON_LEN.get(length, _LESSON_LEN["medium"])

    if akamai.MOCK:
        script = _mock_lesson(topic, articles, target_words)
    else:
        # REAL: grounded micro-lesson in light Markdown, ONLY from the sources.
        src = "\n\n".join(f"[{a.title}] {a.text[:1500]}" for a in articles[:6])
        script = await akamai.chat(
            tier.value,
            f"Write a ~{target_words}-word lesson on '{topic.label}', grounded ONLY in "
            f"the sources below. Use light Markdown: a short **bold title**, then prose, "
            f"with a few '- ' bullets only if they help. No preamble. Do not invent facts."
            f"\n\n{src}",
            system="You write grounded, bite-size lessons strictly from the given sources.",
            max_tokens=max_tok,
            temperature=0.4,
        )

    return Lesson(topic_id=topic.id, script=script, grounded=False, grounding_score=0.0)


async def verify(lesson_obj: Lesson, articles: list[Article]) -> Lesson:
    """Grounding check on a lesson (weak tier, escalates when unsure)."""
    if akamai.MOCK:
        score = _mock_grounding_score(lesson_obj)
    else:
        # First pass on the weak tier; route() escalates the SECOND pass to strong
        # when this score is low. (Sameer: wire the real entailment prompt here.)
        score = await _real_grounding_pass("weak", lesson_obj, articles)

    tier = route(Task.VERIFY, grounding_score=score).tier
    metrics.RUN.record(Task.VERIFY, tier)
    if not akamai.MOCK and tier.value == "strong":
        score = await _real_grounding_pass("strong", lesson_obj, articles)

    lesson_obj.grounding_score = round(score, 3)
    lesson_obj.grounded = score >= 0.6
    metrics.RUN.record_grounding(unsupported=not lesson_obj.grounded)
    return lesson_obj


# --- helpers -----------------------------------------------------------------

_STOP = {"about", "their", "there", "these", "those", "which", "while", "where",
         "would", "could", "should", "after", "before", "other", "https", "http",
         "with", "your", "this", "from", "what", "when", "into", "more", "than",
         "that", "they", "them", "will", "have", "also", "just", "like", "make",
         "over", "such", "were", "been", "using", "based", "guide", "intro"}


def _keywords(text: str, k: int) -> list[str]:
    words = re.findall(r"[a-z]{5,}", (text or "").lower())
    counts = Counter(w for w in words if w not in _STOP)
    return [w for w, _ in counts.most_common(k)]


def _mock_label(articles: list[Article]) -> str:
    """Provisional label from words shared ACROSS titles (document frequency), so one
    quirky title ("while my_mcmc: gently(samples)") can't name the whole topic. Still a
    stopgap — sensible labels need the real model (cluster_name on Akamai/Ollama)."""
    df: Counter = Counter()
    for a in articles:
        words = {w for w in re.findall(r"[a-z]{4,}", (a.title or "").lower()) if w not in _STOP}
        df.update(words)
    if not df:
        return "Misc"
    return " ".join(w.title() for w, _ in df.most_common(2))


def _mock_lesson(topic: TopicNode, articles: list[Article], target_words: int = 160) -> str:
    lead = topic.label or "this topic"
    bullets = "\n".join(f"- {a.title}" for a in articles[:4] if a.title) \
        or "- These readings converge on a shared theme."
    md = (
        f"**{lead}** — a synthesis of {len(articles)} saved reads.\n\n"
        f"The throughline: these ideas reinforce each other, so reading them together "
        f"compounds faster than one at a time. The key sources:\n\n{bullets}\n\n"
    )
    filler = "Each source adds a distinct angle the others build on, and read together they cohere. "
    while len(md.split()) < target_words:
        md += filler
    return md + "\n\n_Mock lesson — real grounded text lands when the model is wired._"


def _mock_grounding_score(lesson_obj: Lesson) -> float:
    h = int(hashlib.sha1(lesson_obj.topic_id.encode()).hexdigest(), 16)
    return 0.45 + (h % 56) / 100  # 0.45–1.00; ~a quarter land below the 0.6 gate


async def _real_grounding_pass(tier: str, lesson_obj: Lesson, articles: list[Article]) -> float:
    """Placeholder for Sameer's real entailment check. Returns 0..1."""
    src = "\n\n".join(a.text[:1200] for a in articles[:6])
    out = await akamai.chat(
        tier,
        f"Score 0-1 how fully the SOURCES support every claim in the LESSON. "
        f"Reply with only the number.\nLESSON:\n{lesson_obj.script}\n\nSOURCES:\n{src}",
        system="You are a strict grounding verifier. Reply with only a number 0-1.",
        max_tokens=8,
        temperature=0.0,
    )
    m = re.search(r"[01](?:\.\d+)?", out)
    return float(m.group()) if m else 0.5
