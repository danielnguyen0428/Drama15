/// Chuỗi giao diện theo [OutputLanguage] đã chọn (Req 3.6).
///
/// Tiếng Việt khi `vietnamese`; tiếng Anh cho các ngôn ngữ đầu ra khác (fallback
/// UI song ngữ VI/EN, khớp bản web).
library;

import '../models/account.dart';
import '../models/offline_download.dart';
import '../models/rewrite.dart';
import '../models/story.dart';
import '../models/story_config.dart';
import '../services/api_client.dart';

/// Bộ chuỗi UI theo ngôn ngữ đầu ra hiện tại.
class AppStrings {
  const AppStrings._({required this.isEnglish});

  final bool isEnglish;

  /// Dựng bộ chuỗi từ [OutputLanguage] trong cấu hình truyện.
  factory AppStrings.forLanguage(OutputLanguage language) {
    return AppStrings._(isEnglish: language != OutputLanguage.vietnamese);
  }

  // ─── Điều hướng ───
  String get navInit => isEnglish ? 'Setup' : 'Khởi tạo';
  String get navDraft => isEnglish ? 'Manuscript' : 'Bản thảo';
  String get navLibrary => isEnglish ? 'Library' : 'Tủ truyện';
  String get navAccount => isEnglish ? 'Account' : 'Tài khoản';
  String get navSettings => isEnglish ? 'Settings' : 'Cài đặt';

  // ─── Cấu hình ───
  String get configTitle => navInit;
  String get draftControlsTooltip =>
      isEnglish ? 'Intensity & pacing' : 'Cường độ & nhịp kể';
  String get suggestSectionTitle =>
      isEnglish ? 'Story setup' : 'Gợi ý sáng tác';
  String get nicheFieldLabel => isEnglish ? 'Story niche' : 'Dòng truyện';
  String get customNicheLabel => isEnglish ? 'Custom niche' : 'Nhánh riêng';
  String get titleLabel => isEnglish ? 'Working title' : 'Nhan đề dự kiến';
  String get seedLabel =>
      isEnglish ? 'Plot / story seed' : 'Kịch bản / cốt truyện';
  String get styleLabel => isEnglish ? 'Narrative voice' : 'Giọng kể';
  String get outputLanguageFieldLabel =>
      isEnglish ? 'Output language' : 'Ngôn ngữ đầu ra';
  String get suggestButton =>
      isEnglish ? 'Suggest plot' : 'Gợi ý kịch bản';
  String get suggesting => isEnglish ? 'Processing...' : 'Đang xử lý...';
  String get writeDraftButton =>
      isEnglish ? 'Write manuscript' : 'Viết bản thảo';
  String get quotaExceeded =>
      isEnglish
          ? 'Daily limit reached. Upgrade to Pro or Premium.'
          : 'Đã hết hạn mức trong ngày. Nâng cấp lên Pro hoặc Premium.';
  String get draftControlsTitle => draftControlsTooltip;
  String get intensityLabel =>
      isEnglish ? 'Emotional intensity' : 'Cường độ cảm xúc';
  String get dialogueRatioLabel =>
      isEnglish ? 'Dialogue ratio' : 'Tỷ lệ thoại';
  String get hookDensityLabel =>
      isEnglish ? 'Hook density' : 'Mật độ móc câu';
  String get close => isEnglish ? 'Close' : 'Đóng';
  String get quotaTodayTitle =>
      isEnglish ? "Today's limits" : 'Hạn mức hôm nay';
  String get quotaStoryLabel =>
      isEnglish ? 'Story manuscripts' : 'Bản thảo truyện';
  String quotaStoryValue(int remaining, int limit) => isEnglish
      ? '$remaining/$limit left today'
      : 'Hôm nay còn $remaining/$limit';
  String get quotaSuggestLabel =>
      isEnglish ? 'Plot suggestions' : 'Gợi ý kịch bản';
  String quotaSuggestValue(int remaining, int limit) => isEnglish
      ? '$remaining/$limit per day'
      : 'Còn $remaining/$limit lượt/ngày';
  String get quotaSuggestFallback => isEnglish
      ? '10 plot suggestions per day'
      : '10 lượt gợi ý kịch bản/ngày';

