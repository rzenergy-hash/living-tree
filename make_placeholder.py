#!/usr/bin/env python3
"""Generate a placeholder tree.png (dark branches on light paper) with stdlib only.
Replace tree.png with your own artwork anytime — this is just a stand-in."""
import math, struct, zlib, random

W, H = 700, 1000
BG = (244, 241, 234)
INK = (40, 40, 38)
buf = bytearray()
# row-major RGB, light paper background
row_bg = bytes(BG) * W
px = [bytearray(row_bg) for _ in range(H)]

def blend(x, y, a):
    if 0 <= x < W and 0 <= y < H:
        i = x * 3
        r = px[y]
        for c in range(3):
            r[i + c] = int(r[i + c] * (1 - a) + INK[c] * a)

def stroke(x0, y0, x1, y1, w):
    steps = int(max(abs(x1 - x0), abs(y1 - y0)) + 1)
    for s in range(steps + 1):
        t = s / steps
        cx = x0 + (x1 - x0) * t
        cy = y0 + (y1 - y0) * t
        r = w / 2
        ri = int(r) + 1
        for dx in range(-ri, ri + 1):
            for dy in range(-ri, ri + 1):
                d = math.hypot(dx, dy)
                if d <= r:
                    blend(int(cx) + dx, int(cy) + dy, max(0.0, 1 - d / (r + 0.5)) * 0.9)

random.seed(7)
def branch(x, y, ang, length, width, depth):
    if depth == 0 or length < 6:
        return
    x2 = x + math.cos(ang) * length
    y2 = y + math.sin(ang) * length
    stroke(x, y, x2, y2, width)
    n = 2 if depth > 2 else random.choice([2, 3])
    for _ in range(n):
        branch(x2, y2, ang + random.uniform(-0.7, 0.7),
               length * random.uniform(0.62, 0.8),
               max(1, width * 0.7), depth - 1)

# trunk + canopy
branch(W * 0.5, H * 0.95, -math.pi / 2 + 0.05, 150, 26, 9)
# a couple of roots
stroke(W*0.5, H*0.95, W*0.36, H*0.99, 14)
stroke(W*0.5, H*0.95, W*0.64, H*0.985, 14)

# encode PNG
raw = bytearray()
for y in range(H):
    raw.append(0)            # filter type 0
    raw.extend(px[y])
def chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    return c + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
png += chunk(b"IEND", b"")
open("tree.png", "wb").write(png)
print("wrote tree.png", W, "x", H)
