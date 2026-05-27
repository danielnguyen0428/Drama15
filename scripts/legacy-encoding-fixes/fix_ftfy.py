import pathlib, sys, ftfy
sys.stdout.reconfigure(encoding="utf-8")

for path in [
    r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx",
    r"D:\CODEEEEE\ZZZ\apps\web\src\auth\OAuthCallback.tsx",
]:
    p = pathlib.Path(path)
    text = p.read_text(encoding="utf-8")
    fixed = ftfy.fix_text(text)
    p.write_text(fixed, encoding="utf-8")
    print(f"Fixed: {path}")
