# Scratch generator: F-006 screen mockups as self-contained HTML (Tintero engine conventions).
# One theme (THEME, in mm/pt like the engine's `base` theme) -> CSS variables, shared by every screen.
import html as h
import os
import sys

OUT = sys.argv[1]
DPI = 124


def mm(v):
    return max(1, round(v * DPI / 25.4))


def pt(v):
    return max(1, round(v * DPI / 72))


# Theme `base` (F-005) + the proposed additions for F-006 (marked NEW).
THEME = {
    "m": mm(2), "bar": mm(7), "rule": mm(0.5), "row": mm(5), "group": mm(4.5), "more": mm(4.5),
    "box": mm(3), "box-b": mm(0.5), "gap": mm(1.5),
    "strip": mm(5),          # NEW: status strip (inverted for the lead status)
    "lead-line": mm(5.5),    # NEW: line height of a lead (En progreso) title, 2 lines max
    "card-gap": mm(1.5),     # NEW: space between lead cards
    "section-gap": mm(3),    # NEW: space between status sections
    "f-title": pt(12), "f-text": pt(9), "f-lead": pt(12), "f-detail": 14,
}
TOKENS = ";".join(f"--{k}:{v}px" for k, v in THEME.items())

CSS = (
    ":root{%s}" % TOKENS
    + "*{box-sizing:border-box;margin:0;padding:0}"
    "html,body{background:#fff;color:#000;overflow:hidden}body{position:relative}"
    ".sans{font-family:'DejaVu Sans'}.term{font-family:'Terminus','DejaVu Sans'}"
    ".t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}"
    ".bar{position:absolute;left:0;top:0;right:0;height:var(--bar);padding:0 var(--m);display:grid;grid-template-columns:minmax(0,1fr) max-content;align-items:center;border-bottom:var(--rule) solid #000;box-sizing:content-box}"
    ".bar b{font:700 var(--f-title)/var(--bar) 'DejaVu Sans'}.bar span{font:400 var(--f-detail)/var(--bar) 'Terminus'}"
    ".grid{position:absolute;left:0;right:0;bottom:0;top:calc(var(--bar) + var(--rule));display:grid}"
    ".area{position:relative;overflow:hidden;padding:var(--m)}"
    ".vr{border-left:var(--rule) solid #000}.hr{border-top:var(--rule) solid #000}"
    # status strip: lead status inverted, others plain bold with a hairline under it
    ".strip{height:var(--strip);display:grid;grid-template-columns:minmax(0,1fr) max-content;align-items:center;padding:0 4px;font:700 var(--f-detail)/var(--strip) 'Terminus';letter-spacing:1px}"
    ".strip.lead{background:#000;color:#fff}"
    ".strip.plain{border-bottom:var(--rule) solid #000;padding:0}"
    ".grp{height:var(--group);font:700 var(--f-detail)/var(--group) 'Terminus'}"
    ".row{height:var(--row);display:grid;grid-template-columns:calc(var(--box) + var(--gap)) minmax(0,1fr) max-content;align-items:center;font:400 var(--f-text)/var(--row) 'DejaVu Sans'}"
    ".row.ro{grid-template-columns:minmax(0,1fr) max-content}"
    ".row .due,.card .due{font:400 var(--f-detail)/1 'Terminus';margin-left:var(--gap);white-space:nowrap}"
    ".due.late{background:#000;color:#fff;padding:2px 3px;font-weight:700}"
    ".done .t,.done .tt{text-decoration:line-through}"
    ".box{display:block;width:var(--box);height:var(--box);border:var(--box-b) solid #000;background:#fff}"
    ".box.half{background:linear-gradient(90deg,#000 50%,#fff 50%)}"
    ".box.full{background:#000}"
    ".more{height:var(--more);font:400 var(--f-detail)/var(--more) 'Terminus'}"
    ".card{display:grid;grid-template-columns:calc(var(--box) + var(--gap)) minmax(0,1fr);margin-top:var(--card-gap)}"
    ".card .box{margin-top:calc((var(--lead-line) - var(--box)) / 2)}"
    ".card .tt{font:400 var(--f-lead)/var(--lead-line) 'DejaVu Sans';display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}"
    ".card .meta{font:400 var(--f-detail)/18px 'Terminus';display:flex;gap:var(--gap);align-items:center}"
    ".sec{margin-top:var(--section-gap)}"
    ".focus{outline:var(--rule) solid #000;outline-offset:1px}"
    ".note{font:400 var(--f-text)/1.4 'DejaVu Sans'}"
    ".day{height:var(--group);font:700 var(--f-detail)/var(--group) 'Terminus'}"
    ".ev{height:var(--row);display:grid;grid-template-columns:max-content minmax(0,1fr);column-gap:var(--gap);align-items:center;font:400 var(--f-text)/var(--row) 'DejaVu Sans'}"
    ".ev .hh{font:400 var(--f-detail)/1 'Terminus'}"
    ".cal{display:grid;grid-template-columns:repeat(7,1fr);text-align:center}"
    ".cal .wd{font:700 var(--f-detail)/var(--group) 'Terminus'}"
    ".cal .d{font:400 var(--f-text)/1 'DejaVu Sans';display:flex;align-items:center;justify-content:center}"
    ".cal .d span{display:block;min-width:28px;padding:3px 0}"
    ".cal .d.today span{background:#000;color:#fff;font-weight:700}"
    ".cal .d.ev span{box-shadow:inset 0 -2px 0 #000}"
    ".mhead{height:var(--group);font:700 var(--f-detail)/var(--group) 'Terminus';letter-spacing:1px}"
)

