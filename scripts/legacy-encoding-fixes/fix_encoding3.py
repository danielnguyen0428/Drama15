import pathlib, re, sys
sys.stdout.reconfigure(encoding="utf-8")

def fix_file(path):
    p = pathlib.Path(path)
    text = p.read_text(encoding="utf-8")
    # Broader pattern: catch sequences like a-with-accent followed by right-single-quote or similar
    # These are remnants of 3-byte UTF-8 chars double-encoded
    # Pattern: any char 0x80-0xFF (latin extended) followed by one or more chars in 0x80-0xBF range
    # But also catch 2-char sequences like \xc3\xa1 that became a-tilde + another char
    # Better approach: try to encode each line as latin-1 and decode as utf-8
    lines = text.split("\n")
    fixed_lines = []
    for line in lines:
        try:
            fixed = line.encode("latin-1").decode("utf-8")
            fixed_lines.append(fixed)
        except (UnicodeEncodeError, UnicodeDecodeError):
            # Line has mix of correct and broken chars - fix char by char groups
            fixed_lines.append(line)
    result = "\n".join(fixed_lines)
    p.write_text(result, encoding="utf-8")
    remaining = sum(1 for c in result if 0xC0 <= ord(c) <= 0xFF)
    print(f"{path}: remaining high-latin chars: {remaining}")
    return result

fix_file(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
fix_file(r"D:\CODEEEEE\ZZZ\apps\web\src\auth\OAuthCallback.tsx")
