/// Mô hình tài khoản người dùng và hạn mức, ánh xạ 1-1 với phản hồi
/// `GET /auth/me` của backend Fastify hiện có.
///
/// Backend trả về dạng `{ user, quota, setupSuggestionQuota }` trong đó:
/// - `user`  = `{ id, email, displayName, avatarUrl?, tier }`
/// - `quota` = `{ usageDate, used, limit, remaining }`
/// - `setupSuggestionQuota` cùng cấu trúc `quota`, hoặc `null` với gói không
///   giới hạn lượt gợi ý (tier khác `free`).
///
/// Toàn bộ lớp ở đây là **bất biến** (immutable). Các hàm nhãn hiển thị
/// ([userLabel], [tierLabel]) là **hàm thuần và toàn phần** (total) để phục vụ
/// hiển thị tiếng Việt (Req 2.6, 7.1, 7.2) và property test ánh xạ nhãn.
library;

/// Gói tài khoản người dùng (Req 2.6).
///
/// Khớp đúng tập giá trị `UserTier` của backend: `free | pro | premium`.
enum UserTier { free, pro, premium }

/// Chuyển chuỗi tier từ JSON API thành [UserTier].
///
/// Theo `parseUserTier` của backend: chỉ `pro`/`premium` được nhận trực tiếp,
/// mọi giá trị khác (gồm `null`, rỗng, không hợp lệ) quy về [UserTier.free].
/// Hàm thuần và toàn phần — an toàn trước dữ liệu lạ.
UserTier userTierFromJson(Object? value) {
  switch (value) {
    case 'pro':
      return UserTier.pro;
    case 'premium':
      return UserTier.premium;
    default:
      return UserTier.free;
  }
}

/// Chuyển [UserTier] về chuỗi khớp định dạng API (`free`/`pro`/`premium`).
String userTierToJson(UserTier tier) {
  switch (tier) {
    case UserTier.free:
      return 'free';
    case UserTier.pro:
      return 'pro';
    case UserTier.premium:
      return 'premium';
  }
}

/// Đọc một giá trị JSON về `int` một cách an toàn.
///
/// Backend trả `used`/`limit`/`remaining` dưới dạng số JSON; hàm này chấp nhận
/// cả `int`, `double` và chuỗi số, mặc định `0` khi không đọc được.
int _asInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? 0;
  return 0;
}

/// Đọc một giá trị JSON về `String` (mặc định rỗng).
String _asString(Object? value) {
  if (value is String) return value;
  if (value == null) return '';
  return value.toString();
}

/// Hồ sơ người dùng đã đăng nhập (Req 2.6).
class AppUser {
  const AppUser({
    required this.id,
    required this.email,
    required this.displayName,
    this.avatarUrl,
    required this.tier,
  });

  /// Tạo [AppUser] từ đối tượng `user` trong phản hồi `GET /auth/me`.
  factory AppUser.fromJson(Map<String, dynamic> json) {
    final rawAvatar = json['avatarUrl'];
    return AppUser(
      id: _asString(json['id']),
      email: _asString(json['email']),
      displayName: _asString(json['displayName']),
      avatarUrl: rawAvatar is String && rawAvatar.isNotEmpty ? rawAvatar : null,
      tier: userTierFromJson(json['tier']),
    );
  }

  /// Định danh duy nhất của người dùng (id hồ sơ Supabase).
  final String id;

  /// Email tài khoản; dùng làm nhãn hiển thị khi không có [displayName].
  final String email;

  /// Tên hiển thị; có thể rỗng khi nhà cung cấp OAuth không cấp tên.
  final String displayName;

  /// Ảnh đại diện (tùy chọn); `null` khi không có.
  final String? avatarUrl;

  /// Gói tài khoản, quyết định nhãn gói và hạn mức.
  final UserTier tier;

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'id': id,
      'email': email,
      'displayName': displayName,
      if (avatarUrl != null) 'avatarUrl': avatarUrl,
      'tier': userTierToJson(tier),
    };
  }

  @override
  bool operator ==(Object other) {
    return other is AppUser &&
        other.id == id &&
        other.email == email &&
        other.displayName == displayName &&
        other.avatarUrl == avatarUrl &&
        other.tier == tier;
  }

  @override
  int get hashCode => Object.hash(id, email, displayName, avatarUrl, tier);
}

