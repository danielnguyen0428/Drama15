import assert from "node:assert/strict";
import test from "node:test";

import { OmniVoiceApiClient } from "../../src/modules/tts/omnivoice-api-client";

test("OmniVoiceApiClient lists voices from the configured API base", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return Response.json({
      voices: [
        {
          voice_id: "main-voice",
          name: "Main Voice",
          ref_text: "Reference",
          created_at: "2026-05-06T00:00:00Z",
          updated_at: "2026-05-06T00:00:00Z",
        },
      ],
    });
  }) as typeof fetch;

  try {
    const client = new OmniVoiceApiClient({ apiBase: "http://127.0.0.1:8001/" });
    const voices = await client.listVoices();

    assert.equal(urls[0], "http://127.0.0.1:8001/api/voices");
    assert.equal(voices[0]?.voiceId, "main-voice");
    assert.equal(voices[0]?.name, "Main Voice");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OmniVoiceApiClient creates and reads long jobs with owner token header", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith("/api/tts-long-jobs")) {
      return Response.json({
        job_id: "job-1",
        job: {
          job_id: "job-1",
          voice_id: "main-voice",
          state: "queued",
          total_chunks: 2,
          completed_chunks: 0,
          progress: 0,
          message: "queued",
          error: "",
          download_ready: false,
        },
      });
    }
    return Response.json({
      job: {
        job_id: "job-1",
        voice_id: "main-voice",
        state: "completed",
        total_chunks: 2,
        completed_chunks: 2,
        progress: 100,
        message: "done",
        error: "",
        download_ready: true,
      },
    });
  }) as typeof fetch;

  try {
    const client = new OmniVoiceApiClient({
      apiBase: "http://127.0.0.1:8001",
      ownerToken: "owner-test",
    });

    const created = await client.createLongTtsJob({
      voiceId: "main-voice",
      text: "Chapter text",
      speed: 1.1,
      pitch: 2,
    });
    const loaded = await client.getLongTtsJob("job-1");
    const createBody = JSON.parse(String(calls[0]?.init?.body));

    assert.equal(created.jobId, "job-1");
    assert.equal(loaded.state, "completed");
    assert.equal(calls[0]?.init?.headers && (calls[0].init.headers as Record<string, string>)["X-Voice-Owner-Token"], "owner-test");
    assert.deepEqual(createBody, {
      voice_id: "main-voice",
      text: "Chapter text",
      abbreviations: "",
      speed: 1.1,
      pitch: 2,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OmniVoiceApiClient downloads WAV audio as a Buffer", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response(new Uint8Array([82, 73, 70, 70]), {
      headers: {
        "Content-Type": "audio/wav",
      },
    });
  }) as typeof fetch;

  try {
    const client = new OmniVoiceApiClient({
      apiBase: "http://127.0.0.1:8001",
      ownerToken: "owner-test",
    });
    const audio = await client.downloadLongTtsJob("job-1");

    assert.equal(Buffer.isBuffer(audio), true);
    assert.equal(audio.toString("ascii"), "RIFF");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OmniVoiceApiClient turns non-OK responses into readable errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ detail: "Chọn Voice ID trước khi tạo audio dài." }, { status: 400 })) as typeof fetch;

  try {
    const client = new OmniVoiceApiClient({ apiBase: "http://127.0.0.1:8001" });
    await assert.rejects(
      () => client.listVoices(),
      /OmniVoice returned HTTP 400\. Chọn Voice ID trước khi tạo audio dài\./,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
