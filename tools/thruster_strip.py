"""
Cuts the engine flame out of `Spaceship thrusters.png` (a 3x2 sheet of a three-nozzle
engine block firing) into apps/web/static/thruster-flame.png: six frames of one jet side
by side, with the sheet's own nozzle hardware removed so the flame can sit behind the
nozzles already drawn on the ship art. Run it again after swapping either image, then
check `thrusters` in apps/web/src/lib/shipMap.config.ts.

    python tools/thruster_strip.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / 'Spaceship thrusters.png'
OUT = ROOT / 'apps' / 'web' / 'static' / 'thruster-flame.png'

# One output frame: the flame from its tip to the nozzle exit, and about 1.3 nozzles tall
# so the glow is not cut off. Keep in step with `frameAspect` and `span` in the config.
FRAME_W, FRAME_H = 282, 142
FEATHER = 0.22  # share of the frame height faded out at the top and at the bottom


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


def main():
    sheet = np.asarray(Image.open(SHEET).convert('RGBA')).astype(float)
    alpha = sheet[:, :, 3]
    rgb = sheet[:, :, :3]
    lit = (alpha > 8) & (rgb.max(axis=2) > 12)
    # Nozzle hardware is opaque grey; the flame is translucent or strongly blue-white.
    hardware = (alpha > 200) & (rgb.max(axis=2) - rgb.min(axis=2) < 60) & (rgb.max(axis=2) < 200)

    n = int(FRAME_H * FEATHER)
    t = np.linspace(0, 1, n)
    ramp = np.ones(FRAME_H)
    ramp[:n] = t * t * (3 - 2 * t)
    ramp[-n:] = ramp[:n][::-1]

    frames = []
    for r0, r1 in runs(lit.any(axis=1), 40):
        for c0, c1 in runs(lit[r0:r1 + 1].any(axis=0), 40):
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
            x0, y0 = exit_x + 2 - FRAME_W, mid - FRAME_H // 2
            src = cell[y0:y0 + FRAME_H, max(0, x0):exit_x + 2]
            frame = np.zeros((FRAME_H, FRAME_W, 4))
            frame[:src.shape[0], max(0, -x0):max(0, -x0) + src.shape[1]] = src
            frame[:, :, 3] *= ramp[:, None]
            frames.append(frame)

    assert len(frames) == 6, 'expected a 3x2 sheet, found %d frames' % len(frames)
    strip = np.concatenate(frames, axis=1).clip(0, 255).astype(np.uint8)
    Image.fromarray(strip).save(OUT, optimize=True)
    print('%d frames of %dx%d -> %s' % (len(frames), FRAME_W, FRAME_H, OUT.relative_to(ROOT)))


if __name__ == '__main__':
    main()