/// Hạn mức sử dụng trong ngày (Req 7.1).
///
/// Hiển thị theo định dạng "còn {remaining}/{limit}".
class Quota {
  const Quota({
    required this.usageDate,
    required this.used,
    required this.limit,
    required this.remaining,
  });

  /// Tạo [Quota] từ đối tượng `quota`/`setupSuggestionQuota` của API.
  factory Quota.fromJson(Map<String, dynamic> json) {
    return Quota(
      usageDate: _asString(json['usageDate']),
      used: _asInt(json['used']),
      limit: _asInt(json['limit']),
      remaining: _asInt(json['remaining']),
    );
  }

  /// Ngày tính hạn mức theo giờ Việt Nam, dạng `YYYY-MM-DD`.
  final String usageDate;

  /// Số lượt đã dùng trong ngày.
  final int used;

  /// Giới hạn tối đa trong ngày theo gói.
  final int limit;

  /// Số lượt còn lại trong ngày.
  final int remaining;

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'usageDate': usageDate,
      'used': used,
      'limit': limit,
      'remaining': remaining,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is Quota &&
        other.usageDate == usageDate &&
        other.used == used &&
        other.limit == limit &&
        other.remaining == remaining;
  }

  @override
  int get hashCode => Object.hash(usageDate, used, limit, remaining);
}

/// Ảnh chụp tài khoản trả về từ `GET /auth/me` (Req 2.4).
class AccountSnapshot {
  const AccountSnapshot({
    required this.user,
    required this.quota,
    this.setupSuggestionQuota,
  });

  /// Tạo [AccountSnapshot] từ toàn bộ thân phản hồi `GET /auth/me`:
  /// `{ user, quota, setupSuggestionQuota }`.
  factory AccountSnapshot.fromJson(Map<String, dynamic> json) {
    final rawSetupQuota = json['setupSuggestionQuota'];
    return AccountSnapshot(
      user: AppUser.fromJson(
        (json['user'] as Map?)?.cast<String, dynamic>() ??
            const <String, dynamic>{},
      ),
      quota: Quota.fromJson(
        (json['quota'] as Map?)?.cast<String, dynamic>() ??
            const <String, dynamic>{},
      ),
      setupSuggestionQuota: rawSetupQuota is Map
          ? Quota.fromJson(rawSetupQuota.cast<String, dynamic>())
          : null,
    );
  }

  /// Hồ sơ người dùng hiện tại.
  final AppUser user;

  /// Hạn mức bản thảo truyện trong ngày (`Story_Quota`).
  final Quota quota;

  /// Hạn mức gợi ý kịch bản trong ngày (`Setup_Suggestion_Quota`);
  /// `null` với gói không giới hạn (tier khác `free`).
  final Quota? setupSuggestionQuota;

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'user': user.toJson(),
      'quota': quota.toJson(),
      if (setupSuggestionQuota != null)
        'setupSuggestionQuota': setupSuggestionQuota!.toJson(),
    };
  }

  @override
  bool operator ==(Object other) {
    return other is AccountSnapshot &&
        other.user == user &&
        other.quota == quota &&
        other.setupSuggestionQuota == setupSuggestionQuota;
  }

  @override
  int get hashCode => Object.hash(user, quota, setupSuggestionQuota);
}

/// Nhãn hiển thị cho người dùng (Req 2.6): tên hiển thị khi có, ngược lại email.
///
/// Hàm **thuần và toàn phần**: với mọi [AppUser] luôn trả về một chuỗi.
/// `displayName` rỗng (hoặc chỉ gồm khoảng trắng) thì dùng email.
String userLabel(AppUser user) {
  final name = user.displayName.trim();
  if (name.isNotEmpty) {
    return name;
  }
  return user.email;
}

/// Nhãn gói tiếng Việt (Req 2.6): `free→Miễn phí`, `pro→Pro`, `premium→Premium`.
///
/// Hàm **thuần và toàn phần**: ánh xạ đầy đủ mọi giá trị [UserTier].
String tierLabel(UserTier tier) {
  switch (tier) {
    case UserTier.free:
      return 'Miễn phí';
    case UserTier.pro:
      return 'Pro';
    case UserTier.premium:
      return 'Premium';
  }
}
