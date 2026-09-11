"""
Builds the ship map's animation strips from the source sheets in the repo root.

- `Spaceship thrusters.png` (a 3x2 sheet of a three-nozzle engine block firing) becomes
  apps/web/static/thruster-flame.png: six frames of one jet, with the sheet's own nozzle
  hardware removed so the flame can sit behind the nozzles drawn on the ship art.
- `Spaceship reactor.png` (a 3x2 sheet of the whole Reactor room, its core pulsing) becomes
  apps/web/static/reactor-core.png: only the glowing glass of the core, with blended frames
  in between so the pulse is smooth. The rest of the room is redrawn slightly differently in
  every frame and would wobble, so the art keeps its own.

Run it again after swapping any of these images, then check `thrusters` and `reactor` in
apps/web/src/lib/shipMap.config.ts.

    python tools/ship_sprites.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / 'apps' / 'web' / 'static'

# One flame frame: the flame from its tip to the nozzle exit, and about 1.3 nozzles tall
# so the glow is not cut off. Keep in step with `frameAspect` and `span` in the config.
FLAME_W, FLAME_H = 282, 142
FLAME_FEATHER = 0.22  # share of the frame height faded out at the top and at the bottom

REACTOR_BLEND = 3  # frames per source frame: the frame itself, then blends toward the next
GLASS_FEATHER = 0.1  # share of the glass faded out at each edge, so it melts into the art


def runs(v, minlen):
    """[start, end] of every run of True in v that is at least minlen long."""
    out, start = [], None
    for k, on in enumerate(list(v) + [False]):
        if on and start is None:
            start = k
        elif not on and start is not None:
            if k - start >= minlen:
                out.append((start, k - 1))
            start = None
    return out


def load(path):
    return np.asarray(Image.open(path).convert('RGBA')).astype(float)


def save(frames, path):
    strip = np.concatenate(frames, axis=1).clip(0, 255).astype(np.uint8)
    Image.fromarray(strip).save(path, optimize=True)
    h, w = frames[0].shape[:2]
    print('%d frames of %dx%d -> %s' % (len(frames), w, h, path.relative_to(ROOT)))


def cells(sheet):
    """Every frame on a 3x2 sheet as (top, bottom, left, right), row by row."""
    lit = (sheet[:, :, 3] > 8) & (sheet[:, :, :3].max(axis=2) > 12)
    out = []
    for r0, r1 in runs(lit.any(axis=1), 40):
        for c0, c1 in runs(lit[r0:r1 + 1].any(axis=0), 40):
            out.append((r0, r1, c0, c1))
    assert len(out) == 6, 'expected a 3x2 sheet, found %d frames' % len(out)
    return out


def ease(n, size):
    """1 in the middle, easing to 0 over n samples at each end."""
    ramp = np.ones(size)
    t = np.linspace(0, 1, n)
    ramp[:n] = t * t * (3 - 2 * t)
    ramp[-n:] = ramp[:n][::-1]
    return ramp


def thrusters():
    sheet = load(ROOT / 'Spaceship thrusters.png')
    rgb = sheet[:, :, :3]
    # Nozzle hardware is opaque grey; the flame is translucent or strongly blue-white.
    hardware = (sheet[:, :, 3] > 200) & (rgb.max(axis=2) - rgb.min(axis=2) < 60) & (rgb.max(axis=2) < 200)
    ramp = ease(int(FLAME_H * FLAME_FEATHER), FLAME_H)

    frames = []
    for r0, r1, c0, c1 in cells(sheet):
        cell = sheet[r0:r1 + 1, c0:c1 + 1].copy()
        hw = hardware[r0:r1 + 1, c0:c1 + 1]
        rows = runs(hw.mean(axis=1) > 0.08, 20)
        top, bottom = rows[0][0], rows[-1][1]
        exit_x = int(np.where(hw[top:bottom + 1].mean(axis=0) > 0.3)[0].min())

        # The middle jet: the brightest row just outside the nozzles, in the middle third.
        # Centring on it per frame stops the flame jumping up and down between frames.
        band = cell[:, exit_x - 14:exit_x - 4]
        glow = (band[:, :, :3].mean(axis=2) * band[:, :, 3]).mean(axis=1)
        third = (bottom - top) // 3
        mid = top + third + int(np.argmax(glow[top + third:bottom - third]))

        cell[hw, 3] = 0
        x0, y0 = exit_x + 2 - FLAME_W, mid - FLAME_H // 2
        src = cell[y0:y0 + FLAME_H, max(0, x0):exit_x + 2]
        frame = np.zeros((FLAME_H, FLAME_W, 4))
        frame[:src.shape[0], max(0, -x0):max(0, -x0) + src.shape[1]] = src
        frame[:, :, 3] *= ramp[:, None]
        frames.append(frame)

    save(frames, STATIC / 'thruster-flame.png')


def glass_box(img, x0, x1, y0, y1):
    """The core's glass inside a search window: the widest run of glowing orange columns,
    then the tallest run of glowing rows across them. Returns (left, top, right, bottom)."""
    orange = (img[:, :, 0] - img[:, :, 2]).clip(0) * img[:, :, 3] / 255
    win = orange[y0:y1, x0:x1]
    cols = win.mean(axis=0)
    left, right = max(runs(cols > 0.5 * cols.max(), 5), key=lambda run: run[1] - run[0])
    rows = win[:, left:right + 1].mean(axis=1)
    top, bottom = max(runs(rows > 0.5 * rows.max(), 5), key=lambda run: run[1] - run[0])
    return x0 + left, y0 + top, x0 + right, y0 + bottom


def lum(img):
    return (img[:, :, :3] @ np.array([0.299, 0.587, 0.114])) * (img[:, :, 3] / 255)


def reactor():
    sheet = load(ROOT / 'Spaceship reactor.png')
    src = [sheet[r0:r1 + 1, c0:c1 + 1] for r0, r1, c0, c1 in cells(sheet)]
    h, w = min(f.shape[0] for f in src), min(f.shape[1] for f in src)
    src = [f[:h, :w] for f in src]

    # Find the glass on the dimmest frame, where no glow spills past its edges.
    orange = [((f[:, :, 0] - f[:, :, 2]).clip(0) * f[:, :, 3])[100:300, 185:315].sum() for f in src]
    ref = int(np.argmin(orange))
    gl, gt, gr, gb = glass_box(src[ref], 185, 315, 100, 300)
    gw, gh = gr - gl + 1, gb - gt + 1
    ramp = ease(int(gh * GLASS_FEATHER), gh)[:, None] * ease(int(gw * GLASS_FEATHER), gw)[None, :]

    # Line every frame up with that one on the tube's cap and base ring, leaving the glass
    # out: the frames are drawn a few pixels apart, and the glass would jitter otherwise.
    ring = np.zeros((h, w), bool)
    ring[gt - 24:gb + 25, gl - 24:gr + 25] = True
    ring[gt:gb + 1, gl:gr + 1] = False
    base = lum(src[ref])
    crops, offsets = [], []
    for f in src:
        L = lum(f)
        _, dy, dx = min(
            (np.abs(np.roll(L, (-dy, -dx), axis=(0, 1)) - base)[ring].mean(), dy, dx)
            for dy in range(-6, 7)
            for dx in range(-6, 7)
        )
        crop = f[gt + dy:gb + dy + 1, gl + dx:gr + dx + 1].copy()
        crop[:, :, 3] *= ramp
        crops.append(crop)
        offsets.append((dx, dy))
    print('  glass in frame %d: x %d-%d, y %d-%d; frames offset by %s' % (ref, gl, gr, gt, gb, offsets))

    frames = []
    for i, a in enumerate(crops):
        b = crops[(i + 1) % len(crops)]
        frames += [a + (b - a) * k / REACTOR_BLEND for k in range(REACTOR_BLEND)]
    save(frames, STATIC / 'reactor-core.png')

    ship = load(STATIC / 'ship-map.png')
    l, t, r, b = glass_box(ship, 315, 430, 150, 320)
    H, W = ship.shape[:2]
    print('  glass in the art: { x: %.2f, y: %.2f, w: %.2f, h: %.2f }  (px x %d-%d, y %d-%d)' % (
        l / W * 100, t / H * 100, (r - l + 1) / W * 100, (b - t + 1) / H * 100, l, r, t, b))


if __name__ == '__main__':
    thrusters()
    reactor()
