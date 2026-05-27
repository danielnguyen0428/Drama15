import pathlib, sys, re
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\formatChapterText.ts")
text = p.read_text(encoding="utf-8")

# Fix double-encoded sequences
pattern = re.compile(r"[\u00C0-\u00FF][\u0080-\u00BF]+")
def fix_chunk(m):
    s = m.group(0)
    try: return s.encode("latin-1").decode("utf-8")
    except: return s

prev = None
while text != prev:
    prev = text
    text = pattern.sub(fix_chunk, text)

# Fix cp1252 remnants
repl = {
    "\u00e1\u00bb\u203a": "\u1edb",
    "\u00e1\u00bb\u2122": "\u1ed9",
    "\u00e1\u00bb\u2030": "\u1ec9",
    "\u00e1\u00bb\u2021": "\u1ec7",
    "\u00e1\u00bb\u2018": "\u1ed1",
    "\u00e1\u00bb\u009d": "\u1edd",
    "\u00e1\u00bb\u201c": "\u1ed3",
    "\u00e1\u00bb\u2022": "\u1ed5",
    "\u00e1\u00bb\u0178": "\u1edf",
    "\u00e1\u00bb\u2039": "\u1ecb",
}
for old, new in repl.items():
    if old in text:
        text = text.replace(old, new)
        print(f"fixed {repr(old)}")

p.write_text(text, encoding="utf-8")
print("done")
