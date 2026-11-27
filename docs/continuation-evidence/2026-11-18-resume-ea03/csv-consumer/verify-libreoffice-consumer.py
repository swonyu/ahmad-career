#!/usr/bin/env python3
"""Import actual Career Finder CSV bytes in Calc; inspect native ODS evidence.

This is a consumer acceptance check, not spreadsheet authoring. The production
CSVs are decoded without modifications, hash checked, and passed directly to
LibreOffice. Only the separate positive-control CSV is authored by this script.
"""

from __future__ import annotations

import base64
import csv
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import traceback
import xml.etree.ElementTree as ET
import zipfile


ROOT = Path(__file__).resolve().parent
TRANSPORT = ROOT / "fixture-transport.json"
STAMP = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
RUN = ROOT / ("run-" + STAMP)
RUN.mkdir(exist_ok=False)
LOG_PATH = RUN / "consumer.log"
NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    "xlink": "http://www.w3.org/1999/xlink",
}

# Official CSV parameters: Standard columns (empty token 5); quoted fields are
# not forced to text, and formula evaluation is explicitly enabled in token 13.
TOKENS = ["44", "34", "76", "1", "", "1033", "false", "false",
          "true", "false", "false", "0", "true", "false", "false"]
FILTER = "Text - txt - csv (StarCalc):" + ",".join(TOKENS)
SENTINELS = ["SYNTHETIC_PROFILE_EMAIL", "SYNTHETIC_SECRET", "SYNTHETIC_CV",
             "SYNTHETIC_OTHER_SCOPE", "SYNTHETIC_TOKEN"]
EXPECTED_HEADERS = {
    "en": ["Job title", "Employer", "Job link", "Stage (self-entered)",
           "Marked applied (self-entered)", "Applied date (self-entered)",
           "Follow-up date (self-entered)", "Private note",
           "Last edited (not application time)"],
    "ar": ["المسمى الوظيفي", "جهة العمل", "رابط الوظيفة",
           "المرحلة (أدخلتها بنفسك)", "علامة تم التقديم (أدخلتها بنفسك)",
           "تاريخ التقديم (أدخلته بنفسك)", "تاريخ المتابعة (أدخلته بنفسك)",
           "ملاحظة خاصة", "آخر تعديل (وليس وقت التقديم)"],
}


def log(message):
    line = f"{dt.datetime.now(dt.timezone.utc).isoformat()} {message}"
    print(line, flush=True)
    with LOG_PATH.open("a", encoding="utf-8") as out:
        out.write(line + "\n")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_record(path):
    data = path.read_bytes()
    return {"path": str(path), "bytes": len(data), "sha256": sha(data)}


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def q(prefix, name):
    return "{" + NS[prefix] + "}" + name


def text_content(element):
    """Read ODF text, preserving tabs, spaces, paragraphs, and line breaks."""
    value = element.text or ""
    for child in element:
        if child.tag == q("text", "s"):
            value += " " * int(child.attrib.get(q("text", "c"), "1"))
        elif child.tag == q("text", "tab"):
            value += "\t"
        elif child.tag == q("text", "line-break"):
            value += "\n"
        else:
            value += text_content(child)
        value += child.tail or ""
    return value


def address(row, column):
    result = ""
    while column:
        column, n = divmod(column - 1, 26)
        result = chr(65 + n) + result
    return result + str(row)