  // ─── Tài khoản ───
  String get authKicker => isEnglish
      ? 'AI DRAMA NOVEL WRITING ASSISTANT'
      : 'TRỢ LÝ AI SÁNG TÁC TIỂU THUYẾT DRAMA';
  String get authSubtitle => isEnglish
      ? 'Write a full 15-chapter story and read it like a real book. Sign in to get plot suggestions, write manuscripts, and keep your library.'
      : 'Sáng tác trọn bộ 15 chương, đọc như một cuốn sách thật. Đăng nhập để gợi ý kịch bản, viết bản thảo và giữ tủ truyện của bạn.';
  String get signOut => isEnglish ? 'Sign out' : 'Đăng xuất';
  String get signingIn => isEnglish ? 'Signing in...' : 'Đang đăng nhập...';
  String get signInGoogle =>
      isEnglish ? 'Sign in with Google' : 'Đăng nhập bằng Google';
  String get retry => isEnglish ? 'Retry' : 'Thử lại';
  String get signInTimeout => isEnglish
      ? 'Sign-in timed out. Please try again.'
      : 'Đăng nhập quá thời gian. Vui lòng thử lại.';
  String get signInFailed => isEnglish
      ? 'Sign-in failed. Please try again.'
      : 'Đăng nhập thất bại. Vui lòng thử lại.';
  String get profileLoadTimeout => isEnglish
      ? 'Profile load timed out.'
      : 'Nạp hồ sơ quá thời gian.';

  // ─── Tủ truyện ───
  String get libraryTitle => navLibrary;
  String get libraryEmpty =>
      isEnglish ? 'No stories yet.' : 'Chưa có truyện nào.';
  String storyChapterCount(int count, int total) => isEnglish
      ? '$count/$total chapters'
      : '$count/$total chương';
  String get rename => isEnglish ? 'Rename' : 'Đổi tên';
  String get delete => isEnglish ? 'Delete' : 'Xóa';
  String get resumeStory =>
      isEnglish ? 'Continue writing' : 'Viết tiếp truyện';
  String get downloadOffline => isEnglish
      ? 'Download for offline reading'
      : 'Tải về để đọc ngoại tuyến';
  String get refreshDownload => isEnglish
      ? 'Refresh download'
      : 'Làm mới bản tải về';
  String get removeDownload =>
      isEnglish ? 'Remove download' : 'Xóa bản tải về';
  String get renameStoryTitle =>
      isEnglish ? 'Rename story' : 'Đổi tên truyện';
  String get cancel => isEnglish ? 'Cancel' : 'Hủy';
  String get save => isEnglish ? 'Save' : 'Lưu';

  // ─── Bản thảo ───
  String get workspaceTitle => navDraft;
  String get tabChapters => isEnglish ? 'Chapters' : 'Chương';
  String get tabConcept => isEnglish ? 'Concept' : 'Ý tưởng';
  String get tabPlan => isEnglish ? 'Outline' : 'Dàn ý';
  String get tabBible => isEnglish ? 'Bible' : 'Hồ sơ';
  String get tabRelationships => isEnglish ? 'Relationships' : 'Quan hệ';
  String get emptyConcept =>
      isEnglish ? 'No concept yet.' : 'Chưa có ý tưởng.';
  String get emptyPlan => isEnglish ? 'No outline yet.' : 'Chưa có dàn ý.';
  String get emptyBible => isEnglish ? 'No bible yet.' : 'Chưa có hồ sơ.';
  String get emptyRelationships => isEnglish
      ? 'No relationship graph yet.'
      : 'Chưa có đồ thị quan hệ.';
  String get writingDraft =>
      isEnglish ? 'Writing manuscript...' : 'Đang viết bản thảo...';
  String get initializing =>
      isEnglish ? 'Initializing...' : 'Đang khởi tạo...';
  String progressChapters(int percent, int written, int total) => isEnglish
      ? '$percent% · $written/$total chapters written'
      : '$percent% · đã viết $written/$total chương';
  String get preparingFirstChapter => isEnglish
      ? 'Preparing the first chapter...'
      : 'Đang chuẩn bị chương đầu tiên...';
  String get noChaptersYet =>
      isEnglish ? 'No chapters yet.' : 'Chưa có chương nào.';
  String get writingNextChapter => isEnglish
      ? 'Writing the next chapter...'
      : 'Đang viết chương tiếp theo...';
  String chapterHeading(int index, String? title) {
    final prefix = isEnglish ? 'Chapter' : 'Chương';
    final t = title?.trim() ?? '';
    return t.isEmpty ? '$prefix $index' : '$prefix $index: $t';
  }
  String get rewriteInstructionLabel =>
      isEnglish ? 'Rewrite instructions' : 'Hướng dẫn viết lại';
  String get rewriting => isEnglish ? 'Rewriting...' : 'Đang viết lại...';
  String get rewriteChapter =>
      isEnglish ? 'Rewrite chapter' : 'Viết lại chương';
  String get storyCompleted =>
      isEnglish ? 'Story is already complete.' : 'Truyện đã hoàn tất.';
  String get storyNotResumable => isEnglish
      ? 'This story has no partial draft to continue.'
      : 'Truyện chưa có bản thảo từng phần để viết tiếp.';
  String get pleaseSignInAgain => isEnglish
      ? 'Please sign in again.'
      : 'Vui lòng đăng nhập lại.';
  String get streamDisconnected => isEnglish
      ? 'Stream disconnected. Tap "Continue writing" to resume missing chapters.'
      : 'Luồng bị gián đoạn. Bấm "Viết tiếp truyện" để nối lại các chương còn thiếu.';

