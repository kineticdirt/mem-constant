"""Regenerate INFRANET-COMBINED-BRIEF.html and .pdf from the canonical markdown.

Pipeline (same as prior revisions, now committed): Python `markdown` -> HTML with the
print CSS below -> Edge headless --print-to-pdf.

Run from this folder:  py -3 build-brief.py
"""

import os
import subprocess

import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "INFRANET-COMBINED-BRIEF.md")
HTML_OUT = os.path.join(HERE, "INFRANET-COMBINED-BRIEF.html")
PDF_OUT = os.path.join(HERE, "INFRANET-COMBINED-BRIEF.pdf")
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

CSS = """\
  @page { size: letter; margin: 0.75in; }
  body {
    font-family: "Segoe UI", Calibri, Georgia, serif;
    font-size: 10.5pt;
    line-height: 1.5;
    color: #111;
    max-width: 8.5in;
    margin: 0 auto;
    padding: 0.5in;
  }
  h1 { font-size: 20pt; border-bottom: 2px solid #222; padding-bottom: 0.2em; page-break-before: avoid; }
  h2 { font-size: 14pt; margin-top: 1.5em; border-bottom: 1px solid #999; page-break-after: avoid; }
  h3 { font-size: 12pt; margin-top: 1.2em; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; font-size: 9.5pt; page-break-inside: avoid; }
  th, td { border: 1px solid #444; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eee; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 9pt; background: #f4f4f4; padding: 0 3px; }
  pre { background: #f4f4f4; padding: 8px 10px; overflow-x: auto; font-size: 8.5pt; page-break-inside: avoid; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #666; margin-left: 0; padding-left: 0.8em; color: #333; }
  hr { border: none; border-top: 1px solid #bbb; margin: 1.5em 0; }
  a { color: #0645ad; text-decoration: none; }
  ul, ol { padding-left: 1.4em; }
  p { orphans: 3; widows: 3; }
"""

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Infranet — Pitch Brief</title>
<style>
{css}</style>
</head>
<body>
{body}
</body>
</html>
"""


def main():
    with open(SRC, encoding="utf-8") as f:
        body = markdown.markdown(
            f.read(), extensions=["extra", "toc", "sane_lists"], output_format="html5"
        )
    with open(HTML_OUT, "w", encoding="utf-8") as f:
        f.write(PAGE.format(css=CSS, body=body))
    print(f"wrote {HTML_OUT}")

    subprocess.run(
        [
            EDGE,
            "--headless",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--print-to-pdf={PDF_OUT}",
            "file:///" + HTML_OUT.replace("\\", "/"),
        ],
        check=True,
        timeout=120,
    )
    print(f"wrote {PDF_OUT} ({os.path.getsize(PDF_OUT)} bytes)")


if __name__ == "__main__":
    main()
