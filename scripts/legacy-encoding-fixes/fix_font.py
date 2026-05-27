import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
text = p.read_text(encoding="utf-8")
old = '  .prose-block {\n    color: #362820;\n    font-family: Georgia, "Times New Roman", serif;\n    font-size: 18px;\n    line-height: 1.85;\n  }'
new = '  .prose-block {\n    color: #362820;\n    font-family: "Inter", "Segoe UI", sans-serif;\n    font-size: 17px;\n    line-height: 1.9;\n  }'
if old in text:
    text = text.replace(old, new)
    print("font patched")
else:
    print("not found")
    idx = text.find(".prose-block {")
    print(repr(text[idx:idx+150]))
p.write_text(text, encoding="utf-8")
