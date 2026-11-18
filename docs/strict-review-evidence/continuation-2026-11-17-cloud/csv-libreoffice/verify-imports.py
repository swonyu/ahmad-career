"""Read Calc's imported flat-ODS output without modifying a workbook.

Run after the engine invocations recorded in engine-invocations.json.
The only comparison normalization is platform line endings (CRLF/CR -> LF).
"""
from pathlib import Path
import csv
import datetime
import hashlib
import json
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
NS = {
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
}


def attr(kind, name):
    return "{" + NS[kind] + "}" + name


def content(element):
    if element.tag == attr("text", "s"):
        return " " * int(element.get(attr("text", "c"), "1"))
    if element.tag == attr("text", "tab"):
        return "\t"
    if element.tag == attr("text", "line-break"):
        return "\n"
    result = element.text or ""
    for child in element:
        result += content(child) + (child.tail or "")
    return result


def normalized(value):
    return value.replace("\r\n", "\n").replace("\r", "\n")


results = []
for mode in ("default", "formula-enabled"):
    for language in ("en", "ar"):
        source = HERE / ("career-records-" + language + ".csv")
        with source.open(encoding="utf-8-sig", newline="") as handle:
            expected = list(csv.reader(handle))
        assert len(expected) == 21 and all(len(row) == 9 for row in expected)
        target = HERE / mode / ("career-records-" + language + ".fods")
        tree = ET.parse(target)
        actual, cells, formulas = [], [], []
        for row in tree.findall(".//table:table-row", NS):
            values, metadata = [], []
            for cell in row.findall("table:table-cell", NS):
                text = "\n".join(content(p) for p in cell.findall("text:p", NS))
                repeated = int(cell.get(attr("table", "number-columns-repeated"), "1"))
                assert repeated <= 20, "Unexpected large repeated region in bounded fixture"
                formula = cell.get(attr("table", "formula"))
                if formula:
                    formulas.append(formula)
                values.extend([text] * repeated)
                metadata.extend([cell.attrib] * repeated)
            repeated_rows = int(row.get(attr("table", "number-rows-repeated"), "1"))
            assert repeated_rows == 1
            actual.append(values)
            cells.append(metadata)
        mismatches, type_mismatches = [], []
        typed_dates = blank_dates = string_cells = 0
        for row_index, (wanted, imported) in enumerate(zip(expected, actual)):
            if len(imported) != 9:
                mismatches.append({"row": row_index + 1, "importedColumns": len(imported)})
            for column, (a, b) in enumerate(zip(wanted, imported)):
                if normalized(a) != normalized(b):
                    mismatches.append({"row": row_index + 1, "column": column + 1, "expected": a, "imported": b})
                metadata = cells[row_index][column]
                kind = metadata.get(attr("office", "value-type"))
                is_date_column = row_index > 0 and column in (5, 6)
                if is_date_column and a:
                    typed_dates += 1
                    if kind != "date" or metadata.get(attr("office", "date-value")) != a:
                        type_mismatches.append({"row": row_index + 1, "column": column + 1, "expectedDate": a, "metadata": metadata})
                elif is_date_column and not a:
                    blank_dates += 1
                    if b or kind or metadata.get(attr("office", "date-value")):
                        type_mismatches.append({"row": row_index + 1, "column": column + 1, "expectedEmpty": True, "metadata": metadata})
                else:
                    string_cells += 1
                    if kind != "string" or normalized(metadata.get(attr("office", "string-value"), b)) != normalized(b):
                        type_mismatches.append({"row": row_index + 1, "column": column + 1, "expectedString": True, "metadata": metadata})
        protected = [(r, c) for r in range(1, 18) for c in (0, 1, 7)]
        protected_as_text = all(cells[r][c].get(attr("office", "value-type")) == "string" and actual[r][c].startswith("Text: ") for r, c in protected)
        all_formula_attributes = [node.get(attr("table", "formula")) for node in tree.iter() if node.get(attr("table", "formula"))]
        table_count = len(tree.findall(".//table:table", NS))
        result = {
            "mode": mode, "language": language, "rowsIncludingHeader": len(actual),
            "columns": 9, "tables": table_count, "formulaAttributes": len(all_formula_attributes),
            "storedDateValuesChecked": typed_dates, "emptyAppliedDatesChecked": blank_dates, "storedStringCellsChecked": string_cells,
            "typeMetadataMismatches": type_mismatches,
            "protectedFormulaLikeCells": len(protected), "allProtectedCellsAreText": protected_as_text,
            "mismatchesAfterLineEndingNormalization": mismatches,
            "csvSHA256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "importedFodsSHA256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "passed": table_count == 1 and len(actual) == len(expected) and not all_formula_attributes and not mismatches and not type_mismatches and typed_dates == 30 and blank_dates == 10 and string_cells == 149 and protected_as_text,
        }
        results.append(result)

control_path = HERE / "control/positive-control.fods"
control_tree = ET.parse(control_path)
control_formula_cells = [node for node in control_tree.iter() if node.get(attr("table", "formula"))]
control_passed = (
    len(control_formula_cells) == 1
    and control_formula_cells[0].get(attr("table", "formula")) == "of:=1+1"
    and control_formula_cells[0].get(attr("office", "value-type")) == "float"
    and control_formula_cells[0].get(attr("office", "value")) == "2"
)
receipt = {
    "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "sourceCommit": "880e878f6f528d903c42951f10a8b216094c889c",
    "engineVersion": json.loads((HERE / "engine-invocations.json").read_text())["version"],
    "source": "https://help.libreoffice.org/latest/en-US/text/shared/guide/csv_params.html",
    "comparison": "Independent Python CSV reader versus actual Calc flat-ODS values and formula/type metadata. Only CRLF/CR to LF is normalized; original CSV files are unchanged.",
    "results": results,
    "positiveControl": {
        "input": "Deliberately unprotected arithmetic-only =1+1, separate from product exports.",
        "formulaCells": len(control_formula_cells), "computedValue": control_formula_cells[0].get(attr("office", "value")) if control_formula_cells else None,
        "actualFormulaEvaluationObserved": control_passed,
        "inputSHA256": hashlib.sha256((HERE / "positive-control.csv").read_bytes()).hexdigest(),
        "outputSHA256": hashlib.sha256(control_path.read_bytes()).hexdigest(),
    },
    "allPassed": all(row["passed"] for row in results) and control_passed,
    "limits": [
        "This is one installed development build of LibreOffice in headless mode, not a supported-release compatibility matrix.",
        "No GUI layout or user-selected import dialog was observed.",
        "CSV was generated directly by production code using synthetic data; browser download completion remains unverified.",
        "No Excel, Apple Numbers, Google Sheets or later user re-save/reopen guarantee is established.",
        "Calendar import, provider acceptance, account isolation and physical-device acceptance are not covered.",
    ],
}
(HERE / "verification.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"allPassed": receipt["allPassed"], "cases": len(results), "mismatches": sum(len(row["mismatchesAfterLineEndingNormalization"]) for row in results), "formulaAttributes": sum(row["formulaAttributes"] for row in results)}))
assert receipt["allPassed"], "Inspect verification.json for exact import differences"
