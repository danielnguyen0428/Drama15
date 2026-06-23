/// Mô hình hồ sơ tài khoản và hạn mức (`AccountSnapshot` — Req 2, 7).
///
/// Dựng từ phản hồi `GET /auth/me` của backend:
/// `{ user: { id, email, displayName, avatarUrl?, tier }, quota, setupSuggestionQuota? }`
/// (xem `apps/web/src/story/StoryWorkspace.tsx`). Gói (`tier`) được ánh xạ sang
/// [PlanTier] với nhãn tiếng Việt (Req 2.6).
library;

import 'quota.dart';

/// Gói tài khoản (Req 2.6): nhãn "Miễn phí" / "Pro" / "Premium".
enum PlanTier {
  free,
  pro,
  premium;

  /// Nhãn gói tiếng Việt hiển thị trong giao diện (Req 2.6).
  String get label {
    switch (this) {
      case PlanTier.free:
        return 'Miễn phí';
      case PlanTier.pro:
        return 'Pro';
      case PlanTier.premium:
        return 'Premium';
    }
  }

  /// Giá trị wire (trùng tên enum viết thường).
  String get wireValue => name;

  /// Phân tích từ giá trị wire; giá trị thiếu/không hợp lệ → [PlanTier.free].
  static PlanTier fromWire(Object? value) {
    if (value is String) {
      for (final tier in PlanTier.values) {
        if (tier.wireValue == value) {
          return tier;
        }
      }
    }
    return PlanTier.free;
  }
}

/// Ảnh chụp hồ sơ người dùng kèm hạn mức (Req 2.4, 2.6, 7.5).
class AccountSnapshot {
  const AccountSnapshot({
    required this.displayName,
    required this.email,
    required this.plan,
    required this.storyQuota,
    this.setupSuggestionQuota,
  });

  /// Tên hiển thị; có thể null (khi đó hiển thị [email] — Req 2.6).
  final String? displayName;
  final String email;
  final PlanTier plan;

  /// Hạn mức bản thảo truyện trong ngày (`Story_Quota`).
  final QuotaSnapshot storyQuota;

  /// Hạn mức gợi ý kịch bản trong ngày (`Setup_Suggestion_Quota`); tùy chọn.
  final QuotaSnapshot? setupSuggestionQuota;

  /// Dựng từ phản hồi đầy đủ `GET /auth/me`
  /// (`{ user, quota, setupSuggestionQuota }`).
  factory AccountSnapshot.fromJson(Map<String, dynamic> json) {
    final rawUser = json['user'];
    final user = rawUser is Map
        ? Map<String, dynamic>.from(rawUser)
        : <String, dynamic>{};
    final rawQuota = json['quota'];
    final storyQuota = rawQuota is Map
        ? QuotaSnapshot.fromJson(Map<String, dynamic>.from(rawQuota))
        : const QuotaSnapshot(remaining: 0, limit: 0);
    final rawSuggestionQuota = json['setupSuggestionQuota'];
    final setupSuggestionQuota = rawSuggestionQuota is Map
        ? QuotaSnapshot.fromJson(Map<String, dynamic>.from(rawSuggestionQuota))
        : null;

    final displayName = user['displayName'];
    return AccountSnapshot(
      displayName: displayName is String && displayName.isNotEmpty
          ? displayName
          : null,
      email: user['email'] is String ? user['email'] as String : '',
      plan: PlanTier.fromWire(user['tier']),
      storyQuota: storyQuota,
      setupSuggestionQuota: setupSuggestionQuota,
    );
  }

  /// Tên hiển thị ưu tiên [displayName], lùi về [email] khi trống (Req 2.6).
  String get displayNameOrEmail =>
      (displayName != null && displayName!.isNotEmpty) ? displayName! : email;

  @override
  bool operator ==(Object other) =>
      other is AccountSnapshot &&
      other.displayName == displayName &&
      other.email == email &&
      other.plan == plan &&
      other.storyQuota == storyQuota &&
      other.setupSuggestionQuota == setupSuggestionQuota;

  @override
  int get hashCode =>
      Object.hash(displayName, email, plan, storyQuota, setupSuggestionQuota);
}
