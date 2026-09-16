"""Generate original, editable SVG illustration concepts for every web route.

Run: python3 design/illustration-atlas/generate.py
The generated files are review artwork only; the application does not import them.
"""

from __future__ import annotations

import html
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
OUT = HERE / "svg"
OUT.mkdir(exist_ok=True)

C = {
    "paper": "#F7F4EC",
    "white": "#FFFFFF",
    "forest": "#28513E",
    "dark": "#233D33",
    "sage": "#91A88A",
    "soft": "#DDE7D8",
    "terra": "#B86F54",
    "ochre": "#C6A263",
    "skin": "#DEAA88",
    "contour": "#D6DED3",
}


def col(name: str) -> str:
    return C.get(name, name)


def person(x: int, y: int, color: str = "forest", flip: bool = False) -> str:
    d = -1 if flip else 1
    return f'''<g transform="translate({x} {y}) scale({d} 1)">
      <circle cx="0" cy="-54" r="13" fill="{C['skin']}"/>
      <path d="M-12 -64 Q0 -78 12 -63" fill="none" stroke="{C['dark']}" stroke-width="5" stroke-linecap="round"/>
      <path d="M-15 -37 Q0 -45 15 -37 L19 8 Q0 17 -19 8 Z" fill="{col(color)}"/>
      <path d="M-13 -26 Q-28 -9 -29 5 M14 -25 Q28 -13 31 -3" fill="none" stroke="{col(color)}" stroke-width="6" stroke-linecap="round"/>
      <path d="M-8 11 L-17 47 M8 11 L20 47" fill="none" stroke="{C['dark']}" stroke-width="5" stroke-linecap="round"/>
      <path d="M-18 48 h13 M17 48 h13" stroke="{C['dark']}" stroke-width="4" stroke-linecap="round"/>
    </g>'''


def tree(x: int, y: int, scale: float = 1, warm: bool = False) -> str:
    leaf = C["terra"] if warm else C["sage"]
    return f'''<g transform="translate({x} {y}) scale({scale})">
      <path d="M0 0 Q-2 -55 25 -112 M7 -62 Q-24 -101 -46 -104 M18 -85 Q49 -100 60 -81" fill="none" stroke="{C['forest']}" stroke-width="7" stroke-linecap="round"/>
      <ellipse cx="26" cy="-116" rx="34" ry="16" fill="{leaf}"/>
      <ellipse cx="-48" cy="-105" rx="27" ry="14" fill="{C['soft']}"/>
      <ellipse cx="60" cy="-83" rx="21" ry="12" fill="{C['ochre']}"/>
      <path d="M-12 1 Q0 -3 12 1" fill="none" stroke="{C['dark']}" stroke-width="2"/>
    </g>'''


def sprout(x: int, y: int, scale: float = 1) -> str:
    return f'''<g transform="translate({x} {y}) scale({scale})">
      <path d="M0 0 Q-7 -39 2 -77" fill="none" stroke="{C['forest']}" stroke-width="5" stroke-linecap="round"/>
      <path d="M-2 -27 Q-32 -57 -41 -29 Q-24 -13 -2 -27" fill="{C['sage']}"/>
      <path d="M1 -50 Q22 -78 39 -57 Q22 -35 1 -50" fill="{C['soft']}" stroke="{C['sage']}" stroke-width="2"/>
      <path d="M-43 1 Q0 -12 43 1" fill="none" stroke="{C['ochre']}" stroke-width="3"/>
    </g>'''


def card(x: int, y: int, kind: str = "profile", tilt: int = 0) -> str:
    icon = {
        "profile": f'<circle cx="24" cy="27" r="10" fill="{C["sage"]}"/><path d="M11 52 Q24 35 37 52" fill="none" stroke="{C["forest"]}" stroke-width="3"/>',
        "job": f'<rect x="13" y="23" width="23" height="20" rx="3" fill="none" stroke="{C["forest"]}" stroke-width="3"/><path d="M20 23 v-5 h10 v5" fill="none" stroke="{C["forest"]}" stroke-width="3"/>',
        "check": f'<circle cx="25" cy="32" r="14" fill="{C["soft"]}"/><path d="M17 31 l6 6 11 -12" fill="none" stroke="{C["forest"]}" stroke-width="3" stroke-linecap="round"/>',
        "message": f'<rect x="11" y="20" width="31" height="23" rx="7" fill="{C["soft"]}"/><circle cx="20" cy="31" r="2" fill="{C["forest"]}"/><circle cx="27" cy="31" r="2" fill="{C["forest"]}"/><circle cx="34" cy="31" r="2" fill="{C["forest"]}"/>',
    }.get(kind, "")
    return f'''<g transform="translate({x} {y}) rotate({tilt})">
      <rect width="86" height="65" rx="9" fill="{C['white']}" stroke="{C['forest']}" stroke-width="2"/>
      {icon}<path d="M51 24 h23 M51 34 h17 M51 44 h20" stroke="{C['sage']}" stroke-width="3" stroke-linecap="round"/>
    </g>'''


