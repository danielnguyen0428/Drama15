import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PresetLoader } from "../../src/modules/presets/preset-loader";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..");

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

test("line presets expose exactly the requested twelve drama niches", () => {
  const linesDir = path.join(repoRoot, "presets", "lines");
  const ids = fs
    .readdirSync(linesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/i, ""))
    .sort();

  assert.deepEqual(ids, [
    "billionaire_rich_poor_romance",
    "cheating_ex_wedding_drama",
    "humiliation_revenge_justice",
    "medical_hidden_doctor_life_care",
    "school_campus_bullying_identity",
    "secret_identity_hidden_heiress",
    "single_mom_poor_woman_comeback",
    "social_injustice_discrimination_drama",
    "steamy_alien_captive_romance",
    "toxic_family_betrayal",
    "werewolf_luna_alpha_soulmate",
    "workplace_ceo_power_struggle",
  ]);
});

test("billionaire niche contains the supplied rich-poor romance formula", () => {
  const preset = readJson(path.join(repoRoot, "presets", "lines", "billionaire_rich_poor_romance.json"));

  assert.equal(preset.displayName, "Niche 1: T\u1ef7 ph\u00fa / Gi\u00e0u ngh\u00e8o / T\u00ecnh y\u00eau v\u01b0\u1ee3t giai c\u1ea5p");
  assert.match(String(preset.description), /tình yêu vượt giai cấp/i);
  assert.match(JSON.stringify(preset), /billionaire romance/);
  assert.match(JSON.stringify(preset), /Cinderella/);
  assert.match(JSON.stringify(preset), /family opposition|family opposes/);
});

test("billionaire niche covers rich-poor romance courtship DNA without straying into CEO contract drama", () => {
  const preset = readJson(path.join(repoRoot, "presets", "lines", "billionaire_rich_poor_romance.json"));
  const serialized = JSON.stringify(preset);

  // courtship + class-gap DNA must be present
  assert.match(serialized, /courtship|romance|love|falls for/i);
  assert.match(serialized, /class gap|rich-poor|class lines|across class/i);
  assert.match(serialized, /family opposition|rich family hates|opposes the romance|disapprov/i);
  assert.match(serialized, /Cinderella|scholarship|maid|tutor|caregiver|delivery|baker/i);
  assert.match(serialized, /hidden identity|secret heir|hidden heir/i);
  assert.match(serialized, /public legitimacy|chooses her publicly|defends the lover|stand up to his family|public choice/i);
  assert.match(serialized, /first meeting|misunderstanding|slow-burn|confession|rung động|dằn vặt|hy sinh|courtship beats/i);

  // CEO contract / divorce / secret-baby drama must NOT live here anymore
  assert.doesNotMatch(serialized, /contract wife/i);
  assert.doesNotMatch(serialized, /paper marriage/i);
  assert.doesNotMatch(serialized, /pregnant secretary/i);
  assert.doesNotMatch(serialized, /ex-wife divorce regret/i);
  assert.doesNotMatch(serialized, /female billionaire comeback/i);
  assert.doesNotMatch(serialized, /possessive ruthless billionaire|ruthless boss|hostile takeover/i);
});

test("existing non-billionaire niches map to practical FictionMe category DNA", () => {
  const expectations: Record<string, RegExp[]> = {
    humiliation_revenge_justice: [/urban/i, /thriller/i, /viral|evidence|lawsuit|public apology/i],
    secret_identity_hidden_heiress: [/romance/i, /urban/i, /undercover|hidden heiress|lost daughter|secret owner/i],
    toxic_family_betrayal: [/family/i, /thriller/i, /inheritance|custody|adoption|deed|fraud/i],
    cheating_ex_wedding_drama: [/romance/i, /dark romance/i, /mistress|ex-wife|divorce|wedding reveal/i],
    single_mom_poor_woman_comeback: [/romance/i, /urban/i, /secret child|custody|daycare|comeback/i],
    social_injustice_discrimination_drama: [
      /urban/i,
      /thriller/i,
      /discrimination|accessibility|racism|classism|evidence/i,
    ],
    workplace_ceo_power_struggle: [
      /billionaire\/CEO|CEO/i,
      /urban/i,
      /cap table|boardroom|hostile takeover|pitch theft/i,
      /contract wife|paper marriage|business deal/i,
      /pregnant secretary|secret baby|surrogate/i,
      /ex-wife|divorce|female billionaire|revenge queen/i,
      /possessive|ruthless|heartless/i,
    ],
    medical_hidden_doctor_life_care: [/romance/i, /thriller/i, /hidden surgeon|malpractice|consent|chart audit/i],
    school_campus_bullying_identity: [/young adult/i, /scholarship|bullying|rich clique|donor parent|talent show/i],
    werewolf_luna_alpha_soulmate: [/werewolf/i, /rejected mate|fated mate|Alpha|Luna|Omega|pack law/i],
    steamy_alien_captive_romance: [
      /steamy/i,
      /dark romance/i,
      /alien|captive heroine|empire contract|consent restoration/i,
    ],
  };

  for (const [presetId, patterns] of Object.entries(expectations)) {
    const preset = readJson(path.join(repoRoot, "presets", "lines", `${presetId}.json`));
    const serialized = JSON.stringify(preset);

    for (const pattern of patterns) {
      assert.match(serialized, pattern, `${presetId} is missing ${pattern}`);
    }
  }
});

