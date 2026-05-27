import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# 1. Change hero text
text = text.replace(
    "Studio s\u00e1ng t\u00e1c Drama ng\u1eafn chu\u1ea9n ng\u01b0\u1eddi th\u1eadt",
    "Studio s\u00e1ng t\u00e1c Drama ng\u1eafn chu\u1ea9n xu\u1ea5t b\u1ea3n"
)
print("text 1 done")

# 2. Change eyebrow text
text = text.replace(
    "Writer Operations Desk",
    "Drama15 Lite Studio"
)
print("text 2 done")

# 3. Change support-strip from 2 cols to 3 cols and add "T\u1ea1o truy\u1ec7n m\u1edbi" block
# Find the closing </a> of telegram support-card and add new block after it
old_strip_end = '''            <a className="support-card" href="https://t.me/novelkit_zone" target="_blank" rel="noreferrer">
              <svg className="support-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" /></svg>
              <strong>Tham gia Nh\u00f3m Chat</strong>
              <span>Giao l\u01b0u & ch\u00e9m gi\u00f3 c\u00f9ng c\u00e1c s\u1ebfp</span>
            </a>'''

new_strip_end = '''            <a className="support-card" href="https://t.me/novelkit_zone" target="_blank" rel="noreferrer">
              <svg className="support-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" /></svg>
              <strong>Tham gia Nh\u00f3m Chat</strong>
              <span>Giao l\u01b0u & ch\u00e9m gi\u00f3 c\u00f9ng c\u00e1c s\u1ebfp</span>
            </a>
            <button type="button" className="support-card" onClick={() => { setShowSetup(true); setSuggestResult(null); setStoryId(null); setResult({ chapters: [] }); setPhase('idle'); setProgress(0); setStoryTitle(''); setActiveNav('chapters'); }}>
              <svg className="support-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
              <strong>T\u1ea1o truy\u1ec7n m\u1edbi</strong>
              <span>B\u1eaft \u0111\u1ea7u m\u1ed9t b\u1ea3n th\u1ea3o ho\u00e0n to\u00e0n m\u1edbi</span>
            </button>'''

if old_strip_end in text:
    text = text.replace(old_strip_end, new_strip_end)
    print("added new story block")
else:
    print("strip end NOT FOUND")

# 4. Move hero-band layout: h1 first, then hero-card below
# Current: hero-band has 2 cols: [left: support-strip + eyebrow + h1] [right: hero-card]
# New: hero-band stacks: [row1: support-strip 3 cols] [row2: eyebrow + h1] [row3: hero-card full width]
# We do this via CSS change, not TSX restructure

p.write_text(text, encoding="utf-8")
print("TSX done")
