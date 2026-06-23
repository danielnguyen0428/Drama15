/// Controller hạn mức (Quota_Module — Req 7, 4.3/4.5).
library;

import 'package:flutter_riverpod/legacy.dart';

import '../models/quota.dart';

/// Trạng thái hạn mức truyện và gợi ý kịch bản.
class QuotaState {
  const QuotaState({this.storyQuota, this.suggestionQuota});

  final QuotaSnapshot? storyQuota;
  final QuotaSnapshot? suggestionQuota;

  /// Còn lượt tạo truyện (Req 7.3). Khi chưa có dữ liệu, mặc định cho phép.
  bool get canCreateStory => storyQuota == null || storyQuota!.remaining > 0;

  /// Còn lượt gợi ý kịch bản (Req 4.5). Khi chưa có dữ liệu, mặc định cho phép.
  bool get canSuggest =>
      suggestionQuota == null || suggestionQuota!.remaining > 0;

  QuotaState copyWith({
    QuotaSnapshot? storyQuota,
    QuotaSnapshot? suggestionQuota,
  }) {
    return QuotaState(
      storyQuota: storyQuota ?? this.storyQuota,
      suggestionQuota: suggestionQuota ?? this.suggestionQuota,
    );
  }
}

/// Giữ và cập nhật hạn mức hiển thị.
class QuotaController extends StateNotifier<QuotaState> {
  QuotaController() : super(const QuotaState());

  /// Cập nhật `Story_Quota` (Req 7.1, 7.5).
  void applyStoryQuota(QuotaSnapshot quota) {
    state = state.copyWith(storyQuota: quota);
  }

  /// Cập nhật `Setup_Suggestion_Quota` (Req 7.2, 4.3).
  void applySuggestionQuota(QuotaSnapshot quota) {
    state = state.copyWith(suggestionQuota: quota);
  }
}

/// Provider cho [QuotaController].
final quotaControllerProvider =
    StateNotifierProvider<QuotaController, QuotaState>((ref) {
      return QuotaController();
    });