# ---------- sample data (today: sáb 24 oct 2026) ----------
IN_PROGRESS = [
    ("Soldar los pines del adaptador a la placa del panel", "Electrónica", "26 oct", False),
    ("Escribir la ficha de la integración de tareas", "Homelab", None, False),
]
TODO = [
    ("Casa", [("Pagar la factura del agua", "22 oct", True), ("Llamar al técnico de la nevera", None, False),
              ("Arreglar la puerta del baño que no cierra bien", "28 oct", False)]),
    ("Homelab", [("Revisar las copias de seguridad", "30 oct", False), ("Actualizar el servidor de música", None, False)]),
    ("Compras", [("Café y azúcar", None, False), ("Pilas AA para el control", None, False),
                 ("Bombillos para la cocina", None, False)]),
    ("Electrónica", [("Medir el consumo en reposo", None, False)]),
]
DONE_TODAY = ["Cambiar el filtro del agua", "Pedir el ESP32 de repuesto", "Sacar el reciclaje"]
EVENTS = [
    ("SÁB 24 OCT", [("15:00", "Cita médica"), ("19:30", "Comida familiar")]),
    ("DOM 25 OCT", [("Todo el día", "Mercado campesino")]),
    ("LUN 26 OCT", [("09:00", "Reunión diaria del equipo"), ("13:00", "Entrega del módulo")]),
]
EVENT_DAYS = {24, 25, 26, 29, 31, 6, 13}
JIRA = {
    "En curso": [("PROJ-142", "Migrar el servicio de pagos a la nueva cola de mensajes"),
                 ("PROJ-171", "Corregir el reintento de webhooks duplicados")],
    "Por hacer": [("PROJ-151", "Revisar alertas duplicadas del monitoreo"),
                  ("PROJ-163", "Actualizar dependencias del servicio de facturas"),
                  ("PROJ-166", "Agregar métricas de latencia al tablero"),
                  ("PROJ-168", "Quitar la bandera de la versión vieja del checkout")],
    "En revisión": [("PROJ-160", "Documentar el proceso de despliegue")],
}


def e(s):
    return h.escape(s)


def page(w, hgt, title, date, grid_style, areas):
    return (f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}"
            f"html,body{{width:{w}px;height:{hgt}px}}</style></head><body>"
            f"<div class='bar'><b>{e(title)}</b><span>{e(date)}</span></div>"
            f"<div class='grid' style='{grid_style}'>{''.join(areas)}</div></body></html>")


def box(kind=""):
    return f"<span class='box {kind}'></span>"


