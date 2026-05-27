import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")
# Fix remaining: Ban thao ma moi
text = text.replace("B\u1ea3n th\u1ea3o m\u00e1\u00bb\u009bi", "B\u1ea3n th\u1ea3o m\u1edbi")
text = text.replace("m\u00e1\u00bb\u009bi", "m\u1edbi")
p.write_text(text, encoding="utf-8")
print("m\u1edbi" in text)