  // ─── Reader ───
  String readerChapterPos(int current, int total) => isEnglish
      ? 'Chapter $current/$total'
      : 'Chương $current/$total';
  String get noContent =>
      isEnglish ? 'No content.' : 'Không có nội dung.';
  String get fontSizeLabel => isEnglish ? 'Font size' : 'Cỡ chữ';
  String get themeLabel => isEnglish ? 'Theme' : 'Chủ đề';
  String get fontFamilyLabel => isEnglish ? 'Font' : 'Phông';
  String get serifFont => isEnglish ? 'Serif' : 'Có chân';
  String get sansFont => isEnglish ? 'Sans' : 'Không chân';
  String get brightnessLabel => isEnglish ? 'Brightness' : 'Độ sáng';
  String get readingModeLabel => isEnglish ? 'Reading mode' : 'Chế độ đọc';
  String get pagedMode => isEnglish ? 'Paged' : 'Phân trang';
  String get scrollMode => isEnglish ? 'Scroll' : 'Cuộn';
  String readerThemeLabel(String name) => switch (name) {
    'light' => isEnglish ? 'Light' : 'Sáng',
    'sepia' => isEnglish ? 'Sepia' : 'Sepia',
    'dark' => isEnglish ? 'Dark' : 'Tối',
    _ => name,
  };

  // ─── Cài đặt ───
  String get settingsTitle => navSettings;
  String get sectionAbout => isEnglish ? 'About' : 'Giới thiệu';
  String get versionLabel => isEnglish ? 'Version' : 'Phiên bản';
  String get aboutAppTitle =>
      isEnglish ? 'About Drama 15' : 'Giới thiệu Drama 15';
  String get aboutAppSubtitle => isEnglish
      ? 'AI assistant for 15-chapter drama novels'
      : 'Trợ lý AI sáng tác tiểu thuyết drama 15 chương';
  String get sectionLegal => isEnglish ? 'Legal' : 'Pháp lý';
  String get privacyPolicy =>
      isEnglish ? 'Privacy policy' : 'Chính sách quyền riêng tư';
  String get termsOfUse =>
      isEnglish ? 'Terms of use' : 'Điều khoản sử dụng';
  String get deleteAccountTitle =>
      isEnglish ? 'Delete account & data' : 'Xóa tài khoản & dữ liệu';
  String get deleteAccountSubtitle => isEnglish
      ? 'Request deletion of all personal data'
      : 'Yêu cầu xóa toàn bộ dữ liệu cá nhân';
  String get sectionSupport => isEnglish ? 'Support' : 'Hỗ trợ';
  String get contactSupport =>
      isEnglish ? 'Contact support' : 'Liên hệ hỗ trợ';
  String get rateApp => isEnglish ? 'Rate the app' : 'Đánh giá ứng dụng';
  String get aboutLegalese => isEnglish
      ? '© 2024–2025 NovelKit Studio.\nAll rights reserved.'
      : '© 2024–2025 NovelKit Studio.\nMọi quyền được bảo lưu.';
  String get aboutDescription => isEnglish
      ? 'AI assistant for 15-chapter drama novels. '
          'Write drama with AI and read it like a real book.'
      : 'Trợ lý AI sáng tác tiểu thuyết drama 15 chương. '
          'Sáng tác drama với AI, đọc như một cuốn sách thật.';
  String get policyPlaceholder => isEnglish
      ? 'Policy content will be available at:\nhttps://drama.novelkit.cc/privacy\nhttps://drama.novelkit.cc/terms'
      : 'Nội dung chính sách sẽ được cập nhật tại:\nhttps://drama.novelkit.cc/privacy\nhttps://drama.novelkit.cc/terms';
  String get deleteAccountDialogTitle =>
      isEnglish ? 'Delete account' : 'Xóa tài khoản';
  String get deleteAccountDialogBody => isEnglish
      ? 'To delete your account and all data, email support@novelkit.cc '
          'with the subject "Account deletion request". '
          'We will process it within 30 days.'
      : 'Để xóa tài khoản và toàn bộ dữ liệu, vui lòng gửi email tới '
          'support@novelkit.cc với tiêu đề "Yêu cầu xóa tài khoản". '
          'Chúng tôi sẽ xử lý trong vòng 30 ngày.';
  String get understood => isEnglish ? 'Got it' : 'Đã hiểu';