def due(d, late):
    return "" if not d else f"<span class='due{' late' if late else ''}'>{e(d)}</span>"


def lead_cards(items, focus_first=False, strip_label="EN PROGRESO"):
    out = [f"<div class='strip lead'><span>{strip_label}</span><span>{len(items)}</span></div>"]
    if not items:
        out.append("<p class='note' style='margin-top:6px'>Nada en progreso.</p>")
    for i, (title, cat, d, late) in enumerate(items):
        meta = f"<span>{e(cat)}</span>{due(d, late)}" if cat else due(d, late)
        out.append(f"<div class='card{' focus' if focus_first and i == 0 else ''}'>{box('half')}"
                   f"<div><div class='tt'>{e(title)}</div><div class='meta'>{meta}</div></div></div>")
    return "".join(out)


def todo_section(groups, max_rows, focus=None):
    total = sum(len(g[1]) for g in groups)
    out = [f"<div class='sec'><div class='strip plain'><span>POR HACER</span><span>{total}</span></div>"]
    shown = 0
    for name, items in groups:
        if shown >= max_rows:
            break
        out.append(f"<div class='grp'>{e(name)}</div>")
        for title, d, late in items:
            if shown >= max_rows:
                break
            cls = "row focus" if focus == title else "row"
            out.append(f"<div class='{cls}'>{box()}<span class='t'>{e(title)}</span>{due(d, late)}</div>")
            shown += 1
    if shown < total:
        out.append(f"<div class='more'>+{total - shown} más</div>")
    out.append("</div>")
    return "".join(out)


def done_section(items, label="HECHO HOY"):
    out = [f"<div class='strip plain'><span>{label}</span><span>{len(items)}</span></div>"]
    for t in items:
        out.append(f"<div class='row done'>{box('full')}<span class='t'>{e(t)}</span><span></span></div>")
    return "".join(out)


def agenda(days, label="PRÓXIMOS"):
    out = [f"<div class='strip plain'><span>{label}</span><span></span></div>"]
    for day, evs in days:
        out.append(f"<div class='day'>{e(day)}</div>")
        hw = "max-content"
        for hh, t in evs:
            out.append(f"<div class='ev'><span class='hh'>{e(hh)}</span><span class='t'>{e(t)}</span></div>")
    return "".join(out)


def month(row_h, show_head=True, events=EVENT_DAYS):
    out = []
    if show_head:
        out.append("<div class='mhead'>OCTUBRE 2026</div>")
    out.append("<div class='cal'>" + "".join(f"<div class='wd'>{x}</div>" for x in "LMMJVSD"))
    cells = [""] * 3 + list(range(1, 32))
    cells += [""] * (-len(cells) % 7)
    for c in cells:
        if c == "":
            out.append(f"<div style='height:{row_h}px'></div>")
            continue
        cls = "d" + (" today" if c == 24 else "") + (" ev" if c in events else "")
        out.append(f"<div class='{cls}' style='height:{row_h}px'><span>{c}</span></div>")
    out.append("</div>")
    return "".join(out)


def write(name, content):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(content)


DATE = "sáb 24 oct"
G_LEAD = "grid-template-columns:62% 38%;grid-template-rows:100%"

# 1. hoy, fase 1 (F-006): only the board is connected. Rail = done today + month.
write("1-hoy-fase1.html", page(800, 480, "Hoy", DATE, G_LEAD, [
    f"<div class='area'>{lead_cards(IN_PROGRESS)}{todo_section(TODO, 5)}</div>",
    f"<div class='area vr'>{done_section(DONE_TODAY)}<div class='sec'>{month(30, True, set())}</div></div>",
]))

# 2. hoy, completa: board + calendar connected. Rail = next events + month.
write("2-hoy-completa.html", page(800, 480, "Hoy", DATE, G_LEAD, [
    f"<div class='area'>{lead_cards(IN_PROGRESS)}{todo_section(TODO, 5)}</div>",
    f"<div class='area vr'>{agenda(EVENTS)}<div class='sec'>{month(25, True)}</div></div>",
]))

