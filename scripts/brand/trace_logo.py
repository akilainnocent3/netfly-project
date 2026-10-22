"""Trace the NETFLY mark from the reference artwork into SVG geometry.

    python scripts/brand/trace_logo.py   # needs: pillow numpy scipy scikit-image

Reads docs/brand/netfly-intro-kit/netfly-logo-4096.png (red ribbon on black) and writes
packages/ui/src/logo-geometry.json, the single source for <LogoMark>, <LogoLoader> and the app
icons (scripts/brand/brand-icons.mjs). Nothing is eyeballed:

* the outer silhouette and the hole are rotated rounded rectangles fitted to the red mask (IoU);
* the fold boundaries are the sharp shade edges inside the band, fitted with cubic Béziers
  (≤ ~2 px at 4096 px) and, for the bottom-right fold's end, a circle;
* the fold shadows are black overlays whose opacity is least-squares fitted to the artwork's
  darkening (top-left: one linear ramp; bottom-right: linear + radial, composited like SVG).

Geometry is expressed in a frame rotated 45° about the silhouette's centre ("u" points down-right,
"v" down-left), so the SVG is `translate(50 50) rotate(45)` around axis-aligned shapes.
scripts/brand/verify-logo.mjs renders the result in Chromium and reports IoU against the mask.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage, optimize
from skimage import measure

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs/brand/netfly-intro-kit/netfly-logo-4096.png"
OUT = ROOT / "packages/ui/src/logo-geometry.json"
ANGLE = np.pi / 4
UNIT = 25.6  # reference pixels per viewBox unit: the 100-unit viewBox spans 2560 px


def rounded_rect_sdf(x, y, cx, cy, hw, hh, r):
    c, s = np.cos(ANGLE), np.sin(ANGLE)
    dx, dy = x - cx, y - cy
    u, v = c * dx + s * dy, -s * dx + c * dy
    qx, qy = np.abs(u) - hw + r, np.abs(v) - hh + r
    outside = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0))
    return outside + np.minimum(np.maximum(qx, qy), 0) - r


def fit_rounded_rect(target, p0, step=4):
    """Fit (cx, cy, hw, hh, r) to a coverage mask; returns params and IoU."""
    n = target.shape[0] // step
    cover = target.reshape(n, step, n, step).mean(axis=(1, 3))
    ys, xs = (np.mgrid[0:n, 0:n] + 0.5) * step

    def coverage(p):
        cx, cy, hw, hh, r = p
        return np.clip(0.5 - rounded_rect_sdf(xs, ys, cx, cy, hw, hh, abs(r)) / step, 0, 1)

    res = optimize.minimize(
        lambda p: np.abs(coverage(p) - cover).sum(),
        p0,
        method="Powell",
        options={"maxiter": 20000, "xtol": 1e-3, "ftol": 1e-8},
    )
    p = res.x
    p[4] = abs(p[4])
    m, t = coverage(p) > 0.5, cover > 0.5
    return p, (m & t).sum() / (m | t).sum()


def to_uv(x, y, centre):
    dx, dy = x - centre[0], y - centre[1]
    c, s = np.cos(ANGLE), np.sin(ANGLE)
    return c * dx + s * dy, -s * dx + c * dy


def bezier_fit(points):
    """One cubic through the ends of `points` (tangents from the ends), least squares."""
    p0, p3 = points[0], points[-1]
    t0 = points[min(25, len(points) - 1)] - p0
    t1 = points[-26] - p3
    t0, t1 = t0 / np.hypot(*t0), t1 / np.hypot(*t1)
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(points, axis=0).T))]
    t = d / d[-1]
    samples = np.linspace(0, 1, 2000)
    for _ in range(30):
        b0, b1, b2, b3 = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t**2, t**3
        a1, a2 = b1[:, None] * t0, b2[:, None] * t1
        rhs = points - (b0 + b1)[:, None] * p0 - (b2 + b3)[:, None] * p3
        m = np.array([[(a1 * a1).sum(), (a1 * a2).sum()], [(a1 * a2).sum(), (a2 * a2).sum()]])
        alpha = np.linalg.solve(m, [(a1 * rhs).sum(), (a2 * rhs).sum()])
        ctrl = np.array([p0, p0 + alpha[0] * t0, p3 + alpha[1] * t1, p3])
        s = samples[:, None]
        curve = (
            (1 - s) ** 3 * ctrl[0]
            + 3 * (1 - s) ** 2 * s * ctrl[1]
            + 3 * (1 - s) * s**2 * ctrl[2]
            + s**3 * ctrl[3]
        )
        nearest = np.argmin(((points[:, None, :] - curve[None]) ** 2).sum(-1), axis=1)
        t = samples[nearest]
        err = np.sqrt(((points - curve[nearest]) ** 2).sum(-1)).max()
    return ctrl, err


def fmt(*values):
    return " ".join(f"{v / UNIT:.2f}".rstrip("0").rstrip(".") for v in values)


def rect_path(cx, cy, hw, hh, r):
    x0, x1, y0, y1 = cx - hw, cx + hw, cy - hh, cy + hh
    a = f"A{fmt(r, r)} 0 0 1"
    return (
        f"M{fmt(x0 + r, y0)}H{fmt(x1 - r)}{a} {fmt(x1, y0 + r)}V{fmt(y1 - r)}"
        f"{a} {fmt(x1 - r, y1)}H{fmt(x0 + r)}{a} {fmt(x0, y1 - r)}V{fmt(y0 + r)}{a} {fmt(x0 + r, y0)}Z"
    )


def main():
    rgb = np.asarray(Image.open(SOURCE).convert("RGB")).astype(float)
    red_channel = rgb[..., 0]
    red = (red_channel > 60) & (red_channel > rgb[..., 1] * 2)
    filled = ndimage.binary_fill_holes(red)
    hole = filled & ~red
    size = red.shape[0]

    # 1. Silhouette and hole.
    outer, outer_iou = fit_rounded_rect(filled, [size / 2, size / 2, size / 4, size / 4, size / 9])
    inner, inner_iou = fit_rounded_rect(hole, [size / 2, size / 2, size / 9, size / 9, size / 200])
    centre = outer[:2]
    hole_u, hole_v = to_uv(inner[0], inner[1], centre)
    print(f"silhouette IoU {outer_iou:.5f}  hole IoU {inner_iou:.5f}")

    # 2. Fold regions: the artwork darkens the band towards black under each fold.
    flat = np.median(red_channel[red])
    shade = np.where(red, 1 - red_channel / flat, 0)
    folds = ndimage.binary_opening((shade > 0.03) & red, iterations=3)
    labels, count = ndimage.label(folds)
    sizes = ndimage.sum(folds, labels, range(1, count + 1))
    regions = [labels == (i + 1) for i in np.argsort(sizes)[-2:]]
    ys, xs = np.mgrid[0:size, 0:size]
    U, V = to_uv(xs, ys, centre)
    regions.sort(key=lambda m: U[m].mean())  # top-left (u < 0) first

    def free_boundary(mask):
        contour = max(measure.find_contours(mask.astype(float), 0.5), key=len)
        y, x = contour[:, 0], contour[:, 1]
        keep = (np.abs(rounded_rect_sdf(x, y, *outer)) > 8) & (
            np.abs(rounded_rect_sdf(x, y, *inner)) > 8
        )
        u, v = to_uv(x[keep], y[keep], centre)
        pts = np.c_[u, v]
        jumps = np.where(np.hypot(*np.diff(pts, axis=0).T) > 15)[0]
        return np.split(pts, jumps + 1)

    hole_left, hole_right = hole_u - inner[2], hole_u + inner[2]
    hole_top, hole_bottom = hole_v - inner[3], hole_v + inner[3]

    # Top-left fold: one arc from the hole's top vertex to the outer edge; the shadow then
    # fades out along v (a linear ramp that reaches zero where the fold ends).
    tl = free_boundary(regions[0])
    tl_arc = max(tl, key=lambda s: np.ptp(s[:, 1]))
    if tl_arc[0, 0] < tl_arc[-1, 0]:
        tl_arc = tl_arc[::-1]
    ctrl_tl, err_tl = bezier_fit(tl_arc)
    m = ndimage.binary_erosion(regions[0], iterations=6)
    alpha = shade[m]
    coef, *_ = np.linalg.lstsq(np.c_[V[m], np.ones(m.sum())], alpha, rcond=None)
    fade_end = -coef[1] / coef[0]  # v where the shadow reaches zero
    tl_alpha = coef[0] * hole_top + coef[1]
    edge_u = ctrl_tl[3][0]
    tl_path = (
        f"M{fmt(*ctrl_tl[0])}C{fmt(*ctrl_tl[1])} {fmt(*ctrl_tl[2])} {fmt(*ctrl_tl[3])}"
        f"V{fmt(fade_end)}H{fmt(hole_left)}Z"
    )

    # Bottom-right fold: a straight run past the hole's right vertex, a round end cap and one
    # arc back to the hole's bottom vertex.
    br = free_boundary(regions[1])
    run_and_cap = next(s for s in br if abs(s[0, 0] - hole_right) < 20 and s[0, 1] < 0)
    run_v = np.median(run_and_cap[(run_and_cap[:, 0] > hole_right + 40), 1][:200])
    cap = run_and_cap[run_and_cap[:, 0] > run_and_cap[:, 0].max() - 150]
    cu_, cv_ = cap.T
    (ccu, ccv, k), *_ = np.linalg.lstsq(
        np.c_[2 * cu_, 2 * cv_, np.ones_like(cu_)], cu_**2 + cv_**2, rcond=None
    )
    cap_r = np.sqrt(k + ccu**2 + ccv**2)
    arc_pieces = [s for s in br if s is not run_and_cap]
    arc_pieces.sort(key=lambda s: -s[0, 0])
    br_arc = np.vstack([arc_pieces[0]] + [p[1:] for p in arc_pieces[1:]])
    ctrl_br, err_br = bezier_fit(br_arc)
    side_u = ccu + cap_r
    br_path = (
        f"M{fmt(hole_right, run_v)}H{fmt(ccu)}A{fmt(cap_r, cap_r)} 0 0 1 {fmt(side_u, ccv)}"
        f"V{fmt(ctrl_br[0][1])}C{fmt(*ctrl_br[1])} {fmt(*ctrl_br[2])} {fmt(*ctrl_br[3])}"
        f"H{fmt(hole_right)}Z"
    )
    print(f"fold arcs: max error {err_tl:.2f} px / {err_br:.2f} px; cap r {cap_r:.1f} px")

    # Bottom-right shading: linear ramp along u composited with a radial pocket (clear at its
    # centre), 1 - (1 - A)(1 - B), exactly how two stacked black overlays combine.
    m = ndimage.binary_erosion(regions[1], iterations=40)
    rows, cols = np.nonzero(m)
    pick = np.random.default_rng(0).choice(len(cols), 40000, replace=False)
    pu, pv, target = U[rows[pick], cols[pick]], V[rows[pick], cols[pick]], shade[m][pick]
    u0, u1 = pu.min(), pu.max()

    def composite(p):
        a0, a1, rcu, rcv, rr, b1, b2 = p
        lin = a0 + (a1 - a0) * (pu - u0) / (u1 - u0)
        rad = np.interp(np.hypot(pu - rcu, pv - rcv) / rr, [0, 0.5, 1], [0, b1, b2])
        return 1 - (1 - lin) * (1 - rad)

    bounds = [(0, 1), (0, 1), (hole_right, 1050), (hole_top, hole_bottom), (100, 1600), (0, 1), (0, 1)]
    best = min(
        (
            optimize.minimize(
                lambda p: ((composite(p) - target) ** 2).mean(),
                [0.1, 0.3, cu0, cv0, 600, 0.2, 0.4],
                method="Powell",
                bounds=bounds,
                options={"maxiter": 20000, "xtol": 1e-4, "ftol": 1e-10},
            )
            for cu0, cv0 in [(700, 400), (850, 150), (650, 500)]
        ),
        key=lambda r: r.fun,
    )
    a0, a1, rcu, rcv, rr, b1, b2 = best.x
    print(f"bottom-right shading rmse {np.sqrt(best.fun):.4f} (alpha)")

    # The loader's light runs along the band's centre line: halfway between silhouette and hole.
    mid = {
        "left": (-outer[2] + hole_left) / 2,
        "right": (outer[2] + hole_right) / 2,
        "top": (-outer[3] + hole_top) / 2,
        "bottom": (outer[3] + hole_bottom) / 2,
    }
    mid_r = (outer[4] + inner[4]) / 2
    centre_line = rect_path(
        (mid["left"] + mid["right"]) / 2,
        (mid["top"] + mid["bottom"]) / 2,
        (mid["right"] - mid["left"]) / 2,
        (mid["bottom"] - mid["top"]) / 2,
        mid_r,
    )
    band_width = min(mid["right"] - hole_right, hole_top - mid["top"]) * 2

    geometry = {
        "$comment": "Generated by scripts/brand/trace_logo.py from the reference artwork. Do not edit.",
        "source": str(SOURCE.relative_to(ROOT)),
        "viewBox": "0 0 100 100",
        "transform": "translate(50 50) rotate(45)",
        "reference": {
            "size": size,
            "x": round(float(centre[0] - 50 * UNIT), 2),
            "y": round(float(centre[1] - 50 * UNIT), 2),
            "scale": UNIT,
        },
        "color": "#{:02X}{:02X}{:02X}".format(*np.median(rgb[red & (shade < 0.02)], axis=0).astype(int)),
        "band": rect_path(0, 0, outer[2], outer[3], outer[4])
        + rect_path(hole_u, hole_v, inner[2], inner[3], inner[4]),
        "centerLine": centre_line,
        "bandWidth": round(float(band_width / UNIT), 2),
        "folds": [
            {
                "d": tl_path,
                "layers": [
                    {
                        "type": "linear",
                        "x1": 0,
                        "y1": float(fmt(fade_end)),
                        "x2": 0,
                        "y2": float(fmt(hole_top)),
                        "stops": [[0, 0], [1, round(float(tl_alpha), 3)]],
                    }
                ],
            },
            {
                "d": br_path,
                "layers": [
                    {
                        "type": "linear",
                        "x1": float(fmt(u0)),
                        "y1": 0,
                        "x2": float(fmt(u1)),
                        "y2": 0,
                        "stops": [[0, round(float(a0), 3)], [1, round(float(a1), 3)]],
                    },
                    {
                        "type": "radial",
                        "cx": float(fmt(rcu)),
                        "cy": float(fmt(rcv)),
                        "r": float(fmt(rr)),
                        "stops": [[0, 0], [0.5, round(float(b1), 3)], [1, round(float(b2), 3)]],
                    },
                ],
            },
        ],
    }
    OUT.write_text(json.dumps(geometry, indent=2) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
