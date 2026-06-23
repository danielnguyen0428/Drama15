import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeAddressRegister,
  ADDRESS_REGISTER_FAILURE,
} from "../../../src/modules/core-pipeline/validators/address-register-validator.js";
import {
  enrichStoryBibleAddressRegisters,
  collectAddressRegistersFromBible,
  extractEstablishedAddressUsage,
} from "../../../src/modules/core-pipeline/address-register.js";
import { analyzeChapterQuality } from "../../../src/modules/validators/chapter-quality.js";
import type { StoryBible } from "../../../src/types/story.js";

const lamPhongAnChiBible: StoryBible = enrichStoryBibleAddressRegisters({
  premise: "Romance test",
  heroine: {
    name: "An Chi",
    wound: "fear of abandonment",
    strengths: ["observant"],
    blindSpots: ["too trusting"],
    addressRegister: {
      selfReference: "em",
      toOthers: {
        "Lâm Phong": { call: "anh" },
      },
      forbiddenTerms: ["cậu", "tôi"],
      narratorThirdPerson: "cô",
    },
  },
  betrayer: {
    name: "Lâm Phong",
    wound: "pride",
    cowardiceVector: "withdraws under pressure",
    addressRegister: {
      selfReference: "tôi",
      toOthers: {
        "An Chi": { call: "em" },
      },
      forbiddenTerms: ["anh"],
      narratorThirdPerson: "anh",
    },
  },
  rival: {
    name: "Mai Linh",
    socialPower: "family status",
    demeanor: "polished",
    addressRegister: {
      selfReference: "tôi",
      toOthers: {
        "An Chi": { call: "cô" },
        "Lâm Phong": { call: "anh" },
      },
      forbiddenTerms: [],
      narratorThirdPerson: "cô",
    },
  },
  classHierarchy: ["family"],
  betrayalEngine: "hidden engagement",
  classShameEngine: "public exclusion",
  revengeEngine: "strategic dignity",
  endingMode: "warm reconciliation",
}, "vietnamese");

test("detects mixed self-reference for Lâm Phong (Tôi vs Anh)", () => {
  const text = [
    "Buổi chiều trong căn bếp nhỏ, không khí ấm áp.",
    "Lâm Phong nói: “Tôi tự làm được.”",
    "An Chi nhìn anh, thấy vẻ cứng đầu quen thuộc.",
    "Lâm Phong đáp: “Anh biết rồi.”",
  ].join("\n\n");

  const analysis = analyzeAddressRegister(
    text,
    collectAddressRegistersFromBible(lamPhongAnChiBible),
    "vietnamese",
  );

  assert.equal(analysis.needsRepair, true);
  assert.ok(analysis.violations.some((violation) => violation.character === "Lâm Phong"));
});

test("detects mixed vocatives when An Chi calls Lâm Phong anh then cậu", () => {
  const text = [
    "An Chi nói: “Anh đừng lo, em ổn mà.”",
    "Cô đặt tách xuống bàn.",
    "An Chi thì thầm: “Cậu cứ đi đi.”",
  ].join("\n\n");

  const analysis = analyzeAddressRegister(
    text,
    collectAddressRegistersFromBible(lamPhongAnChiBible),
    "vietnamese",
  );

  assert.equal(analysis.needsRepair, true);
  assert.ok(
    analysis.violations.some(
      (violation) => violation.character === "An Chi" && violation.kind === "address_term",
    ),
  );
});

test("passes consistent Vietnamese address register", () => {
  const text = [
    "Lâm Phong nói: “Tôi tự làm được.”",
    "An Chi đáp: “Anh cứ để em lo.”",
    "Lâm Phong hỏi: “Tôi có làm em phiền không?”",
  ].join("\n\n");

  const analysis = analyzeAddressRegister(
    text,
    collectAddressRegistersFromBible(lamPhongAnChiBible),
    "vietnamese",
  );

  assert.equal(analysis.needsRepair, false);
});

test("chapter quality treats address drift as hard failure", () => {
  const text = [
    "Lâm Phong nói: “Tôi tự làm được.”",
    "Lâm Phong đáp: “Anh biết rồi.”",
  ].join("\n\n");

  const metrics = analyzeChapterQuality(
    text,
    { dialogueRatio: 0.56, hookDensity: "high" },
    "vietnamese",
    4,
    0.84,
    collectAddressRegistersFromBible(lamPhongAnChiBible),
  );

  assert.ok(metrics.failures.includes(ADDRESS_REGISTER_FAILURE));
});

test("extracts established address usage from prior chapters", () => {
  const text = [
    "An Chi nói: “Anh đừng lo.”",
    "An Chi đáp: “Anh cứ đi đi.”",
  ].join("\n\n");

  const usage = extractEstablishedAddressUsage(
    text,
    collectAddressRegistersFromBible(lamPhongAnChiBible),
  );

  assert.ok(usage.some((entry) => entry.speaker === "An Chi" && entry.target === "Lâm Phong" && entry.term === "anh"));
});

test("enrichStoryBibleAddressRegisters fills defaults for Vietnamese", () => {
  const bible: StoryBible = {
    premise: "test",
    heroine: { name: "Lan", wound: "w", strengths: ["s"], blindSpots: ["b"] },
    betrayer: { name: "Minh", wound: "w", cowardiceVector: "c" },
    rival: { name: "Hà", socialPower: "p", demeanor: "d" },
    classHierarchy: ["elite"],
    betrayalEngine: "e",
    classShameEngine: "e",
    revengeEngine: "e",
    endingMode: "e",
  };

  const enriched = enrichStoryBibleAddressRegisters(bible, "vietnamese");
  assert.equal(enriched.heroine.addressRegister?.selfReference, "em");
  assert.equal(enriched.betrayer.addressRegister?.selfReference, "tôi");
  assert.equal(enriched.heroine.addressRegister?.toOthers.Minh.call, "anh");
});
