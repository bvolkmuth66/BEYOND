/*
 * BEYOND moderate-story Edge Function
 *
 * Purpose:
 * 1. Authenticate an internal moderation request
 * 2. Load one submitted story
 * 3. Review the story with Claude Haiku 5.5
 * 4. Route the story to published, review, or declined
 * 5. Write all AI review fields back to Supabase
 *
 * Required Supabase secrets:
 * - ANTHROPIC_API_KEY
 * - MODERATION_WEBHOOK_SECRET
 *
 * Required injected Supabase values:
 * - SUPABASE_URL
 * - SUPABASE_SECRET_KEYS, or legacy SUPABASE_SERVICE_ROLE_KEY
 *
 * Function setting:
 * - Verify JWT: OFF
 */

const articleContexts: Record<number, string> = {
  1: `
BEYOND Article 01:
"The Limit You Feel Isn't Always the Limit You Have"

Article theme:
The difference between real limits and perceived limits. Relevant stories may
involve discomfort, uncertainty, fear, resilience, growth, learning,
adaptation, recovery, or discovering capability.
  `.trim(),

  2: `
BEYOND Article 02:
"Comfort Can Quietly Become a Cage"

Article theme:
The difference between comfort that restores and comfort that restricts.
Relevant stories may involve realizing that a familiar routine, environment,
habit, expectation, or avoidance pattern had begun limiting growth,
opportunity, connection, learning, or change. Rest, safety, stability,
boundaries, and recovery may be healthy and necessary; the relevant question
is whether comfort restores someone or prevents meaningful growth.
  `.trim(),
};

type AiReview = {
  moderation_status: "safe" | "sensitive" | "unsafe" | "review_required";
  relevance_status:
    | "relevant"
    | "possibly_relevant"
    | "off_topic"
    | "not_reviewed";
  ai_recommendation: "approve" | "review" | "decline";
  ai_confidence: number | null;
  moderation_reason: string;
  ai_reviewed_at: string | null;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status });
}

function getSupabaseServerConfig() {
  const url = Deno.env.get("SUPABASE_URL");
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  const legacyServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  let key: string | undefined;

  if (secretKeysRaw) {
    try {
      const parsed = JSON.parse(secretKeysRaw);
      if (typeof parsed.default === "string") key = parsed.default;
    } catch (error) {
      console.error("Could not parse SUPABASE_SECRET_KEYS:", error);
    }
  }

  if (!key && legacyServiceRoleKey) key = legacyServiceRoleKey;
  if (!url || !key) throw new Error("Supabase server credentials are unavailable.");

  return { url, key };
}

function adminHeaders(key: string) {
  return {
    "Content-Type": "application/json",
    "apikey": key,
    "Authorization": `Bearer ${key}`,
  };
}

function fallbackReview(reason: string): AiReview {
  return {
    moderation_status: "review_required",
    relevance_status: "not_reviewed",
    ai_recommendation: "review",
    ai_confidence: null,
    moderation_reason: reason,
    ai_reviewed_at: null,
  };
}

function determineEditorialStatus(
  review: AiReview,
): "published" | "review" | "declined" {
  if (
    review.moderation_status === "unsafe" ||
    review.relevance_status === "off_topic" ||
    review.ai_recommendation === "decline"
  ) {
    return "declined";
  }

  if (
    review.moderation_status === "safe" &&
    review.relevance_status === "relevant" &&
    review.ai_recommendation === "approve" &&
    review.ai_confidence !== null &&
    review.ai_confidence >= 0.90
  ) {
    return "published";
  }

  return "review";
}

