import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p=pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
text=p.read_text(encoding="utf-8")
media_idx=text.find("@media (prefers-reduced-motion")
css="""
  .stream-chapter-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(72, 43, 24, 0.1);
  }

  .stream-chapter-list button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 12px;
    border: 1px solid rgba(72, 43, 24, 0.18);
    border-radius: 14px;
    background: rgba(96, 53, 28, 0.04);
    cursor: pointer;
    transition: all 160ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .stream-chapter-list button:hover {
    border-color: rgba(184, 110, 42, 0.4);
    background: rgba(184, 110, 42, 0.08);
  }

  .stream-chapter-list button.active {
    border-color: #b86e2a;
    background: rgba(184, 110, 42, 0.12);
  }

  .stream-chapter-list button span {
    color: #3d2010;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  .stream-chapter-list button small {
    color: rgba(54, 40, 32, 0.55);
    font-size: 11px;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stream-chapter-list button.active span {
    color: #b86e2a;
  }

"""
text=text[:media_idx]+css+text[media_idx:]
p.write_text(text,encoding="utf-8")
print("done")
