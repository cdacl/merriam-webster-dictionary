#!/usr/bin/env python3
"""生成插件图标：Merriam-Webster 的红圈 M-W 徽标。

用法：python3 build/gen_icon.py
输出：插件根目录的 icon.png（256x256，带透明背景）
"""

import os

from PIL import Image, ImageDraw, ImageFont

SIZE = 256
SCALE = 4                      # 先按 4 倍画，再缩放，边缘更干净
CANVAS = SIZE * SCALE

RED = (215, 25, 32, 255)       # Merriam-Webster「notch red」
NAVY = (19, 38, 49, 255)       # 「big stone」
WHITE = (255, 255, 255, 255)

GEN_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(GEN_DIR)
OUTPUT = os.path.join(ROOT, "icon.png")

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
    "/Library/Fonts/Georgia Bold.ttf",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_icon():
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    margin = int(CANVAS * 0.05)
    ring_width = int(CANVAS * 0.075)
    outer = [margin, margin, CANVAS - margin - 1, CANVAS - margin - 1]

    # 白色圆底 + 红色圆环
    draw.ellipse(outer, fill=WHITE)
    draw.ellipse(outer, outline=RED, width=ring_width)

    # 中间的字：M-W（先按目标宽度定字号，再按字体度量居中）
    text = "M-W"
    circle = CANVAS - 2 * margin
    target_width = circle * 0.62
    probe = load_font(200)
    probe_width = draw.textbbox((0, 0), text, font=probe)[2]
    font = load_font(max(10, int(200 * target_width / probe_width)))
    draw.text((CANVAS / 2, CANVAS / 2), text, font=font, fill=NAVY, anchor="mm")

    return image.resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == "__main__":
    icon = draw_icon()
    icon.save(OUTPUT)
    print("已生成 {0}（{1}x{2}）".format(OUTPUT, SIZE, SIZE))