# 3. tablero: the literal kanban. En progreso wider and in the middle, inverted.
def column(label, cards, lead=False, done=False, total=None):
    strip = "lead" if lead else "plain"
    out = [f"<div class='strip {strip}'><span>{label}</span><span>{total or len(cards)}</span></div>"]
    for title, meta, d, late in cards:
        kind = "full" if done else ("half" if lead else "")
        cls = "card done" if done else "card"
        tt_style = "" if lead else " style=\"font-size:var(--f-text);line-height:20px\""
        mtxt = f"<span>{e(meta)}</span>" if meta else ""
        out.append(f"<div class='{cls}'>{box(kind)}<div><div class='tt'{tt_style}>{e(title)}</div>"
                   f"<div class='meta'>{mtxt}{due(d, late)}</div></div></div>")
    return "".join(out)


todo_cards = [(t, g, d, l) for g, items in TODO for t, d, l in items]
write("3-tablero.html", page(800, 480, "Tablero", DATE,
      "grid-template-columns:32% 38% 30%;grid-template-rows:100%", [
          f"<div class='area'>{column('POR HACER', todo_cards[:5], total=len(todo_cards))}<div class='more' style='margin-top:6px'>+{len(todo_cards) - 5} más</div></div>",
          f"<div class='area vr'>{column('EN PROGRESO', [(t, c, d, l) for t, c, d, l in IN_PROGRESS], lead=True)}</div>",
          f"<div class='area vr'>{column('HECHO HOY', [(t, None, None, False) for t in DONE_TODAY], done=True)}</div>",
      ]))

# 4. trabajo (futuro, Jira de solo lectura): same lead+rail family.
def jira_lead():
    out = ["<div class='strip lead'><span>EN CURSO</span><span>2</span></div>"]
    for k, t in JIRA["En curso"]:
        out.append(f"<div class='card' style='grid-template-columns:1fr'><div><div class='meta' style='font-weight:700'>{k}</div>"
                   f"<div class='tt'>{e(t)}</div></div></div>")
    rest = JIRA["En revisión"] + JIRA["Por hacer"]
    out.append(f"<div class='sec'><div class='strip plain'><span>EN REVISIÓN · POR HACER</span><span>{len(rest)}</span></div>")
    for k, t in rest[:4]:
        out.append(f"<div class='row ro'><span class='t'><b class='term' style='font-size:var(--f-detail)'>{k}</b>&nbsp; {e(t)}</span><span></span></div>")
    out.append(f"<div class='more'>+{len(rest) - 4} más</div></div>")
    return "".join(out)


write("4-trabajo.html", page(800, 480, "Trabajo", DATE, G_LEAD, [
    f"<div class='area'>{jira_lead()}</div>",
    f"<div class='area vr'>{agenda([('LUN 26 OCT', [('09:00', 'Reunión diaria del equipo'), ('11:00', 'Revisión de arquitectura'), ('13:00', 'Entrega del módulo')]), ('MAR 27 OCT', [('09:00', 'Reunión diaria del equipo'), ('15:00', 'Uno a uno')])], 'CALENDARIO DEL TRABAJO')}</div>",
]))

# 5. mes: month grid with the events written in (new block `month-agenda`).
MONTH_EVENTS = {
    6: ["10:00 Odontólogo"], 13: ["Todo el día Puente"], 24: ["15:00 Cita médica", "19:30 Comida familiar"],
    25: ["Mercado campesino"], 26: ["09:00 Reunión diaria", "13:00 Entrega del módulo", "16:00 Llamada"],
    29: ["18:00 Clase de inglés"], 31: ["20:00 Fiesta de disfraces"], 16: ["Pagar arriendo"], 2: ["Cumpleaños de Ana"],
}


