"""Regenerate hard-layouts.json: planar layouts of classic hard unknots.

Gauss codes are from Appendix A of Burton et al., "Hard diagrams of the
unknot" (arXiv:2104.14076). Needs spherogram (pip install spherogram):

    python hard-layouts.py > hard-layouts.json
"""

import json

import spherogram
from spherogram.links.orthogonal import OrthogonalLinkDiagram

CODES = {
    "culprit": "-1 2 -3 4 -5 6 7 8 -9 10 -4 5 -6 3 -2 -7 -10 1 -8 9",
    "monster": "1 -2 3 4 5 -6 7 -8 9 -3 10 -1 2 -10 -4 -9 8 -5 6 -7",
}


def gauss_to_dt(gauss):
    """Gauss code (+i over / -i under at crossing i) -> signed DT code."""
    n = len(gauss) // 2
    visits = {}
    for pos, g in enumerate(gauss, start=1):
        visits.setdefault(abs(g), []).append((pos, g > 0))
    dt = {}
    for (p1, o1), (p2, o2) in visits.values():
        odd, even = (p1, p2) if p1 % 2 == 1 else (p2, p1)
        even_over = o2 if even == p2 else o1
        dt[odd] = -even if even_over else even
    return [dt[o] for o in range(1, 2 * n, 2)]


out = {}
for name, code in CODES.items():
    dt = gauss_to_dt([int(t) for t in code.split()])
    link = spherogram.Link(f"DT: [{tuple(dt)}]")
    verts, arrows, crossings = OrthogonalLinkDiagram(link).plink_data()
    out[name] = {"verts": verts, "arrows": arrows, "crossings": crossings}
print(json.dumps(out))