def node(x: int, y: int, color: str = "forest", r: int = 10) -> str:
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{col(color)}" stroke="{C["paper"]}" stroke-width="3"/>'


def path(points: list[tuple[int, int]], color: str = "forest", dashed: bool = False) -> str:
    coords = " ".join(f"{x},{y}" for x, y in points)
    dash = ' stroke-dasharray="3 8"' if dashed else ""
    return f'<polyline points="{coords}" fill="none" stroke="{col(color)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"{dash}/>'


def glyph(name: str, x: int, y: int, color: str = "forest", scale: float = 1) -> str:
    p = col(color)
    shapes = {
        "shield": '<path d="M0 -54 L43 -37 L37 12 Q25 41 0 53 Q-25 41 -37 12 L-43 -37 Z"/><path d="M0 25 Q-25 0 0 -25 Q24 -2 0 25 Z" fill="SAGE" stroke="none"/>',
        "handshake": '<path d="M-63 0 Q-32 -29 -7 -6 L2 4 Q17 -9 38 -16 L65 2 M-63 0 L-25 36 Q-3 45 16 25 L52 -8"/><path d="M-20 4 L14 28"/>',
        "arch": '<path d="M-55 48 V-5 Q-55 -58 0 -58 Q55 -58 55 -5 V48 M-18 48 V-6 Q-18 -23 0 -23 Q18 -23 18 -6 V48"/>',
        "lock": '<rect x="-34" y="-5" width="68" height="55" rx="7"/><path d="M-22 -5 V-25 Q-22 -47 0 -47 Q22 -47 22 -25 V-5"/><circle cx="0" cy="17" r="4" fill="P" stroke="none"/>',
        "envelope": '<rect x="-53" y="-37" width="106" height="74" rx="7"/><path d="M-51 -34 L0 4 L51 -34 M-51 34 L-14 -7 M51 34 L14 -7"/>',
        "compass": '<circle r="52"/><circle r="35" stroke="SAGE"/><path d="M-18 19 L0 -28 L18 19 L0 7 Z" fill="OCHRE"/>',
        "hourglass": '<path d="M-37 -51 H37 M-37 51 H37 M-28 -49 Q-29 -22 0 0 Q29 -22 28 -49 M-28 49 Q-29 22 0 0 Q29 22 28 49"/><path d="M-15 35 Q0 17 15 35" fill="OCHRE" stroke="none"/>',
        "magnify": '<circle cx="-9" cy="-9" r="35"/><path d="M17 17 L57 57"/><circle cx="-9" cy="-9" r="17" stroke="SAGE"/>',
        "chat": '<rect x="-53" y="-35" width="106" height="68" rx="20"/><path d="M-13 33 L-34 53 L-32 27"/><circle cx="-25" cy="-1" r="4" fill="SAGE" stroke="none"/><circle cx="0" cy="-1" r="4" fill="SAGE" stroke="none"/><circle cx="25" cy="-1" r="4" fill="SAGE" stroke="none"/>',
        "document": '<path d="M-39 -53 H19 L39 -31 V53 H-39 Z M19 -53 V-31 H39"/><path d="M-20 -16 H20 M-20 0 H21 M-20 16 H11" stroke="SAGE"/>',
        "briefcase": '<rect x="-49" y="-24" width="98" height="66" rx="7"/><path d="M-21 -24 V-35 Q-21 -45 -11 -45 H11 Q21 -45 21 -35 V-24 M-48 4 Q0 28 48 4"/><rect x="-8" y="9" width="16" height="12" rx="2" fill="OCHRE" stroke="none"/>',
        "chart": '<path d="M-55 45 H55 M-55 45 V-42"/><path d="M-40 25 L-14 8 L7 17 L33 -21 L52 -30"/><circle cx="33" cy="-21" r="6" fill="OCHRE" stroke="none"/>',
        "gear": '<circle r="38"/><circle r="15" stroke="SAGE"/><path d="M0 -56 V-40 M0 40 V56 M-56 0 H-40 M40 0 H56 M-40 -40 L-28 -28 M40 40 L28 28 M40 -40 L28 -28 M-40 40 L-28 28"/>',
        "link": '<circle cx="-38" cy="-5" r="21"/><circle cx="38" cy="5" r="21"/><path d="M-18 -5 Q0 -28 18 5 M-18 4 Q0 28 18 5"/>',
        "check": '<circle r="47"/><path d="M-23 0 L-5 17 L28 -22"/>',
        "star": '<path d="M0 -54 L12 -15 L51 -15 L20 8 L30 46 L0 24 L-30 46 L-20 8 L-51 -15 L-12 -15 Z"/>',
        "book": '<path d="M0 -44 Q-30 -58 -55 -44 V40 Q-25 28 0 43 Q25 28 55 40 V-44 Q30 -58 0 -44 Z M0 -44 V43"/><path d="M-41 -22 Q-22 -28 -9 -21 M10 -21 Q26 -28 42 -22" stroke="SAGE"/>',
    }
    shape = shapes[name].replace("SAGE", C["sage"]).replace("OCHRE", C["ochre"]).replace("P", C["paper"])
    return f'<g transform="translate({x} {y}) scale({scale})" fill="none" stroke="{p}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">{shape}</g>'


