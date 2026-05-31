import 'dart:convert';

/// Ngôn ngữ đầu ra của bản thảo (Req 3.6).
///
/// Sáu giá trị khớp `OutputLanguageSchema` của API. Giá trị truyền lên dây
/// (wire value) là tên viết thường (`vietnamese`, `english`, ...). Mặc định là
/// [OutputLanguage.vietnamese].
enum OutputLanguage {
  vietnamese,
  english,
  japanese,
  korean,
  spanish,
  portuguese;

  /// Giá trị JSON gửi/nhận với API (trùng tên enum viết thường).
  String get wireValue => name;

  /// Nhãn tiếng Việt hiển thị trong giao diện chọn ngôn ngữ.
  String get label {
    switch (this) {
      case OutputLanguage.vietnamese:
        return 'Tiếng Việt';
      case OutputLanguage.english:
        return 'Tiếng Anh';
      case OutputLanguage.japanese:
        return 'Tiếng Nhật';
      case OutputLanguage.korean:
        return 'Tiếng Hàn';
      case OutputLanguage.spanish:
        return 'Tiếng Tây Ban Nha';
      case OutputLanguage.portuguese:
        return 'Tiếng Bồ Đào Nha';
    }
  }

  /// Phân tích giá trị wire thành [OutputLanguage]; trả về
  /// [OutputLanguage.vietnamese] khi giá trị thiếu hoặc không hợp lệ
  /// (mặc định an toàn, khớp `default('vietnamese')` của schema).
  static OutputLanguage fromWire(Object? value) {
    if (value is String) {
      for (final language in OutputLanguage.values) {
        if (language.wireValue == value) {
          return language;
        }
      }
    }
    return OutputLanguage.vietnamese;
  }
}

/// Một lựa chọn dòng truyện (`niche`) kèm nhãn tiếng Việt (Req 3.1).
class NicheOption {
  const NicheOption(this.value, this.label);

  /// Giá trị gửi lên API (ví dụ `billionaire_rich_poor_romance`).
  final String value;

  /// Nhãn tiếng Việt hiển thị trong danh sách chọn.
  final String label;
}

/// Đúng 13 lựa chọn dòng truyện kèm nhãn tiếng Việt, trùng `NICHES` của bản
/// web (Req 3.1). Phần tử cuối `custom` mở trường nhập "Nhánh riêng" (Req 3.2).
const List<NicheOption> kNiches = <NicheOption>[
  NicheOption(
    'billionaire_rich_poor_romance',
    'Tỷ phú / tình yêu vượt giai cấp',
  ),
  NicheOption('humiliation_revenge_justice', 'Sỉ nhục / trả đũa / công lý'),
  NicheOption('secret_identity_hidden_heiress', 'Thân phận bí mật / thiên kim'),
  NicheOption('toxic_family_betrayal', 'Gia đình độc hại / phản bội'),
  NicheOption(
    'cheating_ex_wedding_drama',
    'Ngoại tình / cưới hỏi rạn vỡ / Dark romance',
  ),
  NicheOption('single_mom_poor_woman_comeback', 'Mẹ đơn thân / lật kèo'),
  NicheOption('social_injustice_discrimination_drama', 'Bất công xã hội'),
  NicheOption(
    'workplace_ceo_power_struggle',
    'Công sở / tổng tài / tranh quyền',
  ),
  NicheOption('medical_hidden_doctor_life_care', 'Y tế / bác sĩ ẩn danh'),
  NicheOption('school_campus_bullying_identity', 'Học đường / bắt nạt'),
  NicheOption('werewolf_luna_alpha_soulmate', 'Người sói / thủ lĩnh định mệnh'),
  NicheOption('steamy_alien_captive_romance', 'Lãng mạn nóng bỏng / u tối'),
  NicheOption('custom', 'Nhánh tùy biến'),
];

/// Giá trị `niche` đại diện cho nhánh tự nhập (Req 3.2).
const String kCustomNiche = 'custom';

/// Các giá trị mặc định trùng `DEFAULT_CONFIG` của bản web (Req 3.10).
const String kDefaultNiche = 'billionaire_rich_poor_romance';
const String kDefaultStylePreset = 'co_man_warm_modern_blueprint';
const double kDefaultIntensity = 0.84;
const double kDefaultDialogueRatio = 0.56;
const double kDefaultHookDensity = 0.67;

