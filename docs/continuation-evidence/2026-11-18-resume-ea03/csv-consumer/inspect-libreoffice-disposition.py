#!/usr/bin/env python3
"""Classify retained Calc import results without changing the initial result."""

import csv
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent
INITIAL = ROOT / "consumer-evidence.json"
NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def q(prefix, name):
    return "{" + NS[prefix] + "}" + name


def text_content(element):
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


def read_cells(path):
    with zipfile.ZipFile(path) as archive:
        content = ET.fromstring(archive.read("content.xml"))
    table = content.find(".//office:body/office:spreadsheet/table:table", NS)
    cells = {}
    ri = 1
    for row in table.findall("table:table-row", NS):
        rr = int(row.attrib.get(q("table", "number-rows-repeated"), "1"))
        ci = 1
        for cell in row.findall("table:table-cell", NS):
            cr = int(cell.attrib.get(q("table", "number-columns-repeated"), "1"))
            value_type = cell.attrib.get(q("office", "value-type"))
            if value_type:
                assert rr <= 100 and cr <= 100
                value = "\n".join(text_content(p) for p in cell.findall("text:p", NS))
                for r in range(ri, ri + rr):
                    for c in range(ci, ci + cr):
                        cells[(r, c)] = {"type": value_type, "text": value,
                                         "dateValue": cell.attrib.get(q("office", "date-value")),
                                         "numericValue": cell.attrib.get(q("office", "value")),
                                         "formula": cell.attrib.get(q("table", "formula"))}
            ci += cr
        ri += rr
    return cells


