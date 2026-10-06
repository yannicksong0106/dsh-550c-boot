"""把可疑横带的原始像素打出来：只有拿到数值才能判断那到底是什么图案。"""
import sys
from PIL import Image

path = sys.argv[1] if len(sys.argv) > 1 else r"F:\项目\dsh-start\dev\overwrite-console\shots\t12400.png"
img = Image.open(path).convert("L")
w, h = img.size
print(f"{path}\n尺寸 {w}x{h}")

# 找 70..110 行里最亮的那一行
best = None
for y in range(60, 120):
    row = [img.getpixel((x, y)) for x in range(0, w)]
    avg = sum(row) / len(row)
    if best is None or avg > best[1]:
        best = (y, avg)
print(f"最亮的一行是 y={best[0]}（平均亮度 {best[1]:.2f}）")

y = best[0]
for yy in range(max(0, y - 3), min(h, y + 4)):
    row = [img.getpixel((x, yy)) for x in range(0, 120)]
    print(f"  y={yy:4d}  " + " ".join(f"{v:3d}" for v in row))

# 每隔 20 像素取一次，看它横向延伸多远
print("\n同一行 x=0..1440 每 20px 采样：")
row = [img.getpixel((x, y)) for x in range(0, w)]
print("  " + " ".join(f"{row[x]:3d}" for x in range(0, w, 20)))
bright = [x for x in range(w) if row[x] > 40]
print(f"  亮度>40 的像素范围：x {min(bright)} .. {max(bright)}（共 {len(bright)} 个）" if bright else "  整行都很暗")

# 垂直方向看这条带的厚度
print("\n同一列 x=30 的 y=70..115：")
col = [img.getpixel((30, yy)) for yy in range(70, 115)]
print("  " + " ".join(f"{v:3d}" for v in col))