/// Bộ điều khiển kịch bản nhận từ `setup-suggest` và gửi lại trong
/// [StoryConfig] (Req 4.2). Ánh xạ `StoryControlsSchema` của API.
class StoryControls {
  const StoryControls({
    this.betrayalType = 'hidden_relationship_replaced_by_fiancee',
    this.shameType = 'polite_class_exclusion',
    this.revengeMode = 'strategic_withdrawal_status_reversal',
    this.endingMode = 'bittersweet_dignity_first',
    this.intensity = kDefaultIntensity,
  });

  final String betrayalType;
  final String shameType;
  final String revengeMode;
  final String endingMode;
  final double intensity;

  /// Phân tích từ JSON, áp dụng mặc định cho khóa thiếu (khớp schema).
  factory StoryControls.fromJson(Map<String, dynamic> json) {
    return StoryControls(
      betrayalType:
          (json['betrayalType'] as String?) ??
          'hidden_relationship_replaced_by_fiancee',
      shameType: (json['shameType'] as String?) ?? 'polite_class_exclusion',
      revengeMode:
          (json['revengeMode'] as String?) ??
          'strategic_withdrawal_status_reversal',
      endingMode:
          (json['endingMode'] as String?) ?? 'bittersweet_dignity_first',
      intensity: _asDouble(json['intensity'], kDefaultIntensity),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'betrayalType': betrayalType,
      'shameType': shameType,
      'revengeMode': revengeMode,
      'endingMode': endingMode,
      'intensity': intensity,
    };
  }

  StoryControls copyWith({
    String? betrayalType,
    String? shameType,
    String? revengeMode,
    String? endingMode,
    double? intensity,
  }) {
    return StoryControls(
      betrayalType: betrayalType ?? this.betrayalType,
      shameType: shameType ?? this.shameType,
      revengeMode: revengeMode ?? this.revengeMode,
      endingMode: endingMode ?? this.endingMode,
      intensity: intensity ?? this.intensity,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is StoryControls &&
        other.betrayalType == betrayalType &&
        other.shameType == shameType &&
        other.revengeMode == revengeMode &&
        other.endingMode == endingMode &&
        other.intensity == intensity;
  }

  @override
  int get hashCode =>
      Object.hash(betrayalType, shameType, revengeMode, endingMode, intensity);
}

/// Cấu hình truyện gửi tới API (Req 3, 4.2).
///
/// Lớp bất biến ánh xạ 1-1 `StoryConfigSchema` trong
/// `apps/api/src/startDev.ts`. [toJson] luôn chứa đủ các khóa schema và
/// [StoryConfig.fromJson] phục hồi tương đương ([toJson]/[fromJson] khứ hồi —
/// Req 3.10).
class StoryConfig {
  const StoryConfig({
    this.niche = kDefaultNiche,
    this.customNiche = '',
    this.title = '',
    this.seed = '',
    this.outputLanguage = OutputLanguage.vietnamese,
    this.intensity = kDefaultIntensity,
    this.dialogueRatio = kDefaultDialogueRatio,
    this.hookDensity = kDefaultHookDensity,
    this.stylePreset = kDefaultStylePreset,
    this.storyControls,
  });

  /// 1 trong 13 lựa chọn (gồm `custom`).
  final String niche;

  /// Nhánh tự nhập khi `niche == 'custom'` (Req 3.2); mặc định rỗng.
  final String customNiche;

  /// Nhan đề dự kiến; cho phép rỗng (Req 3.3).
  final String title;

  /// Kịch bản / cốt truyện; cho phép rỗng (Req 3.3).
  final String seed;

  /// Ngôn ngữ đầu ra; mặc định [OutputLanguage.vietnamese] (Req 3.6).
  final OutputLanguage outputLanguage;

  /// Cường độ cảm xúc trong [0, 1]; mặc định 0.84 (Req 3.7).
  final double intensity;

  /// Tỷ lệ thoại trong [0.2, 0.85]; mặc định 0.56 (Req 3.8).
  final double dialogueRatio;

  /// Mật độ móc câu trong [0, 1]; mặc định 0.67 (Req 3.9).
  final double hookDensity;

  /// Id giọng kể; fallback `co_man_warm_modern_blueprint` (Req 3.5).
  final String stylePreset;

