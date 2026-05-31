import 'account.dart';
import 'story_config.dart';

/// Bộ điều khiển bản thảo gợi ý kèm theo `setup-suggest` (Req 4.2).
///
/// Ánh xạ trường `draftControls` của phản hồi `POST /story/setup-suggest`
/// (`GeneratedSettingSeedSchema.draftControls`): `dialogueRatio` (số thực) và
/// `hookDensity` (một trong `low|medium|high`).
class DraftControls {
  const DraftControls({this.dialogueRatio = 0.55, this.hookDensity = 'high'});

  /// Tỷ lệ thoại trong [0.2, 0.85]; mặc định 0.55 (khớp schema API).
  final double dialogueRatio;

  /// Mật độ móc câu rời rạc: `low | medium | high`; mặc định `high`.
  final String hookDensity;

  factory DraftControls.fromJson(Map<String, dynamic> json) {
    final ratio = json['dialogueRatio'];
    return DraftControls(
      dialogueRatio: ratio is num ? ratio.toDouble() : 0.55,
      hookDensity: (json['hookDensity'] as String?) ?? 'high',
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'dialogueRatio': dialogueRatio,
      'hookDensity': hookDensity,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is DraftControls &&
        other.dialogueRatio == dialogueRatio &&
        other.hookDensity == hookDensity;
  }

  @override
  int get hashCode => Object.hash(dialogueRatio, hookDensity);
}

/// Kết quả gợi ý kịch bản trả về từ `POST /story/setup-suggest` (Req 4).
///
/// Phản hồi gồm `title`, `seed`, `linePreset`, `storyControls`, `draftControls`
/// và (tùy chọn) `setupSuggestionQuota`. Tất cả trường đều có thể vắng mặt nên
/// được mô hình hóa là tùy chọn (nullable) để an toàn khi đọc phản hồi.
class SetupSuggestion {
  const SetupSuggestion({
    this.title,
    this.seed,
    this.linePreset,
    this.storyControls,
    this.draftControls,
    this.setupSuggestionQuota,
  });

  /// Nhan đề gợi ý (điền vào `StoryConfig.title` — Req 4.2).
  final String? title;

  /// Kịch bản / cốt truyện gợi ý (điền vào `StoryConfig.seed` — Req 4.2).
  final String? seed;

  /// Nhánh truyện gợi ý kèm theo seed package.
  final String? linePreset;

  /// Bộ điều khiển kịch bản gợi ý (điền vào `StoryConfig.storyControls`).
  final StoryControls? storyControls;

  /// Bộ điều khiển bản thảo gợi ý.
  final DraftControls? draftControls;

  /// Hạn mức gợi ý kịch bản còn lại sau lượt này (Req 4.3).
  final Quota? setupSuggestionQuota;

  factory SetupSuggestion.fromJson(Map<String, dynamic> json) {
    final controls = json['storyControls'];
    final draft = json['draftControls'];
    final quota = json['setupSuggestionQuota'];
    return SetupSuggestion(
      title: json['title'] as String?,
      seed: json['seed'] as String?,
      linePreset: json['linePreset'] as String?,
      storyControls: controls is Map
          ? StoryControls.fromJson(controls.cast<String, dynamic>())
          : null,
      draftControls: draft is Map
          ? DraftControls.fromJson(draft.cast<String, dynamic>())
          : null,
      setupSuggestionQuota: quota is Map
          ? Quota.fromJson(quota.cast<String, dynamic>())
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      if (title != null) 'title': title,
      if (seed != null) 'seed': seed,
      if (linePreset != null) 'linePreset': linePreset,
      if (storyControls != null) 'storyControls': storyControls!.toJson(),
      if (draftControls != null) 'draftControls': draftControls!.toJson(),
      if (setupSuggestionQuota != null)
        'setupSuggestionQuota': setupSuggestionQuota!.toJson(),
    };
  }

  @override
  bool operator ==(Object other) {
    return other is SetupSuggestion &&
        other.title == title &&
        other.seed == seed &&
        other.linePreset == linePreset &&
        other.storyControls == storyControls &&
        other.draftControls == draftControls &&
        other.setupSuggestionQuota == setupSuggestionQuota;
  }

  @override
  int get hashCode => Object.hash(
    title,
    seed,
    linePreset,
    storyControls,
    draftControls,
    setupSuggestionQuota,
  );
}
