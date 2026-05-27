import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\src\modules\prompts\drama15-seed-engine.ts")
text = p.read_text(encoding="utf-8")

old = '''const OUTPUT_LANGUAGE_VIRAL_TITLE_GRAMMAR = [
    "Create a high-CTR webnovel title for an emotional short drama.",
    "titleHint must follow the selected outputLanguage. Do not force titleHint into English unless outputLanguage is English.",
    "TITLE STYLE \u2013 WEBNOVEL VIRAL FORMAT (hard rules):",
    "1. Use FIRST PERSON voice (t\u00f4i/em/c\u00f4). The heroine speaks directly. NOT third-person narration.",
    "2. Use SHORT, PUNCHY structure: 5-12 words max. Two clauses connected by comma, question mark, or exclamation.",
    "3. PATTERN: [Humiliation/Action done TO me] + [My revenge/reversal]. The first half is the insult, the second half is the payback.",
    "4. Use EMOTIONAL PUNCTUATION: question marks (?), exclamation marks (!), or ellipsis (\u2026) to create tension.",
    "5. Include a POWER REVERSAL: the title must show the heroine flipping the situation.",
    "6. Use CONCRETE ACTIONS, not abstract descriptions. Verbs like: \u0111u\u1ed5i, sa th\u1ea3i, x\u00e9, k\u00fd, x\u00f3a t\u00ean, l\u1eadt, mua l\u1ea1i, tr\u1ee5c xu\u1ea5t.",
    "7. BANNED patterns: long descriptive sentences, third-person narration (C\u00f4 g\u00e1i ngh\u00e8o..., Ng\u01b0\u1eddi v\u1ee3 b\u00ed m\u1eadt...), comma-separated plot summaries, poetic/vague titles.",'''

new = '''const OUTPUT_LANGUAGE_VIRAL_TITLE_GRAMMAR = [
    "Create a high-CTR webnovel title for an emotional short drama.",
    "titleHint must follow the selected outputLanguage. Do not force titleHint into English unless outputLanguage is English.",
    "TITLE STYLE \u2013 WEBNOVEL VIRAL FORMAT (hard rules):",
    "1. Use SHORT, PUNCHY structure: 5-14 words max. Two clauses connected by comma, question mark, or exclamation.",
    "2. CORE PRINCIPLE: The title must contain a POWER REVERSAL or DRAMATIC IRONY that makes readers instantly curious.",
    "3. VARY THE VOICE \u2014 rotate between these structures (do NOT always use T\u00f4i...T\u00f4i):",
    "   a) First-person reversal: [Action done to me], [My payback] (T\u00f4i/Em voice)",
    "   b) Second-person shock: [You did X], [consequence Y] (Anh/Em addressing antagonist)",
    "   c) Dramatic irony: [Situation A], nh\u01b0ng [hidden truth B]",
    "   d) Question hook: [Shocking question]? [Twist answer]",
    "   e) Time contrast: [Past humiliation], [present/future power]",
    "   f) Identity reveal: [Mistaken identity], [true identity]",
    "   g) Conditional threat: [If you do X], [I will Y]",
    "4. Use EMOTIONAL PUNCTUATION: question marks (?), exclamation marks (!), or ellipsis (\u2026) to create tension.",
    "5. Use CONCRETE ACTIONS, not abstract descriptions. Verbs like: \u0111u\u1ed5i, sa th\u1ea3i, x\u00e9, k\u00fd, x\u00f3a t\u00ean, l\u1eadt, mua l\u1ea1i, tr\u1ee5c xu\u1ea5t, qu\u1ef3, c\u01b0\u1edbi, b\u1ecf r\u01a1i, ph\u1ea3n b\u1ed9i, \u0111\u1ed1t.",
    "6. BANNED patterns: long descriptive sentences, third-person narration (C\u00f4 g\u00e1i ngh\u00e8o..., Ng\u01b0\u1eddi v\u1ee3 b\u00ed m\u1eadt...), comma-separated plot summaries, poetic/vague titles.",
    "7. DIVERSITY RULE: Each new title MUST use a DIFFERENT structure from the list above. If recent titles used pattern (a), use (b)-(g) instead.",'''

if old in text:
    text = text.replace(old, new)
    print("Replaced title rules")
else:
    print("NOT FOUND")
    idx = text.find("OUTPUT_LANGUAGE_VIRAL_TITLE_GRAMMAR")
    print(repr(text[idx:idx+400]))
    sys.exit(1)