async function loadStory(storyId: string) {
  const { url, key } = getSupabaseServerConfig();
  const params = new URLSearchParams({
    id: `eq.${storyId}`,
    select: "id,article_number,display_name,story,status",
    limit: "1",
  });

  const response = await fetch(`${url}/rest/v1/stories?${params}`, {
    method: "GET",
    headers: adminHeaders(key),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !Array.isArray(data) || !data[0]) {
    console.error("Story retrieval failed:", response.status, data);
    throw new Error("Story not found.");
  }

  return data[0] as {
    id: string;
    article_number: number;
    display_name: string;
    story: string;
    status: string;
  };
}

async function reviewWithClaude(
  story: string,
  articleNumber: number,
): Promise<AiReview> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!apiKey) {
    return fallbackReview(
      "Automated review was unavailable because the Claude API credential was not configured. Human review is required.",
    );
  }

  const articleContext = articleContexts[articleNumber] ?? `
BEYOND reader stories should be personal experiences involving resilience,
growth, uncertainty, challenge, recovery, adaptation, learning, or discovering
capability.
  `.trim();

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `
You are the first-pass editorial observer for BEYOND, a curated collection of
personal stories about resilience, growth, uncertainty, and discovering
capability.

Evaluate the reader submission below.

EDITORIAL RULES:
1. Difficult subject matter is not automatically inappropriate.
2. Stories may legitimately discuss grief, addiction, recovery, military
   experiences, illness, disability, trauma, family crises, failure, mental
   health difficulties, or other difficult experiences.
3. Sensitive but potentially meaningful stories should generally be routed to
   HUMAN REVIEW rather than automatically declined.
4. Recommend DECLINE for clearly abusive, hateful, threatening, sexually
   explicit, promotional, spam, malicious, or clearly off-topic material.
5. Recommend APPROVE when the submission is clearly safe, relevant, authentic
   in tone, and appropriate for editorial consideration.
6. A human editor makes the final publication decision.
7. ai_confidence must be a decimal number from 0 to 1.

ARTICLE CONTEXT:
${articleContext}

READER SUBMISSION:
${story}
            `.trim(),
          },
        ],
        output_config: {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                moderation_status: {
                  type: "string",
                  enum: ["safe", "sensitive", "unsafe"],
                },
                relevance_status: {
                  type: "string",
                  enum: ["relevant", "possibly_relevant", "off_topic"],
                },
                ai_recommendation: {
                  type: "string",
                  enum: ["approve", "review", "decline"],
                },
                ai_confidence: { type: "number" },
                moderation_reason: { type: "string" },
              },
              required: [
                "moderation_status",
                "relevance_status",
                "ai_recommendation",
                "ai_confidence",
                "moderation_reason",
              ],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Claude review request failed:", data);
      return fallbackReview(
        "Automated review could not be completed. Human review is required.",
      );
    }

    const textBlock = Array.isArray(data.content)
      ? data.content.find((block: Record<string, unknown>) => block.type === "text")
      : null;

    if (!textBlock || typeof textBlock.text !== "string") {
      return fallbackReview(
        "Automated review returned no usable result. Human review is required.",
      );
    }

    const result = JSON.parse(textBlock.text);
    const moderationAllowed = ["safe", "sensitive", "unsafe"];
    const relevanceAllowed = ["relevant", "possibly_relevant", "off_topic"];
    const recommendationAllowed = ["approve", "review", "decline"];

    if (
      !moderationAllowed.includes(result.moderation_status) ||
      !relevanceAllowed.includes(result.relevance_status) ||
      !recommendationAllowed.includes(result.ai_recommendation)
    ) {
      return fallbackReview(
        "Automated review returned invalid values. Human review is required.",
      );
    }

    const rawConfidence = Number(result.ai_confidence);
    const confidence = Number.isFinite(rawConfidence)
      ? Math.max(0, Math.min(1, rawConfidence))
      : null;

    return {
      moderation_status: result.moderation_status,
      relevance_status: result.relevance_status,
      ai_recommendation: result.ai_recommendation,
      ai_confidence: confidence,
      moderation_reason: String(result.moderation_reason ?? "No explanation returned."),
      ai_reviewed_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Claude review processing failed:", error);
    return fallbackReview(
      "Automated review encountered an error. Human review is required.",
    );
  }
}

async function updateStory(storyId: string, review: AiReview) {
  const { url, key } = getSupabaseServerConfig();
  const editorialStatus = determineEditorialStatus(review);
  const params = new URLSearchParams({ id: `eq.${storyId}` });

  const response = await fetch(`${url}/rest/v1/stories?${params}`, {
    method: "PATCH",
    headers: {
      ...adminHeaders(key),
      "Prefer": "return=representation",
    },
    body: JSON.stringify({
      status: editorialStatus,
      moderation_status: review.moderation_status,
      relevance_status: review.relevance_status,
      moderation_reason: review.moderation_reason,
      ai_recommendation: review.ai_recommendation,
      ai_confidence: review.ai_confidence,
      ai_reviewed_at: review.ai_reviewed_at,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Story moderation update failed:", response.status, data);
    throw new Error("Story moderation update failed.");
  }

  return { editorialStatus, data };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  const expectedSecret = Deno.env.get("MODERATION_WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-moderation-secret") ?? "";

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return jsonResponse({ success: false, error: "Unauthorized." }, 401);
  }

  try {
    const payload = await req.json();
    const storyId = typeof payload.story_id === "string" ? payload.story_id.trim() : "";

    if (!storyId) {
      return jsonResponse({ success: false, error: "story_id is required." }, 400);
    }

    const storyRecord = await loadStory(storyId);

    if (storyRecord.status === "published") {
      return jsonResponse(
        { success: true, message: "Published story was not re-moderated." },
        200,
      );
    }

    const review = await reviewWithClaude(
      storyRecord.story,
      Number(storyRecord.article_number),
    );

    const updated = await updateStory(storyId, review);

    return jsonResponse(
      {
        success: true,
        story_id: storyId,
        status: updated.editorialStatus,
        review,
      },
      200,
    );
  } catch (error) {
    console.error("Unexpected moderate-story error:", error);
    return jsonResponse(
      { success: false, error: "Story moderation failed." },
      500,
    );
  }
});
