import pathlib, re, sys
sys.stdout.reconfigure(encoding="utf-8")

def fix_file(path):
    p = pathlib.Path(path)
    text = p.read_text(encoding="utf-8")
    pattern = re.compile(r"[\xc0-\xff][\x80-\xbf]+")
    def fix_chunk(m):
        s = m.group(0)
        try:
            return s.encode("latin-1").decode("utf-8")
        except Exception:
            return s
    prev = None
    current = text
    passes = 0
    while current != prev and passes < 10:
        prev = current
        current = pattern.sub(fix_chunk, current)
        passes += 1
    p.write_text(current, encoding="utf-8")
    print(f"{path}: {passes} passes")
    return current

tsx = fix_file(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
css = fix_file(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
cb  = fix_file(r"D:\CODEEEEE\ZZZ\apps\web\src\auth\OAuthCallback.tsx")

for label, text in [("TSX", tsx), ("CSS", css), ("CB", cb)]:
    remaining = re.findall(r"[\xc0-\xff][\x80-\xbf]+", text)
    print(f"{label} remaining mojibake sequences: {len(remaining)}")
    for s in remaining[:5]:
        print(f"  {repr(s)}")
