import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJsonText } from "../../src/lib/json";

describe("parseJsonText", () => {
  it("parses clean JSON", () => {
    const result = parseJsonText<{ a: number }>(`{"a": 1}`);
    assert.equal(result.a, 1);
  });

  it("strips markdown json fence", () => {
    const result = parseJsonText<{ a: number }>(`\`\`\`json\n{"a": 2}\n\`\`\``);
    assert.equal(result.a, 2);
  });

  it("strips plain markdown fence", () => {
    const result = parseJsonText<{ a: number }>(`\`\`\`\n{"a": 3}\n\`\`\``);
    assert.equal(result.a, 3);
  });

  it("extracts JSON block from surrounding text", () => {
    const result = parseJsonText<{ title: string }>(`Here is the result:\n{"title": "Test"}\nDone.`);
    assert.equal(result.title, "Test");
  });

  it("repairs trailing comma before }", () => {
    const result = parseJsonText<{ a: number }>(`{"a": 1,}`);
    assert.equal(result.a, 1);
  });

  it("repairs trailing comma before ]", () => {
    const result = parseJsonText<{ items: number[] }>(`{"items": [1, 2, 3,]}`);
    assert.deepEqual(result.items, [1, 2, 3]);
  });

  it("repairs unescaped newlines inside string values", () => {
    const raw = `{"text": "line one
line two
line three"}`;
    const result = parseJsonText<{ text: string }>(raw);
    assert.ok(result.text.includes("line one"));
    assert.ok(result.text.includes("line two"));
  });

  it("repairs unescaped tabs inside string values", () => {
    const raw = `{"text": "col one	col two"}`;
    const result = parseJsonText<{ text: string }>(raw);
    assert.ok(result.text.includes("col one"));
  });

  it("handles Claude-style response with text before JSON", () => {
    const raw = `Sure, here is the JSON output:\n\n{"chapterNumber": 1, "title": "The Hook", "summary": "Intro.", "text": "She walked in."}\n`;
    const result = parseJsonText<{ chapterNumber: number; title: string }>(raw);
    assert.equal(result.chapterNumber, 1);
    assert.equal(result.title, "The Hook");
  });

  it("handles Claude-style response with json fence and newlines in text", () => {
    const raw = `\`\`\`json
{"chapterNumber": 1, "title": "T", "summary": "S.", "text": "Para one.
Para two.
Para three."}
\`\`\``;
    const result = parseJsonText<{ text: string }>(raw);
    assert.ok(result.text.includes("Para one"));
  });

  it("throws AppError for completely invalid input", () => {
    assert.throws(
      () => parseJsonText("this is not json at all !!!"),
      (err: unknown) => err instanceof Error && err.message.includes("JSON"),
    );
  });
});

describe("parseJsonText with jsonrepair", () => {
  it("repairs unescaped dialogue quotes inside long text fields", () => {
    const raw = `{"chapterNumber":1,"title":"T","summary":"S","text":"He said, "No one gets in." Then she answered, "Watch me.""}`;
    const result = parseJsonText<{ text: string }>(raw);
    assert.ok(result.text.includes("No one gets in"));
  });

  it("repairs single-quoted object keys and string values", () => {
    const raw = `{chapterNumber: 1, title: 'T', summary: 'S', text: 'Body'}`;
    const result = parseJsonText<{ chapterNumber: number; title: string }>(raw);
    assert.equal(result.chapterNumber, 1);
    assert.equal(result.title, "T");
  });
});
