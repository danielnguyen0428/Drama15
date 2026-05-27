import pathlib, re, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
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
print(f"done after {passes} passes")

# Verify some known strings
for s in ["Tỷ phú", "Sỉ nhục", "Cúng dường", "Tham gia", "Studio sáng tác", "Nguyễn Tiến Dũng"]:
    if s.lower() in current.lower():
        print(f"  FOUND: {s}")
    else:
        print(f"  MISSING: {s}")
