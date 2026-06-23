with open("c:\\Users\\Paulo H Parreira\\.gemini\\antigravity\\scratch\\platform\\modules\\dispatch\\app.js", "r", encoding="utf-8") as f:
    for idx, line in enumerate(f):
        if "loadAll" in line:
            print(f"{idx+1}: {line.strip()}")
