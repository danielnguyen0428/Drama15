export type Locale = 'vi' | 'en';

export type TranslationKeys = typeof vi;

const vi = {
  // Header
  'header.kicker': 'Bản thảo 15 chương',
  'header.title': 'Drama 15: Xưởng viết tiểu thuyết ngắn',
  'header.subtitle': 'Ươm ý tưởng, dựng nhân vật, lập dàn ý và viết từng chương trong một không gian gọn gàng cho người viết truyện.',
  'header.meta.idea': 'Ý tưởng',
  'header.meta.character': 'Nhân vật',
  'header.meta.outline': 'Dàn ý',
  'header.meta.chapter': 'Bản thảo chương',
  'header.meta.aria': 'Quy trình sáng tác',

  // Announcement
  'announcement.kicker': '📢 Thông báo từ Admin',
  'announcement.free': 'MIỄN PHÍ HOÀN TOÀN',
  'announcement.line1_pre': '🎉 Hệ thống ',
  'announcement.line1_post': ' & đang thử nghiệm nên đôi khi chưa ổn định, ace gặp lỗi vui lòng nhắn admin ',
  'announcement.line1_link': 'Fanpage NovelKit',
  'announcement.line2': '🤖 Hệ thống sử dụng Deepseek Flash 4 để sáng tác.',
  'announcement.line3': '😢 Khi nào giàu đổi lên Model Vip Pro hơn để chạy :(',

  // Account
  'account.avatar_alt': 'Ảnh đại diện',
  'account.login_prompt': 'Đăng nhập Google để gợi ý kịch bản, viết bản thảo và giữ lại tủ truyện của bạn.',
  'account.quota_today': 'Hôm nay còn {remaining}/{limit} bản thảo truyện có thể viết',
  'account.quota_out': 'Nâng cấp Pro hoặc Premium để viết thêm bản thảo.',
  'account.quota_info': 'Mỗi bản thảo gồm ý tưởng, nhân vật, dàn ý, quan hệ và toàn bộ chương.',
  'account.resume_btn': 'Viết tiếp truyện',
  'account.sign_out': 'Đăng xuất',
  'account.sign_in': 'Đăng nhập bằng Google',
  'account.setup_quota_free': 'Free: 10 lượt gợi ý kịch bản/ngày.',
  'account.setup_quota_used': 'Đã dùng hết {limit} lượt gợi ý kịch bản hôm nay.',
  'account.setup_quota_remaining': 'Còn {remaining}/{limit} lượt gợi ý kịch bản hôm nay.',

  // Tier
  'tier.free': 'Miễn phí',
  'tier.pro': 'Pro',
  'tier.premium': 'Premium',

  // Phase
  'phase.idle': 'Sẵn sàng gợi ý kịch bản',
  'phase.suggesting': 'Đang ươm ý',
  'phase.creating': 'Đang mở phiên',
  'phase.streaming': 'Đang viết chương',
  'phase.completed': 'Hoàn tất',
  'phase.failed': 'Cần thử lại',

  // Story status
  'status.queued': 'Đang chờ',
  'status.running': 'Đang viết',
  'status.completed': 'Hoàn tất',
  'status.failed': 'Có lỗi',

  // Setup panel
  'setup.heading_label': 'Khởi tạo',
  'setup.heading_value': 'Cốt truyện',
  'setup.niche_label': 'Dòng truyện',
  'setup.custom_label': 'Nhánh riêng',
  'setup.custom_placeholder': 'VD: mẹ đơn thân bị xem thường',
  'setup.title_label': 'Nhan đề dự kiến',
  'setup.title_placeholder': 'Nhập nhan đề (bắt buộc)',
  'setup.seed_label': 'Kịch bản / cốt truyện',
  'setup.seed_placeholder': 'Một cảnh mở đầu, bí mật, vật chứng, mối quan hệ hoặc cảm xúc bạn muốn giữ... (bắt buộc)',
  'setup.style_label': 'Giọng kể',
  'setup.language_label': 'Ngôn ngữ bản thảo',
  'setup.intensity': 'Cường độ cảm xúc',
  'setup.dialogue_ratio': 'Tỷ lệ thoại',
  'setup.hook_density': 'Mật độ móc câu',
  'setup.suggest_btn': 'Gợi ý kịch bản',
  'setup.write_btn': 'Viết bản thảo',

  // Niches
  'niche.billionaire_rich_poor_romance': 'Tỷ phú / tình yêu vượt giai cấp',
  'niche.humiliation_revenge_justice': 'Sỉ nhục / trả đũa / công lý',
  'niche.secret_identity_hidden_heiress': 'Thân phận bí mật / thiên kim',
  'niche.toxic_family_betrayal': 'Gia đình độc hại / phản bội',
  'niche.cheating_ex_wedding_drama': 'Ngoại tình / cưới hỏi rạn vỡ / Dark romance',
  'niche.single_mom_poor_woman_comeback': 'Mẹ đơn thân / lật kèo',
  'niche.social_injustice_discrimination_drama': 'Bất công xã hội',
  'niche.workplace_ceo_power_struggle': 'Công sở / tổng tài / tranh quyền',
  'niche.medical_hidden_doctor_life_care': 'Y tế / bác sĩ ẩn danh',
  'niche.school_campus_bullying_identity': 'Học đường / bắt nạt',
  'niche.werewolf_luna_alpha_soulmate': 'Người sói / thủ lĩnh định mệnh',
  'niche.steamy_alien_captive_romance': 'Lãng mạn nóng bỏng / u tối',
  'niche.custom': 'Nhánh tùy biến',

  // Language options
  'lang.vietnamese': 'Tiếng Việt',
  'lang.english': 'Tiếng Anh',
  'lang.japanese': 'Tiếng Nhật',
  'lang.korean': 'Tiếng Hàn',
  'lang.spanish': 'Tiếng Tây Ban Nha',
  'lang.portuguese': 'Tiếng Bồ Đào Nha',

  // Rewrite modes
  'rewrite.full_chapter': 'Viết lại toàn chương',
  'rewrite.opening_hook': 'Móc mở đầu',
  'rewrite.closing_beat': 'Nhịp kết chương',
  'rewrite.dialogue_tone': 'Giọng thoại',
  'rewrite.class_humiliation': 'Cảm giác bị hạ thấp',
  'rewrite.retaliation_sharpness': 'Độ sắc của phản đòn',

  // Story panel
  'story.eyebrow': 'Bản thảo truyện',
  'story.default_title': 'Truyện chưa đặt tên',
  'story.resume_btn': 'Viết tiếp truyện',
  'story.export_btn': 'Tải bản thảo',
  'story.tab.chapters': 'Chương',
  'story.tab.overview': 'Ý tưởng',
  'story.tab.plan': 'Dàn ý',
  'story.tab.bible': 'Hồ sơ',
  'story.tab.relationships': 'Quan hệ',
  'story.tab.quality': 'Chất lượng',

  // Chapter panel
  'chapter.waiting': 'Đang chờ',
  'chapter.loading': 'Mèo đang viết chương cho bạn...',
  'chapter.empty': 'Chưa có chương nào. Bấm "Viết bản thảo" để bắt đầu.',
  'chapter.prefix': 'Chương',

  // Text panel
  'text.overview_title': 'Kịch bản / cốt truyện',
  'text.plan_title': 'Dàn ý chương',
  'text.bible_title': 'Hồ sơ truyện',
  'text.loading': 'Mèo đang chuẩn bị nội dung...',
  'text.empty': 'Nội dung sẽ hiện ở đây khi phiên viết bắt đầu.',

  // Relationship panel
  'relationship.title': 'Quan hệ nhân vật',
  'relationship.empty': 'Quan hệ nhân vật sẽ hiện sau khi hệ thống dựng hồ sơ truyện.',
  'relationship.showing': 'Đang hiển thị {nodes} nhân vật chính và {edges} quan hệ nổi bật.',
  'relationship.aria': 'Sơ đồ quan hệ nhân vật',

  // Quality panel
  'quality.title': 'Đánh giá chất lượng',
  'quality.empty': 'Chưa có báo cáo. Bật hội đồng độc giả / phê bình (READER_PANEL_ENABLED, MANUSCRIPT_REVIEW_ENABLED) để có đánh giá; sổ nợ liên tục hiện sau khi truyện hoàn tất.',
  'quality.foundation': 'Nền truyện (concept · hồ sơ · dàn ý)',
  'quality.foundation_rebuilt': 'Đã dựng lại nền {attempts} lần để đạt chất lượng.',
  'quality.reader_panel': 'Hội đồng độc giả',
  'quality.manuscript': 'Phê bình biên tập',
  'quality.debt': 'Sổ nợ liên tục',
  'quality.severity.low': 'Thấp',
  'quality.severity.medium': 'Vừa',
  'quality.severity.high': 'Cao',
  'quality.debt_kind.missed_foreshadow': 'Mạch gài bị bỏ',
  'quality.debt_kind.pending_foreshadow': 'Mạch gài chưa trả',
  'quality.debt_kind.unachieved_beat': 'Beat chưa đạt',
  'quality.debt_kind.late_fact': 'Sự thật xuất hiện muộn',
  'quality.persona.professor': 'Giáo sư',
  'quality.persona.critic': 'Phê bình',

  // Rewrite panel
  'rewrite.heading_label': 'Chỉnh chương',
  'rewrite.heading_value': 'Chương {index}',
  'rewrite.placeholder': 'VD: giữ cốt truyện, tăng cảm giác bị xem thường ở đoạn cao trào.',
  'rewrite.btn': 'Viết lại chương',
  'rewrite.btn_busy': 'Đang viết lại...',

  // Story list
  'stories.heading_label': 'Tủ truyện',
  'stories.heading_busy': 'Đang nạp',
  'stories.heading_count': '{count} truyện',
  'stories.refresh': 'Nạp lại tủ truyện',
  'stories.login_prompt': 'Đăng nhập để xem các bản thảo đã lưu.',
  'stories.empty': 'Tủ truyện đang trống. Viết bản thảo đầu tiên để lưu tại đây.',
  'stories.chapter_count': '{count}/{total} chương',
  'stories.resume': 'Viết tiếp',
  'stories.rename': 'Đổi tên',
  'stories.delete': 'Xóa',

  // Footer
  'footer.tagline': 'Made NovelKit.Cc with ❤️ by Dũng Nguyễn',
  'footer.aria': 'Liên kết NovelKit',
  'footer.fb_aria': 'Chat với NovelKit trên Facebook',

  // Errors / Dialogs
  'error.supabase': 'Chưa cấu hình Supabase cho đăng nhập Google.',
  'error.login': 'Không thể hoàn tất đăng nhập Google.',
  'error.account': 'Không thể nạp tài khoản.',
  'error.stories': 'Không thể nạp danh sách truyện.',
  'error.require_login': 'Vui lòng đăng nhập bằng Google để dùng tính năng này.',
  'error.out_of_quota': 'Bạn đã hết số bản thảo truyện có thể viết hôm nay. Nâng cấp Pro hoặc Premium để viết thêm bản thảo.',
  'error.suggest': 'Không thể gợi ý thiết lập truyện.',
  'error.create': 'Không thể bắt đầu viết truyện.',
  'error.stream_disconnect': 'Phiên viết bị ngắt kết nối. Bấm "Viết tiếp truyện" để nối lại các chương còn thiếu.',
  'error.open': 'Không thể mở truyện.',
  'error.resume': 'Không thể viết tiếp truyện.',
  'error.rename': 'Không thể đổi tên truyện.',
  'error.delete': 'Không thể xóa truyện.',
  'error.rewrite': 'Không thể viết lại chương.',
  'error.stream_interrupted': 'Phiên viết bị gián đoạn. Bạn có thể thử viết tiếp từ bản thảo đã có.',

  // Progress labels
  'progress.suggesting': 'Đang tìm kịch bản phù hợp...',
  'progress.suggested': 'Kịch bản đã sẵn sàng',
  'progress.creating': 'Đang mở phiên viết...',
  'progress.resuming': 'Đang chuẩn bị viết tiếp...',
  'progress.resumed': 'Đã nạp bản thảo dang dở',
  'progress.done': 'Bản thảo đã hoàn tất',
  'progress.processing': 'Đang xử lý...',
  'progress.opened_saved': 'Đã mở bản thảo đã lưu',
  'progress.opened_partial': 'Đã mở bản thảo {count}/{total} chương',
  'progress.no_chapters': 'Truyện này chưa có chương hoàn chỉnh',

  // Dialogs
  'dialog.rename': 'Nhập tiêu đề mới',
  'dialog.delete_confirm': 'Xóa truyện này khỏi danh sách?',

  // Result labels
  'result.title_prefix': 'Nhan đề',
  'result.logline_prefix': 'Tóm tắt một câu',
  'result.promise_prefix': 'Lời hứa thể loại',
  'result.conflict_prefix': 'Xung đột',
  'result.beat_prefix': 'Nhịp chính',
  'result.hook_prefix': 'Móc câu',
  'result.ending_prefix': 'Kết chương',

  // Markdown export
  'md.untitled': 'Truyện chưa đặt tên',
  'md.idea': 'Ý tưởng',
  'md.outline': 'Dàn ý',
  'md.chapter': 'Chương',

  // Language switcher
  'lang_switch.label': 'VI',
} as const;

