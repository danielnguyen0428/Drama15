import pathlib, sys, re
sys.stdout.reconfigure(encoding="utf-8")

# Build a comprehensive mojibake->correct mapping for Vietnamese + common chars
# These are the most common double-encoded sequences
MAPPING = {}

# Generate all 2-byte UTF-8 sequences (U+0080 to U+07FF)
for cp in range(0x0080, 0x0800):
    c = chr(cp)
    try:
        mojibake = c.encode("utf-8").decode("latin-1")
        MAPPING[mojibake] = c
    except Exception:
        pass

# Generate all 3-byte UTF-8 sequences for Vietnamese range (U+0800 to U+FFFF)
for cp in range(0x0800, 0x10000):
    c = chr(cp)
    try:
        mojibake = c.encode("utf-8").decode("latin-1")
        MAPPING[mojibake] = c
    except Exception:
        pass

# Sort by length descending so longer sequences match first
patterns = sorted(MAPPING.keys(), key=len, reverse=True)
regex = re.compile("|".join(re.escape(p) for p in patterns))

def fix_text(text):
    prev = None
    while text != prev:
        prev = text
        text = regex.sub(lambda m: MAPPING[m.group(0)], text)
    return text

for path in [
    r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx",
    r"D:\CODEEEEE\ZZZ\apps\web\src\auth\OAuthCallback.tsx",
]:
    p = pathlib.Path(path)
    text = p.read_text(encoding="utf-8")
    fixed = fix_text(text)
    p.write_text(fixed, encoding="utf-8")
    print(f"Fixed: {path}")

text = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx").read_text(encoding="utf-8")
for term in ["T\u1ef7 ph\u00fa", "S\u1ec9 nh\u1ee5c", "C\u00fang d\u01b0\u1eddng", "chuy\u1ec3n kho\u1ea3n", "NGUY\u1ec4N TI\u1ebcN D\u0168NG", "\u0111\u00f4 n\u00e1ch"]:
    print(term, term in text)
idx = text.find("humiliation")
print(text[idx:idx+120])
