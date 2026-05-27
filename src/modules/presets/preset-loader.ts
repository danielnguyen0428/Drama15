import fs from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { MAX_TARGET_WORDS_PER_CHAPTER, MIN_TARGET_WORDS_PER_CHAPTER } from "../../constants/draft-controls";
import { AppError } from "../../lib/errors";
import { getEmbeddedTextAsset, resolveAssetPath } from "../../lib/runtime";
import { normalizeBranchScopedStylePresetId, normalizeLinePresetId } from "./legacy-preset-migrations";

const LinePresetSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().min(1),
  tropeWeights: z.record(z.string(), z.number()),
  chapterArcDefaults: z.object({
    hookStyle: z.string().min(1),
    shameEscalationStart: z.number().int().min(1).max(10),
    revengeActivationChapter: z.number().int().min(1).max(10),
    dignityRecoveryChapter: z.number().int().min(1).max(10),
  }),
  humiliationPacing: z.array(z.string().min(1)).min(1),
  revengeActivation: z.array(z.string().min(1)).min(1),
  dignityRecoveryTiming: z.string().min(1),
  constraints: z.object({
    fixedChapterCount: z.number().int().positive().default(10),
    minWordsPerChapter: z.number().int().positive().default(MIN_TARGET_WORDS_PER_CHAPTER),
    maxWordsPerChapter: z.number().int().positive().default(MAX_TARGET_WORDS_PER_CHAPTER),
  }),
}).passthrough();

const StylePresetSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().min(1),
  emotionalDirectness: z.string().min(1),
  hookSharpness: z.string().min(1),
  dialogueRatioTarget: z.number().min(0).max(1),
  melodramaLevel: z.string().min(1),
  notes: z.array(z.string().min(1)).min(1),
}).passthrough();

const ModelPresetSchema = z.object({
  planner: z.string().min(1),
  bible: z.string().min(1),
  drafter: z.string().min(1),
  rewriter: z.string().min(1),
  fallback: z.string().min(1),
});

export type LinePreset = z.infer<typeof LinePresetSchema>;
export type StylePreset = z.infer<typeof StylePresetSchema>;
export type ModelPreset = z.infer<typeof ModelPresetSchema>;

type PresetKind = "lines" | "styles" | "models";

export class PresetLoader {
  private readonly cache = new Map<string, unknown>();
  private readonly presetsRoot = resolveAssetPath("presets");

  async loadLinePreset(name: string) {
    return this.readPreset("lines", normalizeLinePresetId(name), LinePresetSchema);
  }

  async loadStylePreset(name: string) {
    const normalizedName = normalizeBranchScopedStylePresetId(name);
    const virtualPreset = buildVirtualDramaBranchStylePreset(normalizedName);
    if (virtualPreset) {
      return virtualPreset;
    }

    return this.readPreset("styles", normalizedName, StylePresetSchema);
  }

  async loadModelPreset(name: string) {
    return this.readPreset("models", name, ModelPresetSchema);
  }