def scene(elements: list[tuple], index: int) -> str:
    content = []
    for e in elements:
        kind = e[0]
        if kind == "person":
            content.append(person(e[1], e[2], e[3], bool(e[4]) if len(e) > 4 else False))
        elif kind == "tree":
            content.append(tree(e[1], e[2], e[3] if len(e) > 3 else 1, bool(e[4]) if len(e) > 4 else False))
        elif kind == "sprout":
            content.append(sprout(e[1], e[2], e[3] if len(e) > 3 else 1))
        elif kind == "card":
            content.append(card(e[1], e[2], e[3], e[4] if len(e) > 4 else 0))
        elif kind == "glyph":
            content.append(glyph(e[1], e[2], e[3], e[4] if len(e) > 4 else "forest", e[5] if len(e) > 5 else 1))
        elif kind == "node":
            content.append(node(e[1], e[2], e[3], e[4] if len(e) > 4 else 10))
        elif kind == "path":
            content.append(path(e[1], e[2] if len(e) > 2 else "forest", bool(e[3]) if len(e) > 3 else False))
    contours = []
    for j in range(7):
        offset = j * 11
        if index % 2:
            d = f"M-20 {12+offset} C87 {50+offset} 91 {-30+offset} 178 {9+offset} S293 {65+offset} 442 {11+offset}"
        else:
            d = f"M-20 {188+offset} C75 {138+offset} 101 {220+offset} 187 {182+offset} S307 {135+offset} 442 {184+offset}"
        contours.append(f'<path d="{d}" fill="none" stroke="{C["contour"]}" stroke-width="1.2"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="420" height="240" viewBox="0 0 420 240" role="img">
      <rect width="420" height="240" fill="{C['paper']}"/>
      <g opacity="0.78">{''.join(contours)}</g>
      <path d="M0 223 Q80 201 166 218 T420 214 V240 H0 Z" fill="{C['soft']}" opacity="0.72"/>
      {''.join(content)}
    </svg>'''


# Every route receives its own composition, while repeated shapes preserve a shared identity.
ROUTES = [
    ("home", "/", "Career canopy", "Public", "People grow a career network beneath a branching tree.", [("person", 76, 154, "terra"), ("tree", 212, 203, 1.13), ("card", 300, 100, "job", -7)]),
    ("offers", "/offers/[category]", "Opportunity horizon", "Public", "A winding path connects distinct job markers.", [("person", 70, 151, "forest"), ("path", [(106, 192), (163, 160), (216, 177), (285, 106), (340, 112)], "ochre", True), ("glyph", "briefcase", 290, 99, "forest", .7), ("node", 348, 112, "terra", 13)]),
    ("privacy", "/privacy", "Sheltered data", "Public", "A leaf-bearing shield protects a private profile.", [("glyph", "shield", 205, 124, "forest", 1.38), ("card", 302, 107, "profile", 7), ("sprout", 93, 199, .72)]),
    ("terms", "/terms", "Shared ground", "Public", "Two hands meet around a common agreement.", [("glyph", "handshake", 210, 112, "forest", 1.45), ("sprout", 85, 203, .6), ("sprout", 337, 204, .6)]),
    ("login", "/login", "Open threshold", "Access", "A returning member steps through a welcoming arch.", [("glyph", "arch", 222, 132, "forest", 1.3), ("person", 93, 154, "terra"), ("path", [(117, 199), (155, 188), (185, 198), (219, 188)], "ochre", True)]),
    ("register", "/register", "First steps", "Access", "A new sprout rises beside a newly created profile.", [("sprout", 211, 211, 1.5), ("card", 282, 83, "profile", 8), ("node", 85, 148, "terra", 17)]),
    ("auth-login", "/auth/login", "Returning path", "Access", "Legacy login entry follows a single clear path home.", [("glyph", "arch", 194, 129, "forest", 1.05), ("path", [(64, 198), (119, 174), (164, 195), (201, 158), (265, 171), (340, 129)], "terra", True), ("node", 344, 126, "ochre", 14)]),
    ("auth-register", "/auth/register", "New branch", "Access", "Legacy registration entry becomes a fresh branch.", [("tree", 192, 209, .9), ("path", [(62, 179), (118, 173), (156, 133), (202, 118), (266, 87)], "forest"), ("card", 274, 69, "profile", -6)]),
    ("sso-callback", "/auth/sso/callback", "Joined identity", "Access", "Two account paths resolve into one secure identity.", [("glyph", "link", 205, 119, "forest", 1.22), ("path", [(50, 124), (92, 111), (138, 124)], "ochre"), ("path", [(269, 125), (311, 109), (370, 125)], "terra"), ("node", 60, 125, "ochre", 10), ("node", 363, 125, "terra", 10)]),
    ("choose-role", "/choose-role", "Forked trails", "Access", "Candidate and recruiter paths branch from one starting point.", [("person", 203, 164, "forest"), ("path", [(203, 209), (201, 170), (149, 135), (98, 90)], "terra"), ("path", [(204, 170), (257, 130), (319, 88)], "sage"), ("node", 98, 90, "terra", 14), ("node", 319, 88, "sage", 14)]),
    ("pending-approval", "/pending-approval", "Growing bud", "Access", "A protected bud holds promise while approval is pending.", [("glyph", "hourglass", 205, 121, "forest", 1.17), ("sprout", 301, 203, .67), ("node", 106, 102, "ochre", 11)]),
    ("invite-company", "/invite/company", "Company seed", "Access", "A company invitation plants the first shared workspace.", [("glyph", "envelope", 116, 112, "forest", .9), ("path", [(167, 130), (210, 117), (264, 142)], "ochre", True), ("tree", 291, 212, .78)]),
    ("invite-employee", "/invite/employee", "Joining branch", "Access", "An invited teammate joins the organization's tree.", [("tree", 194, 211, .94), ("person", 91, 155, "terra"), ("person", 326, 155, "forest", True), ("path", [(116, 168), (175, 163), (237, 158), (297, 168)], "ochre", True)]),
    ("accept-invitation", "/accept-invitation", "Paths connected", "Access", "An accepted invitation closes an open connection.", [("glyph", "link", 205, 116, "forest", 1.18), ("glyph", "check", 305, 78, "terra", .46), ("sprout", 85, 209, .6)]),
    ("dashboard", "/dashboard", "Career compass", "Candidate", "A candidate orients toward the next useful step.", [("glyph", "compass", 209, 115, "forest", 1.18), ("person", 89, 153, "terra"), ("card", 296, 117, "job", -8)]),
    ("profile", "/profile", "Living portrait", "Candidate", "A professional identity grows around its person.", [("person", 206, 150, "forest"), ("card", 68, 84, "profile", -7), ("sprout", 325, 208, .9)]),
    ("dashboard-profile", "/dashboard/profile", "Profile layers", "Candidate", "Skills, experience, and story form a layered portrait.", [("card", 90, 72, "profile", -10), ("card", 190, 87, "check", 4), ("card", 287, 66, "job", 11), ("person", 203, 171, "terra")]),
    ("recommendations", "/dashboard/recommendations", "Matching constellation", "Candidate", "Profile and jobs connect through a thoughtful match graph.", [("node", 194, 107, "forest", 24), ("node", 72, 68, "terra", 14), ("node", 332, 63, "sage", 14), ("node", 313, 183, "ochre", 13), ("path", [(72, 68), (194, 107), (332, 63)], "forest"), ("path", [(194, 107), (313, 183)], "ochre"), ("card", 94, 146, "job", -6)]),
    ("applications", "/dashboard/applications", "Journey ribbon", "Candidate", "An application progresses along a gentle career trajectory.", [("path", [(53, 156), (117, 159), (178, 109), (238, 142), (309, 76), (365, 87)], "forest"), ("node", 53, 156, "terra", 12), ("node", 178, 109, "sage", 12), ("node", 309, 76, "ochre", 12), ("glyph", "check", 319, 111, "forest", .45)]),
    ("chat", "/chat", "Conversation grove", "Candidate", "Many useful conversations branch from one inbox.", [("glyph", "chat", 200, 107, "forest", 1.12), ("node", 78, 77, "terra", 12), ("node", 322, 71, "sage", 13), ("path", [(91, 82), (147, 102)], "terra", True), ("path", [(254, 101), (308, 77)], "sage", True)]),
    ("chat-thread", "/chat/[id]", "A human exchange", "Candidate", "Two people face one clear conversation thread.", [("person", 88, 157, "terra"), ("person", 329, 157, "forest", True), ("glyph", "chat", 206, 93, "forest", .66), ("path", [(122, 112), (164, 106)], "ochre", True), ("path", [(246, 106), (294, 112)], "sage", True)]),
    ("recruitment-chat", "/chat/recruitment/[applicationId]", "Hiring dialogue", "Candidate", "Candidate and recruiter exchange a role-centered message.", [("person", 75, 151, "terra"), ("person", 340, 151, "forest", True), ("card", 165, 80, "job", 0), ("glyph", "chat", 205, 170, "forest", .46)]),
    ("recruiter", "/recruiter", "Talent orchard", "Recruiter", "A recruiter cultivates a varied field of opportunities.", [("tree", 221, 208, 1.02), ("person", 79, 152, "forest"), ("card", 295, 93, "profile", 6), ("node", 160, 68, "terra", 10)]),
    ("recruiter-new-offer", "/recruiter/offers/new", "Planting a role", "Recruiter", "A new job posting begins like a planted seed.", [("glyph", "briefcase", 126, 95, "forest", .95), ("path", [(165, 153), (214, 173), (261, 168)], "ochre", True), ("sprout", 284, 211, 1.15)]),
    ("companies", "/companies", "Company skyline", "Networking", "Distinct workplaces form one approachable landscape.", [("glyph", "arch", 98, 145, "terra", .56), ("glyph", "arch", 207, 134, "forest", .74), ("glyph", "arch", 325, 143, "sage", .6), ("path", [(65, 202), (147, 197), (220, 199), (345, 197)], "ochre")]),
    ("requests", "/requests", "Connection handoff", "Networking", "A request travels respectfully between professionals.", [("person", 85, 155, "terra"), ("glyph", "envelope", 210, 93, "forest", .71), ("person", 335, 155, "forest", True), ("path", [(118, 138), (166, 132), (251, 127), (302, 137)], "ochre", True)]),
    ("company", "/company", "Enterprise canopy", "Company", "A strong team supports the wider talent ecosystem.", [("tree", 203, 215, 1.17), ("person", 75, 155, "forest"), ("person", 331, 155, "terra", True), ("card", 276, 71, "profile", 5)]),
    ("company-jobs", "/company/jobs", "Opportunity beds", "Company", "Several roles grow from one coherent hiring plan.", [("sprout", 79, 211, .72), ("sprout", 207, 213, 1.05), ("sprout", 327, 211, .76), ("card", 168, 62, "job", -4)]),
    ("company-candidates", "/company/candidates", "People mosaic", "Company", "Individual profiles form a diverse talent picture.", [("card", 55, 72, "profile", -8), ("card", 164, 93, "profile", 4), ("card", 270, 66, "profile", 10), ("path", [(97, 170), (204, 167), (314, 169)], "ochre", True)]),
    ("company-assessments", "/company/assessments", "Skill rings", "Company", "Practical skills are measured with care and clarity.", [("glyph", "star", 205, 113, "forest", .88), ("glyph", "check", 205, 113, "ochre", .43), ("node", 85, 84, "terra", 11), ("node", 322, 79, "sage", 11)]),
    ("company-messages", "/company/messages", "Conversation bridge", "Company", "Messages bridge candidates and hiring teams.", [("glyph", "chat", 112, 96, "terra", .75), ("glyph", "chat", 309, 96, "forest", .75), ("path", [(152, 144), (205, 165), (268, 144)], "ochre"), ("node", 205, 165, "ochre", 9)]),
    ("company-invitations", "/company/invitations", "Opening circle", "Company", "Each invitation adds another person to the team.", [("glyph", "envelope", 205, 93, "forest", .75), ("person", 79, 158, "terra"), ("person", 333, 158, "forest", True), ("path", [(111, 166), (205, 187), (301, 166)], "sage", True)]),
    ("company-team", "/company/team", "Collective canopy", "Company", "People share responsibility beneath a common canopy.", [("tree", 211, 195, .88), ("person", 73, 155, "terra"), ("person", 320, 155, "forest", True), ("node", 124, 94, "ochre", 10), ("node", 299, 76, "sage", 10)]),
    ("company-analytics", "/company/analytics", "Data terrain", "Company", "Hiring outcomes rise from quiet topographic curves.", [("glyph", "chart", 205, 122, "forest", 1.26), ("path", [(45, 194), (102, 166), (148, 181), (211, 146), (295, 129), (362, 84)], "ochre", True), ("node", 361, 84, "terra", 10)]),
    ("company-settings", "/company/settings", "Control garden", "Company", "Organization settings are stable dials within a living system.", [("glyph", "gear", 199, 113, "forest", 1.07), ("sprout", 314, 208, .68), ("card", 71, 104, "check", -6)]),
    ("admin", "/admin", "Systems map", "Admin", "Platform areas connect through a readable oversight map.", [("node", 204, 111, "forest", 23), ("node", 80, 70, "terra", 13), ("node", 327, 66, "sage", 13), ("node", 104, 186, "ochre", 11), ("node", 308, 183, "forest", 11), ("path", [(80, 70), (204, 111), (327, 66)], "forest"), ("path", [(104, 186), (204, 111), (308, 183)], "sage")]),
    ("admin-login", "/admin/login", "Secure portal", "Admin", "An uncluttered entrance protects platform operations.", [("glyph", "arch", 205, 133, "forest", 1.15), ("glyph", "lock", 205, 119, "terra", .54), ("node", 81, 85, "ochre", 8)]),
    ("admin-users", "/admin/users", "Community lattice", "Admin", "Many individual accounts form a legible community.", [("person", 83, 155, "terra"), ("person", 207, 155, "forest"), ("person", 333, 155, "sage", True), ("path", [(105, 65), (205, 46), (310, 65)], "ochre", True)]),
    ("admin-offers", "/admin/offers", "Role archive", "Admin", "Published opportunities are organized as clear records.", [("glyph", "document", 108, 117, "forest", .84), ("glyph", "document", 213, 99, "sage", .84), ("glyph", "document", 316, 116, "terra", .84), ("path", [(79, 194), (206, 175), (335, 194)], "ochre")]),
    ("admin-recruiters", "/admin/recruiters", "Review lens", "Admin", "A fair review focuses on the person and their work.", [("glyph", "magnify", 201, 114, "forest", 1.1), ("card", 153, 70, "profile", 0), ("node", 329, 73, "terra", 9)]),
    ("admin-activity", "/admin/activity", "Audit current", "Admin", "Recorded events flow along a visible timeline.", [("path", [(73, 188), (115, 145), (180, 157), (237, 95), (314, 116), (355, 67)], "forest"), ("node", 73, 188, "terra", 11), ("node", 180, 157, "sage", 11), ("node", 237, 95, "ochre", 11), ("node", 355, 67, "forest", 11)]),
    ("admin-companies", "/admin/companies", "Organization landscape", "Admin", "Distinct companies sit in one accountable platform view.", [("glyph", "arch", 94, 139, "terra", .55), ("glyph", "arch", 208, 127, "forest", .75), ("glyph", "arch", 323, 144, "sage", .58), ("node", 208, 40, "ochre", 10), ("path", [(86, 197), (206, 178), (326, 199)], "forest")]),
    ("admin-company-invitations", "/admin/company-invitations", "Invitations in flight", "Admin", "Company invitations move toward new workspaces.", [("glyph", "envelope", 115, 102, "forest", .75), ("glyph", "envelope", 304, 86, "terra", .62), ("path", [(154, 138), (209, 112), (267, 125)], "ochre", True), ("sprout", 207, 207, .63)]),
    ("admin-settings", "/admin/settings", "Steady controls", "Admin", "Administrator controls remain calm and intentional.", [("glyph", "gear", 150, 119, "forest", .87), ("glyph", "shield", 283, 112, "terra", .7), ("path", [(197, 158), (239, 157)], "ochre")]),
    ("company-invite-accept", "/company/invite/accept", "Owner threshold", "Company", "A new owner enters a protected company workspace.", [("glyph", "arch", 215, 133, "forest", 1.15), ("glyph", "envelope", 215, 102, "ochre", .48), ("person", 80, 158, "terra"), ("path", [(110, 196), (156, 187), (196, 195)], "ochre", True)]),
    ("company-onboarding", "/company/onboarding", "Workspace roots", "Company", "Company details establish roots for a growing team.", [("sprout", 210, 214, 1.43), ("card", 74, 92, "profile", -6), ("card", 284, 83, "check", 7), ("path", [(117, 175), (180, 187), (244, 188), (310, 168)], "ochre", True)]),
    ("verify-email", "/verify-email", "Proof of arrival", "Access", "A secure email check opens the next career step.", [("glyph", "envelope", 198, 107, "forest", 1.04), ("glyph", "check", 290, 65, "terra", .44), ("path", [(77, 177), (143, 158), (205, 180), (275, 168), (345, 144)], "ochre", True)]),
]


manifest = []
artworks = []
for index, (slug, route, title, group, concept, elements) in enumerate(ROUTES):
    svg = scene(elements, index)
    filename = f"{index + 1:02d}-{slug}.svg"
    (OUT / filename).write_text(svg, encoding="utf-8")
    manifest.append({"route": route, "title": title, "group": group, "concept": concept, "file": f"svg/{filename}"})
    artworks.append(svg)

(HERE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

sheet_parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1868" height="4424" viewBox="0 0 1868 4424">',
               f'<rect width="1868" height="4424" fill="{C["paper"]}"/>',
               '<text x="30" y="53" fill="#233D33" font-family="Inter,Arial,sans-serif" font-size="31" font-weight="700">CODITENT / ILLUSTRATION ATLAS</text>',
               f'<text x="30" y="82" fill="#627668" font-family="Inter,Arial,sans-serif" font-size="15">{len(manifest)} route-specific concepts · warm white / forest green / human and nature stories</text>']
for index, (entry, svg) in enumerate(zip(manifest, artworks)):
    x = 24 + (index % 4) * 460
    y = 104 + (index // 4) * 360
    inner = svg.split(">", 1)[1].rsplit("</svg>", 1)[0]
    sheet_parts.append(f'<rect x="{x}" y="{y}" width="440" height="336" rx="17" fill="#FFFFFF" stroke="#D6DED3"/>')
    sheet_parts.append(f'<g transform="translate({x + 10} {y + 10})">{inner}</g>')
    sheet_parts.append(f'<text x="{x + 18}" y="{y + 275}" fill="#233D33" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700">{html.escape(entry["title"])}</text>')
    sheet_parts.append(f'<text x="{x + 18}" y="{y + 301}" fill="#627668" font-family="Inter,Arial,sans-serif" font-size="13">{html.escape(entry["route"])}</text>')
sheet_parts.append("</svg>")
(HERE / "contact-sheet.svg").write_text("".join(sheet_parts), encoding="utf-8")

for part, start in enumerate(range(0, len(manifest), 12), start=1):
    chunk = manifest[start : start + 12]
    chunk_art = artworks[start : start + 12]
    rows = (len(chunk) + 3) // 4
    height = 104 + (rows - 1) * 360 + 336 + 24
    pieces = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1868" height="{height}" viewBox="0 0 1868 {height}">',
              f'<rect width="1868" height="{height}" fill="{C["paper"]}"/>',
              f'<text x="30" y="55" fill="#233D33" font-family="Inter,Arial,sans-serif" font-size="29" font-weight="700">CODITENT / ILLUSTRATIONS {start + 1}–{start + len(chunk)}</text>']
    for slot, (entry, art) in enumerate(zip(chunk, chunk_art)):
        x = 24 + (slot % 4) * 460
        y = 88 + (slot // 4) * 360
        inner = art.split(">", 1)[1].rsplit("</svg>", 1)[0]
        pieces.append(f'<rect x="{x}" y="{y}" width="440" height="336" rx="17" fill="#FFFFFF" stroke="#D6DED3"/>')
        pieces.append(f'<g transform="translate({x + 10} {y + 10})">{inner}</g>')
        pieces.append(f'<text x="{x + 18}" y="{y + 275}" fill="#233D33" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700">{html.escape(entry["title"])}</text>')
        pieces.append(f'<text x="{x + 18}" y="{y + 301}" fill="#627668" font-family="Inter,Arial,sans-serif" font-size="13">{html.escape(entry["route"])}</text>')
    pieces.append("</svg>")
    (HERE / f"figma-import-{part}.svg").write_text("".join(pieces), encoding="utf-8")

groups = []
for entry in manifest:
    if entry["group"] not in groups:
        groups.append(entry["group"])

sections = []
for group in groups:
    cards = []
    for entry in manifest:
        if entry["group"] != group:
            continue
        cards.append(f'''<article class="card"><img src="{html.escape(entry['file'])}" alt="{html.escape(entry['concept'])}" loading="lazy"><div class="copy"><span>{html.escape(entry['route'])}</span><h3>{html.escape(entry['title'])}</h3><p>{html.escape(entry['concept'])}</p></div></article>''')
    sections.append(f'<section><h2>{html.escape(group)}</h2><div class="grid">{"".join(cards)}</div></section>')

page = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Coditent · Illustration Atlas</title><style>
:root{color-scheme:light;font-family:Inter,system-ui,sans-serif;background:#eeeae0;color:#233d33}*{box-sizing:border-box}body{margin:0}header{background:#233d33;color:#f7f4ec;padding:54px max(24px,calc((100vw - 1320px)/2)) 42px}header p{max-width:780px;color:#d8e4d6;line-height:1.6}h1{font-size:clamp(32px,4vw,55px);letter-spacing:-.045em;margin:8px 0}main{max-width:1368px;margin:auto;padding:24px}section{margin:30px 0 50px}h2{font-size:22px;margin:0 0 18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}.card{background:#fff;border:1px solid #d6ded3;border-radius:16px;overflow:hidden;box-shadow:0 5px 18px #233d330d}.card img{display:block;width:100%;background:#f7f4ec}.copy{padding:16px 18px 20px}.copy span{font-size:12px;color:#627668;word-break:break-word}.copy h3{font-size:19px;margin:7px 0 5px}.copy p{font-size:13px;line-height:1.5;color:#627668;margin:0}footer{text-align:center;color:#627668;padding:25px 16px 50px}a{color:#28513e}
</style></head><body><header><div>CODITENT / VISUAL EXPLORATION</div><h1>Illustration atlas</h1><p>Forty original page-specific drawing concepts. They share warm white, forest green, sage, terracotta, ochre and quiet contour lines while changing the subject to match each route. These are artwork directions for review, not implemented screens.</p></header><main>'''+"".join(sections)+'''</main><footer>Original SVG artwork · individual files are editable and importable into Figma</footer></body></html>'''
(page := page.replace("Forty original", f"{len(manifest)} original"))
page = page.replace(
    "</header><main>",
    '</header><figure style="max-width:1320px;margin:24px auto 8px;padding:0 24px"><img src="higgsfield-career-network.png" alt="Higgsfield exploration showing professionals connected by profile cards beneath a green tree" style="display:block;width:100%;max-height:460px;object-fit:cover;object-position:center 45%;border-radius:18px"><figcaption style="font-size:13px;color:#627668;margin:9px 2px">Higgsfield people study · a supporting style reference, separate from the 47 editable SVG concepts below.</figcaption></figure><main>',
)
(HERE / "index.html").write_text(page, encoding="utf-8")

app_dir = HERE.parents[1] / "apps" / "web" / "src" / "app"
if app_dir.exists():
    actual = set()
    for file in app_dir.rglob("page.tsx"):
        parts = [part for part in file.parent.relative_to(app_dir).parts if not (part.startswith("(") and part.endswith(")"))]
        actual.add("/" + "/".join(parts) if parts else "/")
    mapped = {entry["route"] for entry in manifest}
    missing, stale = sorted(actual - mapped), sorted(mapped - actual)
    if missing or stale:
        raise SystemExit(f"Route coverage mismatch: missing={missing}; stale={stale}")

print(f"Generated {len(manifest)} illustrations, contact-sheet.svg, manifest.json, and index.html; all routes covered")
