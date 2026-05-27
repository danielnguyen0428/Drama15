import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# Targeted replacements for remaining mojibake
replacements = [
    # Ä' -> d with stroke (U+0111)
    ("Ä'\u1eb7t t\u00ean", "\u0111\u1eb7t t\u00ean"),  # dat ten
    ("Ä'o\u1ea1n", "\u0111o\u1ea1n"),  # doan
    ("Ä'\u1ee9ng", "\u0111\u1ee9ng"),  # dung
    ("Ä'\u00f4 n\u00e1ch", "\u0111\u00f4 n\u00e1ch"),
    # ma moi
    ("B\u1ea3n th\u1ea3o m\u00e1\u00bb\u009bi", "B\u1ea3n th\u1ea3o m\u1edbi"),
    # Thu gon / Mo
    ('"Thu g?n" : "M?"', '"Thu g\u1ecdn" : "M\u1edf"'),
    # Remaining Ä sequences
    ("Ä'", "\u0111"),
    ("Ä\u0090", "\u0110"),
]

for old, new in replacements:
    if old in text:
        text = text.replace(old, new)
        print(f"Replaced: {repr(old)} -> {repr(new)}")

# Also fix ma moi pattern: ma + 0x9b (leftover)
import re
# Fix remaining Ä sequences that are still latin1 encoded d-stroke
text = re.sub(r"\u00c4[\u0080-\u009f]", lambda m: m.group(0).encode("latin-1").decode("utf-8", errors="replace"), text)

p.write_text(text, encoding="utf-8")
print("Done")

# Verify
for term in ["\u0111\u1eb7t t\u00ean", "m\u1edbi", "Thu g\u1ecdn", "M\u1edf"]:
    print(f"  {term}: {term in text}")

# Show remaining issues
for line in text.splitlines():
    if "\u00c4" in line or "g?n" in line or "M?" in line:
        print("STILL BAD:", repr(line[:100]))
