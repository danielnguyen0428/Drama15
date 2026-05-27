import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")
# Check around pos 4513
snippet = text[4510:4530]
print(repr(snippet))
print([hex(ord(c)) for c in snippet])
# The sequence is m + 0xe1 + 0xbb + 0x9b + i
# 0xe1 0xbb 0x9b in UTF-8 = U+1EDB = o with horn and acute
# But we see it as separate chars: chr(0xe1)=a-acute, chr(0xbb)=right-guillemet, chr(0x9b)=control
# Actually in the Python string these ARE the unicode codepoints
# chr(0xe1) = a with acute, chr(0xbb) = right guillemet, chr(0x9b) = CSI control
# When encoded as latin-1: bytes e1 bb 9b -> which is UTF-8 for U+1EDB
print("Test:", bytes([0xe1, 0xbb, 0x9b]).decode("utf-8"))
print("Test2:", bytes([0xe1, 0xbb, 0x99]).decode("utf-8"))
