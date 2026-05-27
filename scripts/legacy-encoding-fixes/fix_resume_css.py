import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
text = p.read_text(encoding="utf-8")
media_idx = text.find("@media (prefers-reduced-motion")
css = """
  .resume-card {
    display: grid;
    gap: 8px;
    margin-top: 16px;
    padding: 16px;
    border: 1px solid rgba(184, 110, 42, 0.24);
    border-radius: 18px;
    background: rgba(184, 110, 42, 0.06);
  }

  .resume-card strong {
    color: #3d2010;
    font-size: 14px;
  }

  .resume-card span {
    color: rgba(54, 40, 32, 0.6);
    font-size: 12px;
  }

  .resume-card .primary-button {
    margin-top: 4px;
    width: auto;
    justify-self: start;
  }

"""
text = text[:media_idx] + css + text[media_idx:]
p.write_text(text, encoding="utf-8")
print("done")
