"""E2E テスト用のフィクスチャ（画像・動画）を生成する。

使い方: npm run fixtures  （Pillow と ffmpeg が必要）
生成物は e2e/fixtures/ にコミットする。テストケースとの対応は docs/TEST_CASES.md を参照。
"""
import pathlib
import subprocess
import tempfile

from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / "e2e" / "fixtures"
W, H = 480, 320


def gradient(top, bottom):
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))
    return img


def ocean():
    # 空と海の青。下部に少しだけ砂浜
    img = gradient((90, 170, 235), (10, 90, 180))
    ImageDraw.Draw(img).rectangle([0, int(H * 0.85), W, H], fill=(225, 205, 160))
    return img


def forest():
    img = gradient((60, 140, 60), (20, 80, 30))
    d = ImageDraw.Draw(img)
    for x in range(0, W, 40):
        d.rectangle([x + 15, 0, x + 22, H], fill=(70, 50, 30))
    return img


def night():
    img = Image.new("RGB", (W, H), (8, 8, 20))
    d = ImageDraw.Draw(img)
    for i, color in enumerate([(255, 40, 160), (40, 220, 255), (255, 220, 40)]):
        d.rectangle([60 + i * 140, 120, 120 + i * 140, 150], fill=color)
    return img


def sunset():
    return gradient((250, 150, 60), (200, 60, 40))


def gray():
    return Image.new("RGB", (W, H), (128, 128, 128))


def video(path, frames_fn, seconds=3, fps=10):
    with tempfile.TemporaryDirectory() as tmp:
        for i in range(seconds * fps):
            frames_fn(i / (seconds * fps)).save(f"{tmp}/f{i:03d}.png")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", f"{tmp}/f%03d.png",
             "-c:v", "libvpx", "-b:v", "500k", "-pix_fmt", "yuv420p", str(path)],
            check=True,
        )


def drifting_ocean(t):
    # 波が上下に揺れる海の動画
    img = ocean()
    y = int(H * 0.6 + 20 * (t - 0.5))
    ImageDraw.Draw(img).rectangle([0, y, W, y + 6], fill=(240, 250, 255))
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ocean().save(OUT / "ocean.png")
    forest().save(OUT / "forest.jpg", quality=92)
    night().save(OUT / "night.png")
    sunset().save(OUT / "sunset.webp")
    gray().save(OUT / "gray.png")
    video(OUT / "ocean.webm", drifting_ocean)
    (OUT / "not-media.txt").write_text("this is not an image\n", encoding="utf-8")
    print(f"fixtures written to {OUT}")


if __name__ == "__main__":
    main()
