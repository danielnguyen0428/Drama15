/**
 * Vietnamese catalog for the Web_Client SPA.
 *
 * Key set MUST be identical to {@link ./catalog.en.ts} so the
 * compile-time `LocaleCatalog` type stays consistent across locales
 * (Requirement 19.1).
 */

import type { LocaleCatalog } from './types';

export const viCatalog: LocaleCatalog = {
  // Navigation
  'nav.home': 'Trang chủ',
  'nav.create': 'Tạo truyện',
  'nav.history': 'Lịch sử',
  'nav.account': 'Tài khoản',
  'nav.logout': 'Đăng xuất',

  // Auth
  'auth.signInWithGoogle': 'Đăng nhập với Google',
  'auth.signOut': 'Đăng xuất',
  'auth.emailUnverified': 'Email Google chưa được xác minh',

  // Story
  'story.create': 'Tạo truyện',
  'story.createFull': 'Tạo Toàn Bộ Truyện',
  'story.createChapter': 'Tạo Chương',
  'story.continueMissing': 'Tiếp tục từ chương còn thiếu',
  'story.tabOverview': 'Tổng Quan',
  'story.tabPlan': 'Kế Hoạch',
  'story.tabChapters': 'Chương',

  // Voice
  'voice.generate': 'Gen Voice 10 Chương',
  'voice.pause': 'Tạm dừng',
  'voice.resume': 'Tiếp tục',
  'voice.stop': 'Dừng',
  'voice.retry': 'Thử lại',

  // History
  'history.title': 'Lịch sử truyện',
  'history.empty': 'Chưa có truyện nào',
  'history.delete': 'Xóa',
  'history.confirmDelete': 'Bạn có chắc muốn xóa truyện này?',

  // Errors
  'errors.unauthenticated': 'Vui lòng đăng nhập lại',
  'errors.licenseInactive': 'Gói license không còn hiệu lực',
  'errors.rateLimited': 'Bạn gửi yêu cầu quá nhanh, vui lòng thử lại sau',
  'errors.freeChapterQuotaExhausted': 'Bạn đã dùng hết quota chương miễn phí trong ngày',
  'errors.upstreamError': 'Hệ thống tạm thời bận, vui lòng thử lại',

  // Locale switcher
  'locale.vi': 'Tiếng Việt',
  'locale.en': 'English',
  'locale.switchLabel': 'Ngôn ngữ',
};
