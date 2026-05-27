import pathlib, re, sys
sys.stdout.reconfigure(encoding="utf-8")

def fix_mojibake_mixed(text):
    # Match sequences of chars that look like double-encoded UTF-8
    # These are chars in latin-extended range that form valid UTF-8 when re-encoded as latin-1
    # Pattern catches: sequences starting with 0xC0-0xFF followed by 0x80-0xBF range chars
    # In Python unicode: \u00C0-\u00FF followed by \u0080-\u00BF
    pattern = re.compile(r"[\u00C0-\u00FF][\u0080-\u00BF]+")
    def try_fix(m):
        s = m.group(0)
        try:
            return s.encode("latin-1").decode("utf-8")
        except Exception:
            return s
    prev = None
    while text != prev:
        prev = text
        text = pattern.sub(try_fix, text)
    return text

for path in [
    r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx",
    r"D:\CODEEEEE\ZZZ\apps\web\src\auth\OAuthCallback.tsx",
]:
    p = pathlib.Path(path)
    text = p.read_text(encoding="utf-8")
    fixed = fix_mojibake_mixed(text)
    p.write_text(fixed, encoding="utf-8")
    # Count remaining suspicious sequences
    remaining = re.findall(r"[\u00C0-\u00FF][\u0080-\u00BF]+", fixed)
    print(f"{path}: {len(remaining)} remaining")
    for s in remaining[:3]:
        print(f"  {repr(s)}")