  /// Bộ điều khiển kịch bản tùy chọn (Req 4.2).
  final StoryControls? storyControls;

  /// Cấu hình mặc định trùng `DEFAULT_CONFIG` của bản web (Req 3.10).
  static const StoryConfig defaults = StoryConfig();

  /// Phân tích từ JSON, áp dụng mặc định cho khóa thiếu (khớp schema).
  factory StoryConfig.fromJson(Map<String, dynamic> json) {
    final controls = json['storyControls'];
    return StoryConfig(
      niche: _asNonEmptyString(json['niche'], kDefaultNiche),
      customNiche: (json['customNiche'] as String?) ?? '',
      title: (json['title'] as String?) ?? '',
      seed: (json['seed'] as String?) ?? '',
      outputLanguage: OutputLanguage.fromWire(json['outputLanguage']),
      intensity: _asDouble(json['intensity'], kDefaultIntensity),
      dialogueRatio: _asDouble(json['dialogueRatio'], kDefaultDialogueRatio),
      hookDensity: _asDouble(json['hookDensity'], kDefaultHookDensity),
      stylePreset: _asNonEmptyString(json['stylePreset'], kDefaultStylePreset),
      storyControls: controls is Map<String, dynamic>
          ? StoryControls.fromJson(controls)
          : null,
    );
  }

  /// Thân yêu cầu gửi lên API, khớp `StoryConfigSchema` (Req 3.10).
  ///
  /// Luôn chứa đủ 9 khóa bắt buộc; `storyControls` chỉ được thêm khi khác null
  /// (khóa tùy chọn của schema) để giữ tính khứ hồi với [StoryConfig.fromJson].
  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{
      'niche': niche,
      'customNiche': customNiche,
      'title': title,
      'seed': seed,
      'outputLanguage': outputLanguage.wireValue,
      'intensity': intensity,
      'dialogueRatio': dialogueRatio,
      'hookDensity': hookDensity,
      'stylePreset': stylePreset,
    };
    if (storyControls != null) {
      json['storyControls'] = storyControls!.toJson();
    }
    return json;
  }

  StoryConfig copyWith({
    String? niche,
    String? customNiche,
    String? title,
    String? seed,
    OutputLanguage? outputLanguage,
    double? intensity,
    double? dialogueRatio,
    double? hookDensity,
    String? stylePreset,
    StoryControls? storyControls,
  }) {
    return StoryConfig(
      niche: niche ?? this.niche,
      customNiche: customNiche ?? this.customNiche,
      title: title ?? this.title,
      seed: seed ?? this.seed,
      outputLanguage: outputLanguage ?? this.outputLanguage,
      intensity: intensity ?? this.intensity,
      dialogueRatio: dialogueRatio ?? this.dialogueRatio,
      hookDensity: hookDensity ?? this.hookDensity,
      stylePreset: stylePreset ?? this.stylePreset,
      storyControls: storyControls ?? this.storyControls,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is StoryConfig &&
        other.niche == niche &&
        other.customNiche == customNiche &&
        other.title == title &&
        other.seed == seed &&
        other.outputLanguage == outputLanguage &&
        other.intensity == intensity &&
        other.dialogueRatio == dialogueRatio &&
        other.hookDensity == hookDensity &&
        other.stylePreset == stylePreset &&
        other.storyControls == storyControls;
  }

  @override
  int get hashCode => Object.hash(
    niche,
    customNiche,
    title,
    seed,
    outputLanguage,
    intensity,
    dialogueRatio,
    hookDensity,
    stylePreset,
    storyControls,
  );

  /// Tiện ích chuỗi hóa toàn bộ thân yêu cầu thành JSON text.
  String encode() => jsonEncode(toJson());
}

/// Ép một giá trị JSON về [double], dùng [fallback] khi không phải số.
double _asDouble(Object? value, double fallback) {
  if (value is num) {
    return value.toDouble();
  }
  if (value is String) {
    final parsed = double.tryParse(value);
    if (parsed != null) {
      return parsed;
    }
  }
  return fallback;
}

/// Lấy chuỗi không rỗng, ngược lại dùng [fallback].
String _asNonEmptyString(Object? value, String fallback) {
  if (value is String && value.trim().isNotEmpty) {
    return value;
  }
  return fallback;
}