def inspect_ods(path):
    with zipfile.ZipFile(path) as archive:
        xml_bytes = archive.read("content.xml")
        content = ET.fromstring(xml_bytes)
        formulas, external_links, external_sources = [], [], []
        for name in archive.namelist():
            if not name.endswith(".xml"):
                continue
            document = ET.fromstring(archive.read(name))
            for element in document.iter():
                for key, value in element.attrib.items():
                    if key == q("table", "formula"):
                        formulas.append({"member": name, "formula": value})
                    if key == q("xlink", "href") and not value.startswith(("#", "./")):
                        external_links.append({"member": name, "href": value})
                if element.tag in {q("table", "table-source"), q("table", "cell-range-source"), q("office", "dde-source")}:
                    external_sources.append({"member": name, "element": element.tag, "attributes": element.attrib})
        sheets = []
        for table in content.findall(".//office:body/office:spreadsheet/table:table", NS):
            cells = {}
            row_number = 1
            for row in table.findall("table:table-row", NS):
                row_repeat = int(row.attrib.get(q("table", "number-rows-repeated"), "1"))
                column = 1
                for cell in row:
                    if cell.tag not in {q("table", "table-cell"), q("table", "covered-table-cell")}:
                        continue
                    repeat = int(cell.attrib.get(q("table", "number-columns-repeated"), "1"))
                    paragraphs = cell.findall("text:p", NS)
                    text_value = "\n".join(text_content(p) for p in paragraphs)
                    cell_type = cell.attrib.get(q("office", "value-type"))
                    formula = cell.attrib.get(q("table", "formula"))
                    if cell_type is not None or text_value or formula:
                        if row_repeat > 100 or repeat > 100:
                            raise AssertionError("Unexpected repeated populated region")
                        for dr in range(row_repeat):
                            for dc in range(repeat):
                                a = address(row_number + dr, column + dc)
                                cells[a] = {"row": row_number + dr, "column": column + dc,
                                            "type": cell_type, "text": text_value,
                                            "formula": formula,
                                            "numericValue": cell.attrib.get(q("office", "value")),
                                            "stringValue": cell.attrib.get(q("office", "string-value"))}
                    column += repeat
                row_number += row_repeat
            sheets.append({"name": table.attrib.get(q("table", "name")), "cells": cells,
                           "usedRows": max((c["row"] for c in cells.values()), default=0),
                           "usedColumns": max((c["column"] for c in cells.values()), default=0)})
    xml_path = path.with_suffix(".content.xml")
    xml_path.write_bytes(xml_bytes)
    return {"file": file_record(path), "contentXML": file_record(xml_path), "sheets": sheets,
            "formulas": formulas, "externalLinks": external_links, "externalSources": external_sources}


def import_csv(csv_path, name, soffice):
    destination = RUN / name
    destination.mkdir()
    profile = RUN / ("profile-" + name)
    temp = RUN / ("temp-" + name)
    temp.mkdir()
    command = [soffice, "-env:UserInstallation=" + profile.as_uri(), "--headless",
               "--nologo", "--nodefault", "--nofirststartwizard", "--norestore",
               "--infilter=" + FILTER, "--convert-to", "ods:calc8",
               "--outdir", str(destination), str(csv_path)]
    environment = dict(os.environ, SAL_USE_VCLPLUGIN="svp", TMPDIR=str(temp))
    before = sha(csv_path.read_bytes())
    started = time.monotonic()
    result = subprocess.run(command, capture_output=True, text=True, timeout=45, env=environment)
    command_evidence = {"command": command, "isolatedUserProfile": str(profile),
                        "environmentOverrides": {"SAL_USE_VCLPLUGIN": "svp", "TMPDIR": str(temp)},
                        "exitCode": result.returncode, "elapsedSeconds": round(time.monotonic() - started, 3),
                        "stdout": result.stdout, "stderr": result.stderr,
                        "inputHashBefore": before, "inputHashAfter": sha(csv_path.read_bytes())}
    write_json(destination / "invocation.json", command_evidence)
    log(f"IMPORT {name}: exit={result.returncode}; {result.stdout.strip()}; {result.stderr.strip()}")
    if result.returncode != 0:
        raise AssertionError(f"LibreOffice import failed: {name}")
    if command_evidence["inputHashBefore"] != command_evidence["inputHashAfter"]:
        raise AssertionError("Consumer changed input CSV bytes")
    output = destination / (csv_path.stem + ".ods")
    if not output.is_file():
        raise AssertionError("Native ODS output missing")
    inspected = inspect_ods(output)
    write_json(destination / "native-inspection.json", inspected)
    return command_evidence, inspected


