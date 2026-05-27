import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")
# Find the moi line
for i, line in enumerate(text.splitlines()):
    if "m\u00e1\u00bb" in line or "\u00e1\u00bb\u009b" in line:
        print(f"Line {i}: {repr(line)}")
        break
# Also search for the specific broken sequence
import re
for m in re.finditer(r"m[\u00e0-\u00ff][\u0080-\u00bf]", text):
    print(f"pos {m.start()}: {repr(text[m.start()-10:m.end()+10])}")
    print(f"  bytes: {[hex(ord(c)) for c in m.group(0)]}")
