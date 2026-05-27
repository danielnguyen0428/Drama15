import assert from "node:assert/strict";
import test from "node:test";

import { RouterClient } from "../../src/modules/router/router-client";

test("RouterClient prefers cx/gpt-5.5 over cx/gpt-5.4 when resolving a compatible 9router model", async () => {
  const originalFetch = globalThis.fetch;
  const requestedModels: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/models")) {
      return Response.json({
        data: [
          {
            id: "cx/gpt-5.4",
          },
          {
            id: "cx/gpt-5.5",
          },
        ],
      });
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    requestedModels.push(body.model ?? "");
    if (body.model !== "cx/gpt-5.5") {
      return Response.json(
        {
          error: {
            message: `Model ${body.model} is not available.`,
          },
        },
        {
          status: 404,
        },
      );
    }

    return Response.json({
      choices: [
        {
          message: {
            content: "{\"ok\":true}",
          },
        },
      ],
    });
  }) as typeof fetch;

  try {
    const client = new RouterClient(() => ({
      apiKey: "test-key",
      baseUrl: "http://router.test/v1",
      source: "env",
    }));
    const result = await client.generateJson<{ ok: boolean }>({
      model: "story-planner",
      fallbackModel: "fallback-lite",
      systemPrompt: "Return JSON.",
      userPrompt: "Return ok.",
    });

    assert.equal(result.modelUsed, "cx/gpt-5.5");
    assert.deepEqual(requestedModels, ["story-planner", "fallback-lite", "cx/gpt-5.5"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("RouterClient requests streaming completions and parses SSE content chunks", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/models")) {
      return Response.json({
        data: [
          {
            id: "cx/gpt-5.5",
          },
        ],
      });
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as { stream?: boolean };
    if (body.stream !== true) {
      return Response.json(
        {
          error: {
            message: "[codex/gpt-5.5] Failed to convert streaming response to JSON (reset after 30s)",
          },
        },
        {
          status: 502,
        },
      );
    }

    return new Response(
      [
        'data: {"choices":[{"delta":{"content":"{\\"ok\\""},"finish_reason":null}]}',
        "",
        'data: {"choices":[{"delta":{"content":":true}"},"finish_reason":null}]}',
        "",
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        "",
        "data: [DONE]",
        "",
      ].join("\n"),
      {
        headers: {
          "Content-Type": "text/event-stream",
        },
      },
    );
  }) as typeof fetch;

  try {
    const client = new RouterClient(() => ({
      apiKey: "test-key",
      baseUrl: "http://router.test/v1",
      source: "env",
    }));
    const result = await client.generateJson<{ ok: boolean }>({
      model: "cx/gpt-5.5",
      systemPrompt: "Return JSON.",
      userPrompt: "Return ok.",
    });

    assert.equal(result.modelUsed, "cx/gpt-5.5");
    assert.deepEqual(result.data, { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
