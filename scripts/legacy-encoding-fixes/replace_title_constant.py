import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p=pathlib.Path(r"D:\CODEEEEE\ZZZ\src\modules\prompts\drama15-seed-engine.ts")
text=p.read_text(encoding='utf-8')
start=text.find('const OUTPUT_LANGUAGE_VIRAL_TITLE_GRAMMAR = [')
end=text.find('const CONCEPT_TITLE_GRAMMAR = [', start)
if start==-1 or end==-1:
    raise SystemExit(f'constant bounds not found {start} {end}')
new = r'''const OUTPUT_LANGUAGE_VIRAL_TITLE_GRAMMAR = [
  "Create a high-CTR webnovel title for an emotional short drama.",
  "titleHint must follow the selected outputLanguage. Do not force titleHint into English unless outputLanguage is English.",
  "TITLE STYLE — WEBNOVEL VIRAL FORMAT (hard rules):",
  "1. Use SHORT, PUNCHY structure: 5-14 words max. Two clauses connected by comma, question mark, exclamation, or time contrast.",
  "2. CORE PRINCIPLE: The title must contain a POWER REVERSAL, dramatic irony, or identity reveal that makes readers instantly curious.",
  "3. VARY THE VOICE — rotate between these structures. Do NOT always use 'Tôi..., Tôi...':",
  "   a) First-person reversal: [Action done to me], [My payback] (Tôi/Em voice)",
  "   b) Second-person shock: [You did X], [consequence Y] (Anh/Em addressing antagonist)",
  "   c) Dramatic irony: [Situation A], nhưng [hidden truth B]",
  "   d) Question hook: [Shocking question]? [Twist answer]",
  "   e) Time contrast: [Past humiliation], [present/future power]",
  "   f) Identity reveal: [Mistaken identity], [true identity]",
  "   g) Conditional threat: [If you do X], [I will Y]",
  "4. Use EMOTIONAL PUNCTUATION: question marks (?), exclamation marks (!), or ellipsis (…) to create tension.",
  "5. Use CONCRETE ACTIONS, not abstract descriptions. Verbs like: đuổi, sa thải, xé, ký, xóa tên, lật, mua lại, trục xuất, quỳ, cưới, bỏ rơi, phản bội, đốt.",
  "6. BANNED patterns: long descriptive sentences, third-person narration (Cô gái nghèo..., Người vợ bí mật...), comma-separated plot summaries, poetic/vague titles.",
  "7. DIVERSITY RULE: Each new title MUST use a DIFFERENT structure from recent titles. If recent titles used pattern (a), use (b)-(g) instead.",
  "",
  "STRONG Vietnamese webnovel title examples (DIVERSE structures — study the variety):",
  "--- Pattern (a) First-person reversal:",
  "- Đuổi Tôi Khỏi Cuộc Họp, Tôi Sa Thải Tổng Tài",
  "- Xé Hợp Đồng Của Tôi? Tôi Xé Luôn Công Ty Anh",
  "--- Pattern (b) Second-person shock:",
  "- Anh Chọn Cô Ta, Giờ Quỳ Trước Mặt Em Đi",
  "- Anh Xóa Tên Em Khỏi Di Chúc? Em Xóa Luôn Tập Đoàn",
  "--- Pattern (c) Dramatic irony:",
  "- Cô Dâu Bị Đuổi Khỏi Tiệc, Nhưng Cô Sở Hữu Khách Sạn",
  "- Người Vợ Bị Khinh, Hóa Ra Là Chủ Nợ 100 Tỷ",
  "--- Pattern (d) Question hook:",
  "- Ly Hôn Xong Mới Biết Vợ Là Ai? Muộn Rồi!",
  "- Sa Thải Giám Đốc? Anh Có Biết Cô Ấy Là Ai Không?",
  "--- Pattern (e) Time contrast:",
  "- Hôm Qua Bị Đuổi Khỏi Nhà, Hôm Nay Mua Cả Con Phố",
  "- 3 Năm Bị Khinh, 1 Ngày Lật Đổ Tất Cả",
  "--- Pattern (f) Identity reveal:",
  "- Tưởng Là Con Dâu Nghèo, Hóa Ra Là Chủ Tịch",
  "- Ký Giấy Ly Hôn Xong, Anh Mới Biết Em Là Ai",
  "--- Pattern (g) Conditional threat:",
  "- Nếu Anh Dám Ký, Em Sẽ Xóa Sạch Tất Cả",
  "- Cứ Đuổi Em Đi, Rồi Anh Sẽ Hối Hận",
  "",
  "STRONG English webnovel title examples:",
  "- Fired Me? I Own Your Company Now",
  "- You Chose Her, Now Kneel Before Me",
  "- Kicked Out Of The Meeting, I Fired The CEO",
  "- Signed My Divorce, Then Begged Me To Stay",
  "- Called Me Trash? I'm Your Biggest Creditor",
  "",
  "The title must make the reader INSTANTLY curious: who did this to her, and how will she destroy them?",
  "Avoid repeating the same title grammar across consecutive generations.",
  "Make titleHint sound native in request.outputLanguage.",
].join("\n");

'''
text=text[:start]+new+text[end:]
p.write_text(text,encoding='utf-8')
print('title grammar replaced')