  // ─── Lỗi cấu hình ───
  String get configInvalidTitle => isEnglish
      ? 'Invalid app configuration'
      : 'Cấu hình ứng dụng không hợp lệ';
  String get configInvalidBody => isEnglish
      ? 'The following configuration values cannot be used:'
      : 'Các giá trị cấu hình sau không sử dụng được:';

  // ─── API / lỗi ───
  String apiFailureMessage(ApiFailureKind kind) {
    switch (kind) {
      case ApiFailureKind.network:
        return isEnglish
            ? 'Network connection lost. Check your connection and try again.'
            : 'Mất kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.';
      case ApiFailureKind.unauthorized:
        return isEnglish
            ? 'Session expired. Please sign in again.'
            : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
      case ApiFailureKind.quota:
        return isEnglish
            ? 'You have used today\'s quota.'
            : 'Bạn đã dùng hết hạn mức trong ngày.';
      case ApiFailureKind.validation:
        return isEnglish ? 'Invalid request.' : 'Yêu cầu không hợp lệ.';
      case ApiFailureKind.notFound:
        return isEnglish
            ? 'Requested content not found.'
            : 'Không tìm thấy nội dung yêu cầu.';
      case ApiFailureKind.conflict:
        return isEnglish
            ? 'Action conflicts with current state.'
            : 'Thao tác xung đột với trạng thái hiện tại.';
      case ApiFailureKind.server:
        return isEnglish
            ? 'Server error. Please try again later.'
            : 'Máy chủ gặp sự cố. Vui lòng thử lại sau.';
      case ApiFailureKind.config:
        return configInvalidTitle;
    }
  }

  String get storyNoContentOffline => isEnglish
      ? 'Story has no content to download.'
      : 'Truyện chưa có nội dung để tải về.';
  String get storageFull => isEnglish
      ? 'Storage is full.'
      : 'Hết dung lượng lưu trữ.';

  /// Ánh xạ mã lỗi nghiệp vụ hoặc dùng [failure.message] từ server.
  String localizeFailure(ApiFailure<dynamic> failure) {
    switch (failure.code) {
      case 'story_no_content':
        return storyNoContentOffline;
      case 'story_completed':
        return storyCompleted;
      case 'story_not_resumable':
        return storyNotResumable;
      default:
        break;
    }
    if (failure.message.isNotEmpty &&
        failure.message != failure.code &&
        !_isDefaultKindMessage(failure)) {
      return failure.message;
    }
    return apiFailureMessage(failure.kind);
  }

  bool _isDefaultKindMessage(ApiFailure<dynamic> failure) {
    for (final lang in OutputLanguage.values) {
      final strings = AppStrings.forLanguage(lang);
      if (failure.message == strings.apiFailureMessage(failure.kind)) {
        return true;
      }
    }
    return false;
  }