# Now replace the examples section to be more diverse
old_examples = '''    "STRONG Vietnamese webnovel title examples (study the rhythm and voice):",
    "- Tr\u1ee5c Xu\u1ea5t T\u00f4i? Anh B\u1ecb X\u00f3a T\u00ean R\u1ed3i!",
    "- \u0110u\u1ed5i T\u00f4i Kh\u1ecfi Cu\u1ed9c H\u1ecdn, T\u00f4i Sa Th\u1ea3i T\u1ed5ng T\u00e0i",
    "- Ly H\u00f4n Xong, Anh Qu\u1ef3 Xin T\u00f4i Quay L\u1ea1i",
    "- X\u00e9 H\u1ee3p \u0110\u1ed3ng C\u1ee7a T\u00f4i? T\u00f4i X\u00e9 Lu\u00f4n C\u00f4ng Ty Anh",
    "- Anh G\u1ecdi T\u00f4i L\u00e0 R\u00e1c, Gi\u1edd T\u00f4i L\u00e0 Ch\u1ee7 N\u1ee3 C\u1ee7a Anh",
    "- B\u1ecf T\u00f4i V\u00ec C\u00f4 Ta? C\u00f4 Ta L\u00e0 Nh\u00e2n Vi\u00ean C\u1ee7a T\u00f4i",
    "- C\u01b0\u1edbi T\u00f4i Ngh\u00e8o H\u00f4m Nay, Mai T\u00f4i Mua C\u1ea3 T\u00f2a Nh\u00e0",
    "- K\u00fd Gi\u1ea5y Ly H\u00f4n Xong, Anh M\u1edbi Bi\u1ebft T\u00f4i L\u00e0 Ai",
    "- \u0110u\u1ed5i T\u00f4i Ra C\u1eeda Sau, T\u00f4i B\u01b0\u1edbc V\u00e0o C\u1eeda Ch\u00ednh L\u00e0m S\u1ebfp",
    "- G\u1ecdi T\u00f4i L\u00e0 Th\u01b0 K\u00fd T\u1ea1m? T\u00f4i Gi\u1eef 51% C\u1ed5 Ph\u1ea7n",'''

new_examples = '''    "STRONG Vietnamese webnovel title examples (DIVERSE structures \u2014 study the variety):",
    "--- Pattern (a) First-person reversal:",
    "- \u0110u\u1ed5i T\u00f4i Kh\u1ecfi Cu\u1ed9c H\u1ecdn, T\u00f4i Sa Th\u1ea3i T\u1ed5ng T\u00e0i",
    "- X\u00e9 H\u1ee3p \u0110\u1ed3ng C\u1ee7a T\u00f4i? T\u00f4i X\u00e9 Lu\u00f4n C\u00f4ng Ty Anh",
    "--- Pattern (b) Second-person shock:",
    "- Anh Ch\u1ecdn C\u00f4 Ta, Gi\u1edd Qu\u1ef3 Tr\u01b0\u1edbc M\u1eb7t Em \u0110i",
    "- Anh X\u00f3a T\u00ean Em Kh\u1ecfi Di Ch\u00fac? Em X\u00f3a Lu\u00f4n T\u1eadp \u0110o\u00e0n",
    "--- Pattern (c) Dramatic irony:",
    "- C\u00f4 D\u00e2u B\u1ecb \u0110u\u1ed5i Kh\u1ecfi Ti\u1ec7c, Nh\u01b0ng C\u00f4 S\u1edf H\u1eefu Kh\u00e1ch S\u1ea1n",
    "- Ng\u01b0\u1eddi V\u1ee3 B\u1ecb Khinh, H\u00f3a Ra L\u00e0 Ch\u1ee7 N\u1ee3 100 T\u1ef7",
    "--- Pattern (d) Question hook:",
    "- Ly H\u00f4n Xong M\u1edbi Bi\u1ebft V\u1ee3 L\u00e0 Ai? Mu\u1ed9n R\u1ed3i!",
    "- Sa Th\u1ea3i Gi\u00e1m \u0110\u1ed1c? Anh C\u00f3 Bi\u1ebft C\u00f4 \u1ea4y L\u00e0 Ai Kh\u00f4ng?",
    "--- Pattern (e) Time contrast:",
    "- H\u00f4m Qua B\u1ecb \u0110u\u1ed5i Kh\u1ecfi Nh\u00e0, H\u00f4m Nay Mua C\u1ea3 Con Ph\u1ed1",
    "- 3 N\u0103m B\u1ecb Khinh, 1 Ng\u00e0y L\u1eadt \u0110\u1ed5 T\u1ea5t C\u1ea3",
    "--- Pattern (f) Identity reveal:",
    "- T\u01b0\u1edfng L\u00e0 Con D\u00e2u Ngh\u00e8o, H\u00f3a Ra L\u00e0 Ch\u1ee7 T\u1ecbch",
    "- K\u00fd Gi\u1ea5y Ly H\u00f4n Xong, Anh M\u1edbi Bi\u1ebft Em L\u00e0 Ai",
    "--- Pattern (g) Conditional threat:",
    "- N\u1ebfu Anh D\u00e1m K\u00fd, Em S\u1ebd X\u00f3a S\u1ea1ch T\u1ea5t C\u1ea3",
    "- C\u1ee9 \u0110u\u1ed5i Em \u0110i, R\u1ed3i Anh S\u1ebd H\u1ed1i H\u1eadn",'''

if old_examples in text:
    text = text.replace(old_examples, new_examples)
    print("Replaced examples")
else:
    print("Examples NOT FOUND")

p.write_text(text, encoding="utf-8")
print("Done")
