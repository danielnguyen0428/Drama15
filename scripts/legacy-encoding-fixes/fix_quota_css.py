import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p=pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
text=p.read_text(encoding='utf-8')
media_idx=text.find('@media (prefers-reduced-motion')
css='''
  .quota-pill {
    margin: 0 22px 14px;
    padding: 8px 12px;
    border: 1px solid rgba(244, 210, 158, 0.18);
    border-radius: 999px;
    color: rgba(249, 242, 233, 0.68);
    background: rgba(244, 210, 158, 0.06);
    font-size: 12px;
    font-weight: 800;
    text-align: center;
  }

'''
text=text[:media_idx]+css+text[media_idx:]
p.write_text(text,encoding='utf-8')
print('quota css added')
