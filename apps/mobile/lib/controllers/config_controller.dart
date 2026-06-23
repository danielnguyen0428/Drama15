/// Controller cấu hình truyện + gợi ý kịch bản (Config_Module/Suggest_Module —
/// Req 3, 4).
library;

import 'package:flutter_riverpod/legacy.dart';

import '../config/providers.dart';
import '../i18n/app_strings.dart';
import '../models/setup_suggestion.dart';
import '../models/story_config.dart';
import '../models/style_preset.dart';
import '../repositories/story_repository.dart';
import '../services/api_client.dart';
import 'quota_controller.dart';

/// Trạng thái màn hình cấu hình.
class ConfigState {
  const ConfigState({
    this.config = StoryConfig.defaults,
    this.presets = const <StylePreset>[],
    this.suggesting = false,
    this.error,
  });

  final StoryConfig config;
  final List<StylePreset> presets;
  final bool suggesting;
  final String? error;

  ConfigState copyWith({
    StoryConfig? config,
    List<StylePreset>? presets,
    bool? suggesting,
    Object? error = _sentinel,
  }) {
    return ConfigState(
      config: config ?? this.config,
      presets: presets ?? this.presets,
      suggesting: suggesting ?? this.suggesting,
      error: identical(error, _sentinel) ? this.error : error as String?,
    );
  }

  static const Object _sentinel = Object();
}

/// Giữ `StoryConfig`, nạp giọng kể và gọi gợi ý kịch bản.
class ConfigController extends StateNotifier<ConfigState> {
  ConfigController(this._stories, this._quota, this._getStrings)
    : super(const ConfigState());

  final StoryRepository _stories;
  final QuotaController _quota;
  final AppStrings Function() _getStrings;

  /// Cập nhật cấu hình hiện tại.
  void updateConfig(StoryConfig config) {
    state = state.copyWith(config: config);
  }

  /// Nạp danh sách giọng kể; fallback `co_man_warm_modern_blueprint` (Req 3.4,
  /// 3.5).
  Future<void> loadStylePresets() async {
    final response = await _stories.getStylePresets();
    if (response is ApiSuccess<List<StylePreset>> && response.data.isNotEmpty) {
      state = state.copyWith(presets: response.data);
    } else {
      state = state.copyWith(
        presets: const <StylePreset>[StylePreset.fallback],
      );
    }
  }

  /// Gọi `setup-suggest` và điền `title`/`seed`/`storyControls` (Req 4.1, 4.2).
  Future<void> suggest() async {
    state = state.copyWith(suggesting: true, error: null);
    final response = await _stories.setupSuggest(state.config);
    if (response is ApiSuccess<SetupSuggestion>) {
      final s = response.data;
      state = state.copyWith(
        config: state.config.copyWith(
          title: s.title ?? state.config.title,
          seed: s.seed ?? state.config.seed,
          storyControls: s.storyControls ?? state.config.storyControls,
        ),
        suggesting: false,
      );
      if (s.setupSuggestionQuota != null) {
        _quota.applySuggestionQuota(s.setupSuggestionQuota!);
      }
    } else {
      final failure = response as ApiFailure<SetupSuggestion>;
      state = state.copyWith(
        suggesting: false,
        error: _getStrings().localizeFailure(failure),
      );
    }
  }
}

/// Provider cho [ConfigController].
final configControllerProvider =
    StateNotifierProvider<ConfigController, ConfigState>((ref) {
      return ConfigController(
        ref.watch(storyRepositoryProvider),
        ref.watch(quotaControllerProvider.notifier),
        () => AppStrings.forLanguage(ref.read(uiOutputLanguageProvider)),
      );
    });