const en: Record<keyof typeof vi, string> = {
  // Header
  'header.kicker': '15-Chapter Manuscript',
  'header.title': 'Drama 15: Short Novel Writing Studio',
  'header.subtitle': 'Brainstorm ideas, build characters, create outlines, and write each chapter in one seamless workspace for storytellers.',
  'header.meta.idea': 'Idea',
  'header.meta.character': 'Characters',
  'header.meta.outline': 'Outline',
  'header.meta.chapter': 'Chapter Draft',
  'header.meta.aria': 'Writing process',

  // Announcement
  'announcement.kicker': '📢 Admin Announcement',
  'announcement.free': 'COMPLETELY FREE',
  'announcement.line1_pre': '🎉 The system is ',
  'announcement.line1_post': ' & still in beta, so it may be unstable. Please contact admin via ',
  'announcement.line1_link': 'NovelKit Fanpage',
  'announcement.line2': '🤖 The system uses Deepseek Flash 4 for writing.',
  'announcement.line3': '😢 When we can afford it, we\'ll upgrade to a better model :(',

  // Account
  'account.avatar_alt': 'Avatar',
  'account.login_prompt': 'Sign in with Google to get plot suggestions, write manuscripts, and keep your story library.',
  'account.quota_today': 'Today: {remaining}/{limit} manuscripts remaining',
  'account.quota_out': 'Upgrade to Pro or Premium to write more manuscripts.',
  'account.quota_info': 'Each manuscript includes concept, characters, outline, relationships, and all chapters.',
  'account.resume_btn': 'Continue Writing',
  'account.sign_out': 'Sign Out',
  'account.sign_in': 'Sign in with Google',
  'account.setup_quota_free': 'Free: 10 plot suggestions/day.',
  'account.setup_quota_used': 'Used all {limit} plot suggestions for today.',
  'account.setup_quota_remaining': '{remaining}/{limit} plot suggestions remaining today.',

  // Tier
  'tier.free': 'Free',
  'tier.pro': 'Pro',
  'tier.premium': 'Premium',

  // Phase
  'phase.idle': 'Ready for plot suggestion',
  'phase.suggesting': 'Brainstorming...',
  'phase.creating': 'Opening session...',
  'phase.streaming': 'Writing chapters...',
  'phase.completed': 'Completed',
  'phase.failed': 'Needs retry',

  // Story status
  'status.queued': 'Queued',
  'status.running': 'Writing',
  'status.completed': 'Completed',
  'status.failed': 'Error',

  // Setup panel
  'setup.heading_label': 'Setup',
  'setup.heading_value': 'Plot',
  'setup.niche_label': 'Genre',
  'setup.custom_label': 'Custom genre',
  'setup.custom_placeholder': 'E.g.: single mom underestimated by everyone',
  'setup.title_label': 'Planned Title',
  'setup.title_placeholder': 'Enter title (required)',
  'setup.seed_label': 'Plot / Storyline',
  'setup.seed_placeholder': 'An opening scene, secret, evidence, relationship, or emotion you want to keep... (required)',
  'setup.style_label': 'Writing Style',
  'setup.language_label': 'Manuscript Language',
  'setup.intensity': 'Emotional Intensity',
  'setup.dialogue_ratio': 'Dialogue Ratio',
  'setup.hook_density': 'Hook Density',
  'setup.suggest_btn': 'Suggest Plot',
  'setup.write_btn': 'Write Manuscript',

  // Niches
  'niche.billionaire_rich_poor_romance': 'Billionaire / Rich-Poor Romance',
  'niche.humiliation_revenge_justice': 'Humiliation / Revenge / Justice',
  'niche.secret_identity_hidden_heiress': 'Secret Identity / Hidden Heiress',
  'niche.toxic_family_betrayal': 'Toxic Family / Betrayal',
  'niche.cheating_ex_wedding_drama': 'Cheating / Wedding Drama / Dark Romance',
  'niche.single_mom_poor_woman_comeback': 'Single Mom / Comeback Story',
  'niche.social_injustice_discrimination_drama': 'Social Injustice',
  'niche.workplace_ceo_power_struggle': 'Workplace / CEO / Power Struggle',
  'niche.medical_hidden_doctor_life_care': 'Medical / Hidden Doctor',
  'niche.school_campus_bullying_identity': 'School / Campus Bullying',
  'niche.werewolf_luna_alpha_soulmate': 'Werewolf / Alpha Soulmate',
  'niche.steamy_alien_captive_romance': 'Steamy / Dark Romance',
  'niche.custom': 'Custom Genre',

  // Language options
  'lang.vietnamese': 'Vietnamese',
  'lang.english': 'English',
  'lang.japanese': 'Japanese',
  'lang.korean': 'Korean',
  'lang.spanish': 'Spanish',
  'lang.portuguese': 'Portuguese',

  // Rewrite modes
  'rewrite.full_chapter': 'Full Chapter Rewrite',
  'rewrite.opening_hook': 'Opening Hook',
  'rewrite.closing_beat': 'Closing Beat',
  'rewrite.dialogue_tone': 'Dialogue Tone',
  'rewrite.class_humiliation': 'Humiliation Feel',
  'rewrite.retaliation_sharpness': 'Retaliation Edge',

  // Story panel
  'story.eyebrow': 'Story Manuscript',
  'story.default_title': 'Untitled Story',
  'story.resume_btn': 'Continue Writing',
  'story.export_btn': 'Download Manuscript',
  'story.tab.chapters': 'Chapters',
  'story.tab.overview': 'Concept',
  'story.tab.plan': 'Outline',
  'story.tab.bible': 'Story Bible',
  'story.tab.relationships': 'Relations',
  'story.tab.quality': 'Quality',

  // Chapter panel
  'chapter.waiting': 'Waiting',
  'chapter.loading': 'Kitty is writing your chapter...',
  'chapter.empty': 'No chapters yet. Click "Write Manuscript" to start.',
  'chapter.prefix': 'Chapter',

  // Text panel
  'text.overview_title': 'Plot / Storyline',
  'text.plan_title': 'Chapter Outline',
  'text.bible_title': 'Story Bible',
  'text.loading': 'Kitty is preparing content...',
  'text.empty': 'Content will appear here when writing starts.',

  // Relationship panel
  'relationship.title': 'Character Relationships',
  'relationship.empty': 'Character relationships will appear after the story bible is generated.',
  'relationship.showing': 'Showing {nodes} main characters and {edges} key relationships.',
  'relationship.aria': 'Character relationship diagram',

  // Quality panel
  'quality.title': 'Quality Assessment',
  'quality.empty': 'No report yet. Enable reader panel / manuscript review (READER_PANEL_ENABLED, MANUSCRIPT_REVIEW_ENABLED) for assessments; debt ledger appears after story completion.',
  'quality.foundation': 'Foundation (concept · bible · outline)',
  'quality.foundation_rebuilt': 'Foundation rebuilt {attempts} times for quality.',
  'quality.reader_panel': 'Reader Panel',
  'quality.manuscript': 'Editorial Review',
  'quality.debt': 'Continuity Debt Ledger',
  'quality.severity.low': 'Low',
  'quality.severity.medium': 'Medium',
  'quality.severity.high': 'High',
  'quality.debt_kind.missed_foreshadow': 'Missed Foreshadow',
  'quality.debt_kind.pending_foreshadow': 'Pending Foreshadow',
  'quality.debt_kind.unachieved_beat': 'Unachieved Beat',
  'quality.debt_kind.late_fact': 'Late Fact',
  'quality.persona.professor': 'Professor',
  'quality.persona.critic': 'Critic',

  // Rewrite panel
  'rewrite.heading_label': 'Edit Chapter',
  'rewrite.heading_value': 'Chapter {index}',
  'rewrite.placeholder': 'E.g.: keep the plot, increase the humiliation feel at the climax.',
  'rewrite.btn': 'Rewrite Chapter',
  'rewrite.btn_busy': 'Rewriting...',

  // Story list
  'stories.heading_label': 'Library',
  'stories.heading_busy': 'Loading',
  'stories.heading_count': '{count} stories',
  'stories.refresh': 'Refresh Library',
  'stories.login_prompt': 'Sign in to see saved manuscripts.',
  'stories.empty': 'Library is empty. Write your first manuscript to save it here.',
  'stories.chapter_count': '{count}/{total} chapters',
  'stories.resume': 'Continue',
  'stories.rename': 'Rename',
  'stories.delete': 'Delete',

  // Footer
  'footer.tagline': 'Made NovelKit.Cc with ❤️ by Dũng Nguyễn',
  'footer.aria': 'NovelKit links',
  'footer.fb_aria': 'Chat with NovelKit on Facebook',

  // Errors / Dialogs
  'error.supabase': 'Supabase is not configured for Google sign-in.',
  'error.login': 'Unable to complete Google sign-in.',
  'error.account': 'Unable to load account.',
  'error.stories': 'Unable to load story list.',
  'error.require_login': 'Please sign in with Google to use this feature.',
  'error.out_of_quota': 'You have used all your manuscript quota for today. Upgrade to Pro or Premium to write more.',
  'error.suggest': 'Unable to suggest plot setup.',
  'error.create': 'Unable to start writing.',
  'error.stream_disconnect': 'Writing session disconnected. Click "Continue Writing" to resume missing chapters.',
  'error.open': 'Unable to open story.',
  'error.resume': 'Unable to continue writing.',
  'error.rename': 'Unable to rename story.',
  'error.delete': 'Unable to delete story.',
  'error.rewrite': 'Unable to rewrite chapter.',
  'error.stream_interrupted': 'Writing session interrupted. You can try continuing from the existing manuscript.',

  // Progress labels
  'progress.suggesting': 'Finding a suitable plot...',
  'progress.suggested': 'Plot is ready',
  'progress.creating': 'Opening writing session...',
  'progress.resuming': 'Preparing to continue...',
  'progress.resumed': 'Loaded unfinished manuscript',
  'progress.done': 'Manuscript completed',
  'progress.processing': 'Processing...',
  'progress.opened_saved': 'Opened saved manuscript',
  'progress.opened_partial': 'Opened manuscript {count}/{total} chapters',
  'progress.no_chapters': 'This story has no completed chapters',

  // Dialogs
  'dialog.rename': 'Enter new title',
  'dialog.delete_confirm': 'Remove this story from the list?',

  // Result labels
  'result.title_prefix': 'Title',
  'result.logline_prefix': 'One-line summary',
  'result.promise_prefix': 'Genre promise',
  'result.conflict_prefix': 'Conflict',
  'result.beat_prefix': 'Main beat',
  'result.hook_prefix': 'Hook',
  'result.ending_prefix': 'Chapter ending',

  // Markdown export
  'md.untitled': 'Untitled Story',
  'md.idea': 'Concept',
  'md.outline': 'Outline',
  'md.chapter': 'Chapter',

  // Language switcher
  'lang_switch.label': 'EN',
};

export const translations: Record<Locale, Record<keyof typeof vi, string>> = { vi, en };
