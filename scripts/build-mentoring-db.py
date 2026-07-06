#!/usr/bin/env python3
"""
Parse the Legmon mentoring-database CSV export into Strapi seed records.

The CSV is a messy Google-Sheets export:
  - two leading empty columns, then: ID, Organisation, Rolle, Stadt, Land, Rollenbeschreibung
  - every physical line ends with a run of trailing ';' (empty spreadsheet columns)
  - rows whose cells contain commas were wrapped in quotes as a WHOLE line, with
    every internal quote doubled -> we unwrap + un-double, then parse as normal CSV.

Emits two arrays for scripts/seed-data.json:
  experience-topics       : [{ name, order }]        (distinct Rolle values)
  mentoring-experiences   : [{ topic, title, name, role, quote, order }]
"""
import csv, io, json, re, sys, os
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CSV_PATH = os.path.join(ROOT, "Legmon Sheet (09_25) - Datenbank für Website.csv")

def strip_trailing(raw):
    # drop line ending + the trailing empty-column semicolons (and spaces)
    return re.sub(r"[;\s]+$", "", raw.rstrip("\r\n"))

def unwrap(line):
    # Sheets wraps each physical line of a multi-line cell in quotes and doubles
    # every internal quote. Undo that per line: strip outer quotes, un-double.
    if line.startswith('"') and line.endswith('"') and len(line) >= 2:
        line = line[1:-1].replace('""', '"')
    return line

# After unwrapping, a real record starts with the two leading empty columns ",,".
# Any other non-empty line is a continuation of a multi-line quoted cell.
RECORD_START = re.compile(r"^,,")

def logical_lines(fh):
    """Yield full logical CSV lines, re-joining multi-line quoted cells.

    Each physical line is de-trailed and unwrapped first, so continuation lines
    join with a real newline *inside* the (now single-quoted) cell.
    """
    buf = None
    for raw in fh:
        piece = strip_trailing(raw)
        if not piece:
            continue
        piece = unwrap(piece)
        if RECORD_START.match(piece):
            if buf is not None:
                yield buf
            buf = piece
        elif buf is not None:
            buf += "\n" + piece  # continuation of previous record's last cell
        # else: stray leading fragment before any record -> ignore
    if buf is not None:
        yield buf

def parse_row(line):
    fields = next(csv.reader(io.StringIO(line)))
    return fields

def norm(v):
    v = (v or "").strip()
    return "" if v in ("", "-") else v

def main():
    diagnostic = "--write" not in sys.argv
    rows = []
    anomalies = []
    with open(CSV_PATH, encoding="utf-8-sig") as fh:
        for n, line in enumerate(logical_lines(fh), 1):
            try:
                f = parse_row(line)
            except Exception as e:
                anomalies.append((n, f"parse-error {e}", line[:100]))
                continue
            if len(f) < 8 or not f[2].strip().isdigit():
                # header ("ID"/"Organsiation") and blank marker rows land here
                if f[2:3] and f[2].strip() not in ("ID", ""):
                    anomalies.append((n, f"nfields={len(f)} id={f[2:3]}", line[:100]))
                continue
            rows.append({
                "id": int(f[2].strip()),
                "org": norm(f[3]),
                "rolle": norm(f[4]),
                "stadt": norm(f[5]),
                "land": norm(f[6]),
                "desc": norm(f[7]) if len(f) > 7 else "",
            })

    topics = OrderedDict()  # name -> order
    for r in rows:
        t = r["rolle"]
        if t and t not in topics:
            topics[t] = len(topics)

    experience_topics = [{"name": name, "order": i} for name, i in topics.items()]

    def role_field(r):
        loc = ", ".join(x for x in (r["stadt"], r["land"]) if x)
        return loc

    mentoring_experiences = []
    for i, r in enumerate(rows):
        mentoring_experiences.append({
            "topic": r["rolle"],
            "title": r["org"],
            "name": f"Mentor:in {r['id']}",
            "role": role_field(r),
            "quote": r["desc"],
            "order": i,
        })

    # ---- report ----
    ids = sorted({r["id"] for r in rows})
    print(f"parsed data rows : {len(rows)}")
    print(f"unique mentors   : {len(ids)}  (id {ids[0]}..{ids[-1]})")
    print(f"experience-topics: {len(experience_topics)}")
    for t in experience_topics:
        cnt = sum(1 for r in rows if r['rolle'] == t['name'])
        print(f"    {cnt:4d}  {t['name']}")
    META = {"Sprache", "Special Challenges/Skills/Interests"}
    print(f"rows with empty quote/desc: {sum(1 for m in mentoring_experiences if not m['quote'])}")
    print(f"rows with empty title     : {sum(1 for r in rows if not r['org'])}"
          f"  (of which genuine (non-meta) experiences: "
          f"{sum(1 for r in rows if not r['org'] and r['rolle'] not in META)})")
    if anomalies:
        print(f"\nANOMALIES ({len(anomalies)}):")
        for a in anomalies[:30]:
            print("   line", a[0], a[1], repr(a[2]))

    if not diagnostic:
        out = {
            "experience-topics": experience_topics,
            "mentoring-experiences": mentoring_experiences,
        }
        outpath = os.path.join(HERE, "mentoring-db.generated.json")
        with open(outpath, "w", encoding="utf-8") as fh:
            json.dump(out, fh, ensure_ascii=False, indent=2)
        print(f"\nwrote {outpath}")

if __name__ == "__main__":
    main()
