import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
lines = p.read_text(encoding="utf-8").splitlines()

# Line 1899 (0-indexed 1898) has the ManuscriptContent body
old_line = lines[1898]
print(f"Line 1899 len: {len(old_line)}")

# Replace the empty-state closing with resume card added
old_es = '</div>}</>'
new_es = '{activeDraft && onResume && <div className="resume-card"><strong>{activeDraft.title}</strong><span>{activeDraft.result.chapters.length}/10 ch\u01b0\u01a1ng \u2022 B\u1ecb ng\u1eaft</span><button type="button" className="primary-button" onClick={() => onResume(activeDraft)}>Ti\u1ebfp t\u1ee5c vi\u1ebft</button></div>}</div>}</>'

if old_es in old_line:
    lines[1898] = old_line.replace(old_es, new_es)
    print("resume card added to ManuscriptContent")
else:
    print("target not found in line 1899")
    print(repr(old_line[-200:]))

p.write_text('\n'.join(lines), encoding="utf-8")
print("done")
