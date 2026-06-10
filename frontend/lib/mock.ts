import type { PipelineResponse } from "./types";

// Realistic standalone fixture so the UI always renders even with no backend.
// Shape matches the backend `POST /pipeline` response exactly.

export const MOCK: PipelineResponse = {
  articles: [
    {
      url: "https://www.deeplearning.ai/the-batch/issue-235",
      title: "Why small models are eating the inference bill",
      tags: ["inference", "cost", "small-models"],
    },
    {
      url: "https://huggingface.co/blog/llama-3-1-8b",
      title: "Llama 3.1 8B: surprisingly capable at routing tasks",
      tags: ["small-models", "llama", "evaluation"],
    },
    {
      url: "https://blog.vllm.ai/2024/continuous-batching",
      title: "Continuous batching and why your GPU was idle",
      tags: ["serving", "vllm", "throughput"],
    },
    {
      url: "https://www.akamai.com/blog/edge-inference-gpus",
      title: "Putting inference on edge GPUs, close to the user",
      tags: ["serving", "edge", "latency"],
    },
    {
      url: "https://arxiv.org/abs/2401.04088",
      title: "Mixture-of-Experts: paying for the experts you use",
      tags: ["architecture", "moe", "efficiency"],
    },
    {
      url: "https://www.pinecone.io/learn/vector-embeddings",
      title: "Vector embeddings, explained without the hand-waving",
      tags: ["embeddings", "retrieval", "fundamentals"],
    },
    {
      url: "https://txt.cohere.com/semantic-clustering",
      title: "Clustering documents by meaning, not keywords",
      tags: ["embeddings", "clustering", "topics"],
    },
    {
      url: "https://eugeneyan.com/writing/llm-grounding",
      title: "Grounding LLM output: cite or don't say it",
      tags: ["grounding", "rag", "reliability"],
    },
    {
      url: "https://www.anthropic.com/research/measuring-faithfulness",
      title: "Measuring faithfulness: when a summary lies",
      tags: ["grounding", "evaluation", "reliability"],
    },
    {
      url: "https://hamel.dev/blog/posts/llm-judge",
      title: "Using a cheap model as a verifier you can trust",
      tags: ["grounding", "verification", "small-models"],
    },
  ],

  topics: {
    id: "root",
    label: "Your reading stack",
    article_urls: [],
    depth: 0,
    children: [
      {
        id: "t-inference",
        label: "Efficient inference",
        depth: 1,
        article_urls: [
          "https://www.deeplearning.ai/the-batch/issue-235",
          "https://huggingface.co/blog/llama-3-1-8b",
          "https://arxiv.org/abs/2401.04088",
        ],
        children: [
          {
            id: "t-serving",
            label: "Serving & GPUs",
            depth: 2,
            article_urls: [
              "https://blog.vllm.ai/2024/continuous-batching",
              "https://www.akamai.com/blog/edge-inference-gpus",
            ],
            children: [],
          },
        ],
      },
      {
        id: "t-embeddings",
        label: "Embeddings & clustering",
        depth: 1,
        article_urls: [
          "https://www.pinecone.io/learn/vector-embeddings",
          "https://txt.cohere.com/semantic-clustering",
        ],
        children: [],
      },
      {
        id: "t-grounding",
        label: "Grounding & verification",
        depth: 1,
        article_urls: [
          "https://eugeneyan.com/writing/llm-grounding",
          "https://www.anthropic.com/research/measuring-faithfulness",
          "https://hamel.dev/blog/posts/llm-judge",
        ],
        children: [],
      },
    ],
  },

  lessons: [
    {
      topic_id: "t-inference",
      grounded: true,
      grounding_score: 0.94,
      audio_path: "/audio/efficient-inference.mp3",
      video_path: null,
      script:
        "The expensive part of running a model isn't the model — it's running the wrong size of model for the job. Most of a reading pipeline is bulk work: tag this, embed that, check whether a sentence is supported. An 8B model handles all of it at a fraction of the cost, and only the text a human actually reads gets escalated to a stronger model. Mixture-of-experts pushes the same idea inside the network: you only pay for the experts a token activates. The lesson across your stack is the same one twice — spend compute where attention is, not everywhere.",
    },
    {
      topic_id: "t-serving",
      grounded: true,
      grounding_score: 0.91,
      audio_path: "/audio/serving-gpus.mp3",
      video_path: null,
      script:
        "A GPU that answers one request at a time is mostly idle. Continuous batching keeps the device full by slotting new requests into the gaps left by finishing ones, which is where most real-world throughput gains come from. Pair that with placing the GPU at the edge — physically close to the user — and you cut the round-trip latency that batching can't touch. Throughput is a scheduling problem; latency is a geography problem. Serving well means solving both at once.",
    },
    {
      topic_id: "t-embeddings",
      grounded: false,
      grounding_score: 0.41,
      audio_path: null,
      video_path: null,
      script:
        "Embeddings turn text into vectors so that 'close in meaning' becomes 'close in space,' which is what lets you cluster documents by topic instead of by shared keywords. So far so good. But the script then claims these embeddings are produced by the same large language model that writes the lessons — and nothing in the source articles says that. The verifier flagged the sentence because the cited pieces describe dedicated embedding models, not the chat model. This is exactly the kind of confident-but-unsupported jump grounding is meant to catch.",
    },
    {
      topic_id: "t-grounding",
      grounded: true,
      grounding_score: 0.88,
      audio_path: "/audio/grounding.mp3",
      video_path: null,
      script:
        "A summary that can't point back to its source is a guess wearing a suit. Grounding flips the default: a claim is allowed only if a passage supports it, otherwise it's cut or flagged. The cheap part is that you don't need a frontier model to check this — a small verifier reading 'does sentence X follow from passage Y?' catches most fabrications for almost nothing. That's the whole trick of this stack: the model that writes can be strong, but the model that keeps it honest can be tiny and still pay for itself.",
    },
  ],

  metrics: {
    calls_by_tier: { embed: 81, weak: 140, mid: 9, strong: 2 },
    total_calls: 232,
    cost_usd: 0.018,
    baseline_cost_usd: 0.91,
    savings_x: 51,
    grounding: { checked: 4, unsupported_caught: 1, catch_rate: 0.25 },
  },
};
