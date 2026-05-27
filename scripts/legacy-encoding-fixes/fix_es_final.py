import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# The actual text uses curly quotes in JSX string content
old = '<div className="empty-state"><strong>Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng n\u00e0o.</strong><span>\u0110i\u1ec1n creative brief, b\u1ea5m \u201cT\u1ea1o g\u1ee3i \u00fd\u201d ho\u1eb7c \u201cB\u1eaft \u0111\u1ea7u vi\u1ebft\u201d \u0111\u1ec3 b\u1eaft \u0111\u1ea7u.</span></div>'
print("old in text:", old in text)

# Try with the actual file content
idx = text.find('Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng n\u00e0o')
if idx == -1:
    # Try literal
    idx = text.find('Chưa có chương nào')
    print(f"literal found at {idx}")
    if idx != -1:
        # Get the full empty-state div
        start = text.rfind('<div className="empty-state">', 0, idx)
        end = text.find('</div>', idx) + 6
        old_block = text[start:end]
        print(f"block: {repr(old_block[:200])}")
        new_block = old_block.replace('</div>', '{activeDraft && onResume && <div className="resume-card"><strong>Truy\u1ec7n d\u1edf: {activeDraft.title}</strong><span>{activeDraft.result.chapters.length}/10 ch\u01b0\u01a1ng</span><button type="button" className="primary-button" onClick={() => onResume(activeDraft)}>Ti\u1ebfp t\u1ee5c vi\u1ebft</button></div>}</div>', 1)
        text = text.replace(old_block, new_block)
        print("patched")
else:
    print(f"escaped found at {idx}")

p.write_text(text, encoding="utf-8")
print("done")
