import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\auth\OAuthCallback.tsx")
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
print("done")