def main():
    before = digest(INITIAL)
    original = json.loads(INITIAL.read_text())
    assert original["passed"] is False
    disposition = {
        "schemaVersion": 1,
        "observedAtUTC": dt.datetime.now(dt.timezone.utc).isoformat(),
        "sourceCommit": original["sourceCommit"],
        "initialEvidence": {"path": str(INITIAL), "sha256": before, "passed": False},
        "engine": original["engine"],
        "scope": "Read-only inspection of the retained native ODS output; no new imports or source edits.",
        "disposition": "Partial WF-04 spreadsheet consumer evidence. Strict initial fidelity failure remains. The only observed text differences are consumer line-ending normalization; no non-line-break content or civil date change was found.",
        "initialTypeDiagnostic": "The initial all171CellsString diagnostic is false because 36 civil-date fields per language became native date cells. Formula-like fields are all strings. The task did not require dates to remain strings.",
        "viewingComparison": "A separate comparison allows CRLF and lone CR to become LF; it does not replace the initial CRLF-only strict criterion.",
        "exportContractAssessment": "Parent coordinator inspected the existing source disclosure: CSV is a viewing export, formula-like cells get a Text: marker, and JSON is the original-value path. This consumer result does not validate an app defect under that contract.",
        "jsonAcceptance": "Not executed here; JSON original-value behavior was not newly tested by this consumer task.",
        "sourceChangeRecommended": False,
        "exports": [],
        "limitations": original["limitations"] + ["No empty civil-date or other empty-field fixture was present; empty-field behavior is not established by this run."],
    }
    for item in original["exports"]:
        input_path = Path(item["input"]["path"])
        native_path = Path(item["nativeOutput"]["path"])
        assert digest(input_path) == item["input"]["sha256"]
        assert digest(native_path) == item["nativeOutput"]["sha256"]
        with input_path.open(encoding="utf-8-sig", newline="") as source:
            expected = list(csv.reader(source, strict=True))
        cells = read_cells(native_path)
        changes, other_changes, date_checks, timestamp_checks, empty_fields = [], [], [], [], []
        for r, row in enumerate(expected, 1):
            for c, value in enumerate(row, 1):
                address = chr(64 + c) + str(r)
                native = cells[(r, c)]
                if value == "":
                    empty_fields.append(address)
                if native["text"] != value:
                    entry = {"cell": address, "source": value, "native": native["text"]}
                    if native["text"] == value.replace("\r\n", "\n").replace("\r", "\n"):
                        entry["kind"] = "CRLF to LF" if "\r\n" in value else "lone CR to LF"
                        changes.append(entry)
                    else:
                        other_changes.append(entry)
                if r > 1 and c in [6, 7]:
                    date_checks.append({"cell": address, "source": value, "native": native,
                                        "unchanged": native["type"] == "date" and native["dateValue"] == value and native["text"] == value})
                if r > 1 and c == 9:
                    timestamp_checks.append({"cell": address, "unchanged": native["type"] == "string" and native["text"] == value})
        guarded = [cells[(r, c)] for r in range(3, 20) for c in [1, 2, 8]]
        disposition["exports"].append({
            "language": item["language"], "input": item["input"], "nativeOutput": item["nativeOutput"],
            "records": 18, "columns": 9, "populatedCellsIncludingHeader": len(cells),
            "stringCells": sum(cell["type"] == "string" for cell in cells.values()),
            "nativeDateCells": sum(cell["type"] == "date" for cell in cells.values()),
            "lineEndingChanges": changes, "nonLineBreakContentChanges": other_changes,
            "viewingContentPreservedAfterLineEndingNormalization": not other_changes,
            "civilDateChecks": date_checks, "all36CivilDatesUnchanged": len(date_checks) == 36 and all(x["unchanged"] for x in date_checks),
            "lastEditedTimestamps": {"checked": len(timestamp_checks), "allUnchangedStrings": all(x["unchanged"] for x in timestamp_checks)},
            "emptyFields": empty_fields, "emptyCivilDatesPresent": sum(check["source"] == "" for check in date_checks),
            "formulaLikeCells": {"checked": len(guarded), "all51LiteralStringsWithPrefix": len(guarded) == 51 and all(cell["type"] == "string" and cell["text"].startswith("Text: ") and not cell["formula"] for cell in guarded)},
            "formulaCount": item["formulaCount"], "externalLinks": item["externalLinks"], "externalSources": item["externalSources"],
            "profileCVAndSecretSentinelsAbsent": item["profileCVAndSecretSentinelsAbsent"],
            "strictInitialPassed": False,
        })
    control_path = Path(original["positiveControl"]["nativeOutput"]["path"])
    assert digest(control_path) == original["positiveControl"]["nativeOutput"]["sha256"]
    control = read_cells(control_path)
    control_proved = all(control[(r, 2)]["type"] == "float" and control[(r, 2)]["formula"] == "of:=1+1" and control[(r, 2)]["numericValue"] == "2" for r in [2, 3])
    assert control_proved
    disposition["positiveControl"] = {"nativeOutput": original["positiveControl"]["nativeOutput"],
                                      "bareAndQuotedEqualsOnePlusOneBecameFormulaWithValueTwo": control_proved,
                                      "B2": control[(2, 2)], "B3": control[(3, 2)]}
    disposition["initialEvidenceUnchanged"] = digest(INITIAL) == before
    assert disposition["initialEvidenceUnchanged"]
    disposition["script"] = {"path": str(Path(__file__)), "sha256": digest(Path(__file__))}
    output = ROOT / "consumer-disposition.json"
    output.write_text(json.dumps(disposition, ensure_ascii=False, indent=2) + "\n")
    summary = {"initialStrictPassed": False, "initialEvidenceUnchanged": True,
               "positiveControlProved": control_proved,
               "exports": [{"language": x["language"], "lineEndingChanges": len(x["lineEndingChanges"]),
                            "nonLineBreakChanges": len(x["nonLineBreakContentChanges"]), "civilDatesUnchanged": x["all36CivilDatesUnchanged"],
                            "guardedCellsLiteral": x["formulaLikeCells"]["all51LiteralStringsWithPrefix"], "emptyFieldCases": len(x["emptyFields"])} for x in disposition["exports"]],
               "evidence": str(output), "sha256": digest(output)}
    text = json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
    (ROOT / "consumer-disposition.log").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