def month_big():
    cells = [""] * 3 + list(range(1, 32))
    cells += [""] * (-len(cells) % 7)
    weeks = len(cells) // 7
    out = ["<div style='display:grid;grid-template-columns:repeat(7,1fr);height:100%;"
           f"grid-template-rows:var(--group) repeat({weeks},1fr)'>"]
    for i, x in enumerate(["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]):
        out.append(f"<div class='wd term' style='font-weight:700;font-size:var(--f-detail);line-height:var(--group);padding-left:4px'>{x}</div>")
    for i, c in enumerate(cells):
        col = i % 7
        bl = "border-left:var(--rule) solid #000;" if col else ""
        st = f"border-top:var(--rule) solid #000;{bl}padding:2px 4px;overflow:hidden;min-width:0"
        if c == "":
            out.append(f"<div style='{st}'></div>")
            continue
        num = (f"<span style='background:#000;color:#fff;padding:0 3px'>{c}</span>" if c == 24 else str(c))
        evs = MONTH_EVENTS.get(c, [])
        lines = "".join(f"<div class='t term' style='font-size:var(--f-detail);line-height:16px'>{e(x)}</div>" for x in evs[:2])
        if len(evs) > 2:
            lines += f"<div class='term' style='font-size:var(--f-detail);line-height:16px'>+{len(evs) - 2} más</div>"
        out.append(f"<div style='{st}'><div style='font:700 var(--f-text)/20px DejaVu Sans'>{num}</div>{lines}</div>")
    out.append("</div>")
    return "".join(out)


write("5-mes.html", page(800, 480, "Octubre 2026", DATE, "grid-template-columns:100%;grid-template-rows:100%", [
    f"<div class='area' style='padding:0 var(--m) var(--m)'>{month_big()}</div>",
]))

# 6. hoy vertical (480 x 800): same slots stacked.
write("6-hoy.v.html", page(480, 800, "Hoy", DATE, "grid-template-columns:100%;grid-template-rows:55% 22% 23%", [
    f"<div class='area'>{lead_cards(IN_PROGRESS)}{todo_section(TODO, 5)}</div>",
    f"<div class='area hr'>{agenda(EVENTS[:2])}</div>",
    f"<div class='area hr'>{month(22, True)}</div>",
]))

# 7. estados: every row state the task blocks can show, with the focus the device draws.
states = [
    ("Por hacer", f"<div class='row'>{box()}<span class='t'>Llamar al técnico de la nevera</span>{due(None, False)}</div>"),
    ("En progreso", f"<div class='row'>{box('half')}<span class='t'>Soldar los pines del adaptador</span>{due('26 oct', False)}</div>"),
    ("Hecho (hasta medianoche)", f"<div class='row done'>{box('full')}<span class='t'>Cambiar el filtro del agua</span><span></span></div>"),
    ("Vencida", f"<div class='row'>{box()}<span class='t'>Pagar la factura del agua</span>{due('22 oct', True)}</div>"),
    ("Con foco (lo dibuja el aparato)", f"<div class='row focus'>{box()}<span class='t'>Revisar las copias de seguridad</span>{due('30 oct', False)}</div>"),
    ("Solo lectura (Jira)", "<div class='row ro'><span class='t'><b class='term' style='font-size:var(--f-detail)'>PROJ-151</b>&nbsp; Revisar alertas duplicadas</span><span></span></div>"),
    ("Título largo", f"<div class='row'>{box()}<span class='t'>Arreglar la puerta del baño que no cierra bien desde que cambiaron la chapa</span>{due('28 oct', False)}</div>"),
    ("No cabe todo", "<div class='more'>+5 más</div>"),
    ("Fuente sin conexión", "<div class='strip lead'><span>EN PROGRESO</span><span>sin datos desde 14:05</span></div>"),
    ("Sin tareas en progreso", "<p class='note'>Nada en progreso.</p>"),
    ("Sin pendientes", "<p class='note'>Sin pendientes.</p>"),
]
rows = "".join(f"<div style='display:grid;grid-template-columns:270px 1fr;align-items:center;min-height:33px'>"
               f"<span class='term' style='font-size:var(--f-detail);font-weight:700'>{e(k)}</span><div style='padding:0 6px'>{v}</div></div>"
               for k, v in states)
write("7-estados.html", page(800, 480, "Estados de una fila", DATE, "grid-template-columns:100%;grid-template-rows:100%",
      [f"<div class='area'>{rows}</div>"]))
print("ok")