  // ─── Nhãn enum / lookup ───
  String outputLanguageOption(OutputLanguage language) {
    if (isEnglish) {
      return switch (language) {
        OutputLanguage.vietnamese => 'Vietnamese',
        OutputLanguage.english => 'English',
        OutputLanguage.japanese => 'Japanese',
        OutputLanguage.korean => 'Korean',
        OutputLanguage.spanish => 'Spanish',
        OutputLanguage.portuguese => 'Portuguese',
      };
    }
    return switch (language) {
      OutputLanguage.vietnamese => 'Tiếng Việt',
      OutputLanguage.english => 'Tiếng Anh',
      OutputLanguage.japanese => 'Tiếng Nhật',
      OutputLanguage.korean => 'Tiếng Hàn',
      OutputLanguage.spanish => 'Tiếng Tây Ban Nha',
      OutputLanguage.portuguese => 'Tiếng Bồ Đào Nha',
    };
  }

  String nicheLabel(String value) {
    if (isEnglish) {
      return switch (value) {
        'billionaire_rich_poor_romance' =>
          'Billionaire / cross-class romance',
        'humiliation_revenge_justice' => 'Humiliation / revenge / justice',
        'secret_identity_hidden_heiress' =>
          'Secret identity / hidden heiress',
        'toxic_family_betrayal' => 'Toxic family / betrayal',
        'cheating_ex_wedding_drama' =>
          'Affair / wedding drama / dark romance',
        'single_mom_poor_woman_comeback' => 'Single mom / comeback',
        'social_injustice_discrimination_drama' => 'Social injustice',
        'workplace_ceo_power_struggle' => 'Workplace / CEO / power struggle',
        'medical_hidden_doctor_life_care' => 'Medical / hidden doctor',
        'school_campus_bullying_identity' => 'School / bullying',
        'werewolf_luna_alpha_soulmate' => 'Werewolf / fated mate',
        'steamy_alien_captive_romance' => 'Steamy / dark romance',
        'custom' => 'Custom niche',
        _ => value,
      };
    }
    for (final n in kNiches) {
      if (n.value == value) return n.label;
    }
    return value;
  }

  String statusLabel(StoryStatus status) {
    if (isEnglish) {
      return switch (status) {
        StoryStatus.queued => 'Queued',
        StoryStatus.running => 'Writing',
        StoryStatus.completed => 'Complete',
        StoryStatus.failed => 'Error',
      };
    }
    return switch (status) {
      StoryStatus.queued => 'Đang chờ',
      StoryStatus.running => 'Đang viết',
      StoryStatus.completed => 'Hoàn tất',
      StoryStatus.failed => 'Có lỗi',
    };
  }

  String rewriteModeLabel(RewriteMode mode) {
    if (isEnglish) {
      return switch (mode) {
        RewriteMode.full_chapter => 'Rewrite full chapter',
        RewriteMode.opening_hook => 'Opening hook',
        RewriteMode.closing_beat => 'Closing beat',
        RewriteMode.dialogue_tone => 'Dialogue tone',
        RewriteMode.class_humiliation => 'Humiliation feel',
        RewriteMode.retaliation_sharpness => 'Retaliation sharpness',
      };
    }
    return switch (mode) {
      RewriteMode.full_chapter => 'Viết lại toàn chương',
      RewriteMode.opening_hook => 'Móc mở đầu',
      RewriteMode.closing_beat => 'Nhịp kết chương',
      RewriteMode.dialogue_tone => 'Giọng thoại',
      RewriteMode.class_humiliation => 'Cảm giác bị hạ thấp',
      RewriteMode.retaliation_sharpness => 'Độ sắc của phản đòn',
    };
  }

  String planTierLabel(PlanTier tier) {
    return switch (tier) {
      PlanTier.free => isEnglish ? 'Free' : 'Miễn phí',
      PlanTier.pro => 'Pro',
      PlanTier.premium => 'Premium',
    };
  }

  String offlineStatusLabel(OfflineDownloadStatus status) {
    if (isEnglish) {
      return switch (status) {
        OfflineDownloadStatus.notDownloaded => 'Not saved',
        OfflineDownloadStatus.downloading => 'Saving...',
        OfflineDownloadStatus.downloaded => 'Saved',
        OfflineDownloadStatus.updateAvailable => 'Update available',
      };
    }
    return switch (status) {
      OfflineDownloadStatus.notDownloaded => 'Chưa lưu',
      OfflineDownloadStatus.downloading => 'Đang lưu...',
      OfflineDownloadStatus.downloaded => 'Đã lưu',
      OfflineDownloadStatus.updateAvailable => 'Có bản mới',
    };
  }
}