test("new workplace medical and school niches have Vietnamese names and marketable concept DNA", () => {
  const workplace = readJson(path.join(repoRoot, "presets", "lines", "workplace_ceo_power_struggle.json"));
  const medical = readJson(path.join(repoRoot, "presets", "lines", "medical_hidden_doctor_life_care.json"));
  const school = readJson(path.join(repoRoot, "presets", "lines", "school_campus_bullying_identity.json"));

  assert.equal(workplace.displayName, "Niche 8: C\u00f4ng s\u1edf / CEO / Tranh quy\u1ec1n ngh\u1ec1 nghi\u1ec7p");
  assert.equal(medical.displayName, "Niche 9: Y t\u1ebf / B\u00e1c s\u0129 \u1ea9n danh / Sinh t\u1eed v\u00e0 ch\u0103m s\u00f3c");
  assert.equal(school.displayName, "Niche 10: H\u1ecdc \u0111\u01b0\u1eddng / Campus / B\u1eaft n\u1ea1t v\u00e0 th\u00e2n ph\u1eadn");
  assert.match(JSON.stringify(workplace), /office|CEO|startup|layoff|pitch/i);
  assert.match(JSON.stringify(medical), /doctor|nurse|patient|clinic|triage/i);
  assert.match(JSON.stringify(school), /school|campus|bully|scholarship|student/i);
});

test("werewolf and steamy alien niches keep template genre DNA inside the existing concept setup", () => {
  const werewolf = readJson(path.join(repoRoot, "presets", "lines", "werewolf_luna_alpha_soulmate.json"));
  const steamyAlien = readJson(path.join(repoRoot, "presets", "lines", "steamy_alien_captive_romance.json"));

  assert.equal(werewolf.displayName, "Niche 11: Werewolf / Luna / Alpha soulmate drama");
  assert.equal(steamyAlien.displayName, "Niche 12: Steamy / Alien masters / Dark captive romance");
  assert.match(JSON.stringify(werewolf), /werewolf|Luna|Alpha|soulmate|second chance|love triangle/i);
  assert.match(JSON.stringify(steamyAlien), /alien|dominant|opposites attract|sensual|possessive|captive/i);
  assert.match(JSON.stringify(steamyAlien), /consent|agency|adult/i);
});

test("style presets use famous author craft lanes instead of removed inspiration presets", () => {
  const stylesDir = path.join(repoRoot, "presets", "styles");
  const ids = fs
    .readdirSync(stylesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/i, ""))
    .sort();

  assert.deepEqual(ids, [
    "austen_social_knife",
    "bronte_gothic_romance_wound",
    "du_maurier_psychological_shadow",
    "fitzgerald_glittering_decay",
    "gu_man_sunshine_romance",
    "highsmith_cold_paranoia",
    "wharton_class_shame_elegance",
  ]);

  const wharton = readJson(path.join(stylesDir, "wharton_class_shame_elegance.json"));
  assert.equal(wharton.displayName, "Sỉ nhục giai cấp tinh tế - Wharton");
  assert.match(JSON.stringify(wharton), /broad craft traits only/i);

  const guMan = readJson(path.join(stylesDir, "gu_man_sunshine_romance.json"));
  assert.equal(guMan.id, "gu_man_sunshine_romance");
  assert.match(JSON.stringify(guMan), /small actions to carry emotion/i);
});

test("preset loader supports branch-scoped virtual style preset ids", async () => {
  const loader = new PresetLoader();
  const stylePreset = await loader.loadStylePreset("billionaire_rich_poor_romance__tiktok_hook_pacing");

  assert.equal(stylePreset.id, "billionaire_rich_poor_romance__tiktok_hook_pacing");
  assert.match(stylePreset.displayName, /Billionaire Rich Poor Romance/);
  assert.match(stylePreset.displayName, /TikTok/);
  assert.match(stylePreset.displayName, /hook viral|hook pacing/i);
  assert.match(stylePreset.notes.join("\n"), /Apply this style lens to the selected drama branch/);
});

test("preset loader migrates removed legacy line preset ids before reading files", async () => {
  const loader = new PresetLoader();
  const linePreset = await loader.loadLinePreset("betrayal_romance_revenge_class_shame");

  assert.equal(linePreset.id, "billionaire_rich_poor_romance");
  assert.equal(linePreset.displayName, "Niche 1: T\u1ef7 ph\u00fa / Gi\u00e0u ngh\u00e8o / T\u00ecnh y\u00eau v\u01b0\u1ee3t giai c\u1ea5p");
});

test("preset loader migrates branch-scoped style ids that still contain removed legacy line ids", async () => {
  const loader = new PresetLoader();
  const stylePreset = await loader.loadStylePreset("betrayal_romance_revenge_class_shame__tiktok_hook_pacing");

  assert.equal(stylePreset.id, "billionaire_rich_poor_romance__tiktok_hook_pacing");
  assert.match(stylePreset.displayName, /Billionaire Rich Poor Romance/);
});

test("default model preset pins every generation role to cx/gpt-5.5", async () => {
  const loader = new PresetLoader();
  const modelPreset = await loader.loadModelPreset("default");

  assert.deepEqual(modelPreset, {
    planner: "cx/gpt-5.5",
    bible: "cx/gpt-5.5",
    drafter: "cx/gpt-5.5",
    rewriter: "cx/gpt-5.5",
    fallback: "cx/gpt-5.5",
  });
});