  private async readPreset<T>(kind: PresetKind, name: string, schema: z.ZodSchema<T>): Promise<T> {
    const cacheKey = `${kind}:${name}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as T;
    }

    const filePath = path.join(this.presetsRoot, kind, `${name}.json`);
    let raw = "";

    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch {
      const assetKey = path.posix.join("presets", kind, `${name}.json`);
      raw = getEmbeddedTextAsset(assetKey) ?? "";
    }

    if (!raw) {
      throw new AppError("VALIDATION_ERROR", `Preset "${name}" was not found in ${kind}.`, 400, {
        filePath,
      });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      throw new AppError("UNKNOWN_ERROR", `Preset "${name}" is not valid JSON.`, 500, {
        cause: error,
        filePath,
      });
    }

    const parsed = schema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new AppError("UNKNOWN_ERROR", `Preset "${name}" failed schema validation.`, 500, {
        issues: parsed.error.issues,
        filePath,
      });
    }

    this.cache.set(cacheKey, parsed.data);
    return parsed.data;
  }
}

const STYLE_LENS_PRESETS: Record<
  string,
  {
    displayName: string;
    description: string;
    emotionalDirectness: string;
    hookSharpness: string;
    dialogueRatioTarget: number;
    melodramaLevel: string;
    notes: string[];
  }
> = {
  clean_short_quote_pain: {
    displayName: "Đau ngắn gọn - trích dẫn được ngay",
    description: "Câu đau ngắn, sắc, nhịp hiện đại - đọc xong nhớ ngay.",
    emotionalDirectness: "high",
    hookSharpness: "very high",
    dialogueRatioTarget: 0.5,
    melodramaLevel: "sharp commercial restraint",
    notes: ["Use short sentences that can stand as quotes.", "End key scenes with one clean emotional knife."],
  },
  polite_social_knife: {
    displayName: "Dao lịch sự - sỉ nhục qua phép tắc",
    description: "Bạo lực địa vị qua cách xưng hô, chỗ ngồi, lời mời - kiểm soát tuyệt đối.",
    emotionalDirectness: "medium",
    hookSharpness: "high",
    dialogueRatioTarget: 0.52,
    melodramaLevel: "restrained but cutting",
    notes: ["Let etiquette wound harder than shouting.", "Make public rooms carry private rejection."],
  },
  high_dialogue_confrontation: {
    displayName: "Đối thoại căng - đỉnh điểm xung đột",
    description: "Cảnh thoại dày đặc: buộc tội, phủ nhận, gần thú nhận, lật ngược.",
    emotionalDirectness: "high",
    hookSharpness: "high",
    dialogueRatioTarget: 0.64,
    melodramaLevel: "controlled high drama",
    notes: ["Use quoted speech as the main engine.", "Avoid narration-only stretches when the emotional pressure peaks."],
  },
  quiet_interior_realism: {
    displayName: "Nội tâm lặng - vết nứt qua chi tiết nhỏ",
    description: "Cảm xúc thật, âm lượng thấp - chi tiết nhỏ phơi bày vết thương lớn.",
    emotionalDirectness: "medium-low",
    hookSharpness: "medium",
    dialogueRatioTarget: 0.42,
    melodramaLevel: "quiet literary drama",
    notes: ["Use micro-humiliation and unsaid confession.", "Keep reactions human, precise, and non-theatrical."],
  },
  glamour_decay: {
    displayName: "Hào nhoáng mục ruỗng - xa hoa che giấu thối rữa",
    description: "Bề ngoài đẹp đẽ phơi bày sự thối rữa, khao khát và thèm muốn giai cấp.",
    emotionalDirectness: "medium",
    hookSharpness: "medium-high",
    dialogueRatioTarget: 0.46,
    melodramaLevel: "lyrical social decay",
    notes: ["Let luxury details reveal emptiness.", "Make beauty feel morally expensive."],
  },
  gothic_romantic_pressure: {
    displayName: "Gothic lãng mạn - áp lực cảm xúc nặng nề",
    description: "Ham muốn dâng cao, cô lập, nguy hiểm đạo đức, không khí nặng nề.",
    emotionalDirectness: "high",
    hookSharpness: "high",
    dialogueRatioTarget: 0.47,
    melodramaLevel: "heightened but disciplined",
    notes: ["Make rooms and weather mirror danger.", "Keep romance consequential, not decorative."],
  },
  cold_paranoia: {
    displayName: "Hoang mang lạnh - mối đe dọa tâm lý ngầm",
    description: "Bất an đạo đức, an toàn giả tạo, mặt nạ xã hội, đe dọa tâm lý lặng lẽ.",
    emotionalDirectness: "medium-low",
    hookSharpness: "high",
    dialogueRatioTarget: 0.4,
    melodramaLevel: "cold psychological tension",
    notes: ["Let small mismatches create dread.", "Keep menace close, ordinary, and socially plausible."],
  },
  tiktok_hook_pacing: {
    displayName: "Nhịp TikTok - hook viral, nghiện chương",
    description: "Hook nhanh, vết thương lộ rõ, dễ đọc, cuối chương gây nghiện.",
    emotionalDirectness: "high",
    hookSharpness: "very high",
    dialogueRatioTarget: 0.55,
    melodramaLevel: "viral but controlled",
    notes: ["Open scenes on a shareable wound.", "Keep paragraphs short and momentum forward."],
  },
  slow_burn_suppressed_confession: {
    displayName: "Slow burn - thú nhận bị kìm nén",
    description: "Thú nhận trì hoãn, kiềm chế, im lặng - cảm xúc bùng nổ sau sự thật bị giấu.",
    emotionalDirectness: "medium",
    hookSharpness: "medium-high",
    dialogueRatioTarget: 0.44,
    melodramaLevel: "suppressed emotional pressure",
    notes: ["Make the unsaid sentence haunt the scene.", "Delay emotional release until it costs something."],
  },
  cinematic_scene_turns: {
    displayName: "Điện ảnh - cảnh quay có điểm ngoặt rõ",
    description: "Dàn cảnh rõ ràng, nhịp cảnh mạnh, leo thang drama kiểu màn ảnh.",
    emotionalDirectness: "medium-high",
    hookSharpness: "high",
    dialogueRatioTarget: 0.5,
    melodramaLevel: "cinematic commercial drama",
    notes: ["Write in scenes with visible turns.", "Use entrances, exits, props, and witness reactions as structure."],
  },
};

function buildVirtualDramaBranchStylePreset(name: string): StylePreset | null {
  const match = /^(.+)__(.+)$/.exec(name);
  if (!match) {
    return null;
  }

  const [, branchId, lensId] = match;
  const lens = STYLE_LENS_PRESETS[lensId ?? ""];
  if (!branchId || !lens) {
    return null;
  }

  return StylePresetSchema.parse({
    id: name,
    displayName: `${humanizePresetId(branchId)} - ${lens.displayName}`,
    description: `${lens.description} Apply this style lens to the selected drama branch: ${humanizePresetId(branchId)}.`,
    emotionalDirectness: lens.emotionalDirectness,
    hookSharpness: lens.hookSharpness,
    dialogueRatioTarget: lens.dialogueRatioTarget,
    melodramaLevel: lens.melodramaLevel,
    notes: [
      "Apply this style lens to the selected drama branch and keep trope logic consistent with the branch preset.",
      ...lens.notes,
    ],
  });
}

function humanizePresetId(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
