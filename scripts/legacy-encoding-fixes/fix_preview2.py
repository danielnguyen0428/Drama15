import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# Patch overview
old1 = "        if (event.stage === 'overview' && event.concept) {\n          setResult((current) => ({ ...current, concept: event.concept }));\n          setProgress(12);\n          setProgressLabel('\u0110\u00e3 d\u1ef1ng t\u1ed5ng quan');\n        }"
new1 = "        if (event.stage === 'overview' && event.concept) {\n          setResult((current) => ({ ...current, concept: event.concept }));\n          setPreviewContent({ stage: 'overview', text: event.concept ?? '' });\n          setProgress(12);\n          setProgressLabel('\u0110\u00e3 d\u1ef1ng t\u1ed5ng quan');\n        }"
if old1 in text:
    text = text.replace(old1, new1)
    print("overview patched")
else:
    print("overview NOT FOUND")

# Patch bible - find the bible block
old2 = "        if (event.stage === 'bible') {\n          setProgress(18);\n          setProgressLabel('\u0110\u00e3 d\u1ef1ng story bible');"
new2 = "        if (event.stage === 'bible') {\n          if (event.content) setPreviewContent({ stage: 'bible', text: event.content });\n          setProgress(18);\n          setProgressLabel('\u0110\u00e3 d\u1ef1ng story bible');"
if old2 in text:
    text = text.replace(old2, new2)
    print("bible patched")
else:
    print("bible NOT FOUND - trying alt")
    idx = text.find("event.stage === 'bible'")
    print(repr(text[idx:idx+300]))

# Patch plan
old3 = "        if (event.stage === 'plan' && event.plan) {\n          setResult((current) => ({ ...current, plan: event.plan }));\n          setProgress(22);\n          setProgressLabel('\u0110\u00e3 kh\u00f3a beat sheet');\n        }"
new3 = "        if (event.stage === 'plan' && event.plan) {\n          setResult((current) => ({ ...current, plan: event.plan }));\n          setPreviewContent({ stage: 'plan', text: event.plan ?? '' });\n          setProgress(22);\n          setProgressLabel('\u0110\u00e3 kh\u00f3a beat sheet');\n        }"
if old3 in text:
    text = text.replace(old3, new3)
    print("plan patched")
else:
    print("plan NOT FOUND")
    idx = text.find("event.stage === 'plan'")
    print(repr(text[idx:idx+200]))

p.write_text(text, encoding="utf-8")
print("done")