def main():
    fixture = json.loads(TRANSPORT.read_text(encoding="utf-8"))
    assert fixture["source"] == "b78b83b09739fefe69a6c8b72d7d1a60a4feb22a"
    assert fixture["recordCount"] == 18 and fixture["columnCount"] == 9
    assert len(fixture["records"]) == 18 and len(fixture["dangerous"]) == 17
    soffice = shutil.which("soffice")
    assert soffice
    version = subprocess.check_output([soffice, "--version"], text=True).strip()
    evidence = {
        "schemaVersion": 1, "task": "WF-04 spreadsheet consumer acceptance",
        "startedAtUTC": dt.datetime.now(dt.timezone.utc).isoformat(),
        "sourceCommit": fixture["source"], "sourceBlobs": fixture["sourceBlobs"],
        "generatorNodeVersion": fixture["node"], "generatorScope": fixture["scope"],
        "transport": file_record(TRANSPORT), "script": file_record(Path(__file__)),
        "engine": {"command": soffice, "version": version, "mode": "headless native Calc CSV import to native ODS"},
        "filter": {"string": FILTER, "tokens": TOKENS,
                   "documentation": "https://help.libreoffice.org/latest/en-US/text/shared/guide/csv_params.html",
                   "columnFormat": "Standard default; no forced-text column formatting",
                   "quotedFieldsAsText": False, "evaluateFormulaExpressions": True,
                   "detectSpecialNumbers": False, "detectScientificNumbers": False,
                   "trimSpaces": False, "languageIdentifier": 1033,
                   "characterSet": "UTF-8 (76)"},
        "allowedComparisonNormalization": "CRLF to LF only; no other content normalization",
        "exports": [], "limitations": [
            "One LibreOfficeDev 26.8.0.0.alpha0 engine in this Linux environment, not Excel or Numbers.",
            "Actual production export functions were executed directly by the parent generator; this task does not claim browser-download acceptance.",
            "This checks imported native cell values, types, formulas and external sources; it does not claim desktop visual layout or UI usability.",
            "No calendar consumer, repeated import, app re-import, or follow-up synchronization was tested.",
            "Synthetic fixtures only; no real account, employer, profile, resume or secret data used.",
        ],
    }
    log("ENGINE " + version)
    control = RUN / "positive-control.csv"
    control.write_bytes(b'control,value\r\nunguarded,=1+1\r\nquoted,"=1+1"\r\nliteral,"Text: =1+1"\r\n')
    invocation, inspected = import_csv(control, "positive-control", soffice)
    cells = inspected["sheets"][0]["cells"]
    control_pass = all(cells[a]["formula"] == "of:=1+1" and cells[a]["numericValue"] == "2" and cells[a]["type"] == "float" for a in ["B2", "B3"])
    control_pass = control_pass and cells["B4"]["type"] == "string" and cells["B4"]["text"] == "Text: =1+1" and not cells["B4"]["formula"]
    evidence["positiveControl"] = {"input": file_record(control), "passed": control_pass,
                                   "checks": {a: cells[a] for a in ["B2", "B3", "B4"]},
                                   "nativeOutput": inspected["file"], "invocation": invocation}
    log("POSITIVE_CONTROL " + ("PASS" if control_pass else "FAIL"))
    assert control_pass, "Engine did not demonstrably evaluate an unguarded and quoted =1+1"

    for item in fixture["files"]:
        filename = item["filename"]
        assert Path(filename).name == filename and filename in {"career-finder-export-en.csv", "career-finder-export-ar.csv"}
        language = "ar" if filename.endswith("-ar.csv") else "en"
        raw = base64.b64decode(item["base64"], validate=True)
        assert sha(raw) == item["sha256"], "Transport CSV hash mismatch"
        csv_path = RUN / filename
        csv_path.write_bytes(raw)
        text = raw.decode("utf-8-sig")
        expected = list(csv.reader(io.StringIO(text, newline=""), strict=True))
        assert len(expected) == 19 and all(len(row) == 9 for row in expected)
        assert expected[0] == EXPECTED_HEADERS[language]
        assert not any(s in text for s in SENTINELS)
        assert expected[1][0] == fixture["records"][0]["title"]
        assert expected[1][1] == fixture["records"][0]["company"]
        assert expected[1][7] == fixture["records"][0]["note"]
        for i, value in enumerate(fixture["dangerous"], start=2):
            for j in [0, 1, 7]:
                assert expected[i][j] == "Text: " + value
        invocation, inspected = import_csv(csv_path, language, soffice)
        assert len(inspected["sheets"]) == 1
        sheet = inspected["sheets"][0]
        cells = sheet["cells"]
        mismatches, non_text_cells, normalizations = [], [], []
        for i, row in enumerate(expected, start=1):
            for j, original in enumerate(row, start=1):
                a = address(i, j)
                actual = cells.get(a)
                normalized = original.replace("\r\n", "\n")
                if original != normalized:
                    normalizations.append({"cell": a, "kind": "CRLF to LF", "original": original, "compared": normalized})
                if actual is None or actual["text"] != normalized:
                    mismatches.append({"cell": a, "expected": normalized, "actual": actual})
                if actual is None or actual["type"] != "string":
                    non_text_cells.append({"cell": a, "actual": actual})
        dangerous_cells = []
        for i, value in enumerate(fixture["dangerous"], start=3):
            for j in [1, 2, 8]:
                a = address(i, j)
                c = cells.get(a, {})
                dangerous_cells.append({"cell": a, "sourceVariant": value, "nativeType": c.get("type"),
                                        "nativeText": c.get("text"), "formula": c.get("formula"),
                                        "literalTextPrefix": c.get("text", "").startswith("Text: ")})
        privacy_absent = not any(s in json.dumps(inspected, ensure_ascii=False) for s in SENTINELS)
        passed = (sheet["usedRows"] == 19 and sheet["usedColumns"] == 9 and len(cells) == 171
                  and not mismatches and not non_text_cells and not inspected["formulas"]
                  and not inspected["externalLinks"] and not inspected["externalSources"]
                  and privacy_absent and all(c["literalTextPrefix"] and not c["formula"] for c in dangerous_cells))
        result = {"language": language, "input": file_record(csv_path), "expectedSHA256": item["sha256"],
                  "hasUTF8BOM": raw.startswith(b"\xef\xbb\xbf"), "inputUnmodified": True,
                  "recordCount": 18, "columnCount": 9, "nativeRowsIncludingHeader": sheet["usedRows"],
                  "nativeUsedColumns": sheet["usedColumns"], "nativeCellCount": len(cells),
                  "all171CellsString": not non_text_cells, "nonTextCells": non_text_cells,
                  "exactValuesAfterAllowedNormalization": not mismatches, "mismatches": mismatches,
                  "allowedNormalizations": normalizations, "formulaCount": len(inspected["formulas"]),
                  "externalLinks": inspected["externalLinks"], "externalSources": inspected["externalSources"],
                  "formulaLikeVariants": 17, "formulaLikeCells": dangerous_cells,
                  "profileCVAndSecretSentinelsAbsent": privacy_absent,
                  "nativeOutput": inspected["file"], "contentXML": inspected["contentXML"],
                  "nativeInspection": str(RUN / language / "native-inspection.json"),
                  "invocation": invocation, "passed": passed}
        evidence["exports"].append(result)
        log(f"EXPORT {language}: {'PASS' if passed else 'FAIL'}; cells={len(cells)}, mismatches={len(mismatches)}, formulas={len(inspected['formulas'])}")
    evidence["transportUnchanged"] = file_record(TRANSPORT) == evidence["transport"]
    evidence["passed"] = control_pass and evidence["transportUnchanged"] and all(x["passed"] for x in evidence["exports"])
    evidence["finishedAtUTC"] = dt.datetime.now(dt.timezone.utc).isoformat()
    evidence["logPath"] = str(LOG_PATH)
    write_json(RUN / "consumer-evidence.json", evidence)
    write_json(ROOT / "consumer-evidence.json", evidence)
    log("RESULT " + ("PASS" if evidence["passed"] else "FAIL") + "; evidence=" + str(RUN / "consumer-evidence.json"))
    shutil.copyfile(LOG_PATH, ROOT / "consumer.log")
    return 0 if evidence["passed"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        log("ERROR " + traceback.format_exc())
        shutil.copyfile(LOG_PATH, ROOT / "consumer.log")
        raise
