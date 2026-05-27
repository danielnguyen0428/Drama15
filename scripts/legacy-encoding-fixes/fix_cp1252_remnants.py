import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")
repl = {
    "á»›": "ớ",
    "á»™": "ộ",
    "á»‰": "ỉ",
    "á»‡": "ệ",
    "á»‘": "ố",
    "á»": "ờ",
    "á»“": "ồ",
    "á»•": "ổ",
    "á»Ÿ": "ở",
    "á»‹": "ị",
    "á»©": "ứ",
    "á»­": "ử",
    "á»¯": "ữ",
    "á»±": "ự",
}
for old,new in repl.items():
    if old in text:
        print("replace", repr(old), "->", new, text.count(old))
        text = text.replace(old,new)
p.write_text(text, encoding="utf-8")
# Verify no common remnants
for bad in repl:
    if bad in text:
        print("STILL", repr(bad), text.count(bad))
for line in text.splitlines():
    if any(bad in line for bad in repl) or "Ä" in line or "g?n" in line or "M?" in line:
        print("BADLINE", repr(line))
