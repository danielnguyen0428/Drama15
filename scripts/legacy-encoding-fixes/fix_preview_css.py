import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
text = p.read_text(encoding="utf-8")
media_idx = text.find("@media (prefers-reduced-motion")
css = """
  .gen-preview {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid rgba(72, 43, 24, 0.12);
  }

  .gen-preview .prose-block {
    margin-top: 12px;
    max-height: 320px;
    overflow-y: auto;
    font-size: 14px;
    line-height: 1.7;
  }

"""
text = text[:media_idx] + css + text[media_idx:]
p.write_text(text, encoding="utf-8")
print("CSS done")
