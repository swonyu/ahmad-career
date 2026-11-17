"""Compare actual Calc output with CSV using independent standard-library readers."""
from pathlib import Path
import csv
import datetime
import hashlib
import json
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
NS = {"table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0", "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0", "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0"}


def attr(kind, name):
    return "{" + NS[kind] + "}" + name


def content(element):
    if element.tag == attr("text", "s"):
        return " " * int(element.get(attr("text", "c"), "1"))
    if element.tag == attr("text", "tab"):
        return "\t"
    if element.tag == attr("text", "line-break"):
        return "\n"
    return (element.text or "") + "".join(content(child) + (child.tail or "") for child in element)


results = []
generated = json.loads((HERE / "fixture-generation.json").read_text())
for mode in ("default", "quoted-as-text"):
    for language in ("en", "ar"):
        source = HERE / ("career-records-" + language + ".csv")
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        assert digest == next(row["sha256"] for row in generated["files"] if row["language"] == language)
        with source.open(encoding="utf-8-sig", newline="") as stream:
            expected = list(csv.reader(stream))
        assert len(expected) == 7 and all(len(row) == 9 for row in expected)
        output = HERE / mode / ("career-records-" + language + ".fods")
        tree = ET.parse(output)
        assert len(tree.findall(".//table:table", NS)) == 1
        actual, metadata = [], []
        for row in tree.findall(".//table:table-row", NS):
            assert int(row.get(attr("table", "number-rows-repeated"), "1")) == 1
            values, types = [], []
            for cell in row.findall("table:table-cell", NS):
                repeat = int(cell.get(attr("table", "number-columns-repeated"), "1"))
                assert repeat <= 9
                value = "\n".join(content(p) for p in cell.findall("text:p", NS))
                values += [value] * repeat
                types += [cell.attrib] * repeat
            actual.append(values)
            metadata.append(types)
        assert len(actual) == 7 and all(len(row) == 9 for row in actual)
        mismatches, nontext, coerced_free_text = [], [], []
        for row in range(7):
            for column in range(9):
                wanted, found, fields = expected[row][column], actual[row][column], metadata[row][column]
                if wanted != found:
                    mismatches.append({"row": row + 1, "column": column + 1, "expected": wanted, "actual": found})
                kind = fields.get(attr("office", "value-type"))
                if not wanted:
                    assert not found and kind in (None, "string"), (row, column, fields)
                    assert fields.get(attr("office", "string-value"), "") == "", (row, column, fields)
                    assert not any(attr("office", name) in fields for name in ("value", "date-value", "time-value", "boolean-value", "currency")), (row, column, fields)
                if wanted and kind != "string":
                    entry = {"row": row + 1, "column": column + 1, "original": wanted, "type": kind, "displayed": found, "stored": fields.get(attr("office", "value"), fields.get(attr("office", "date-value")))}
                    nontext.append(entry)
                    if 1 <= row <= 4 and column in (0, 1, 7):
                        coerced_free_text.append(entry)
                if kind == "string":
                    assert fields.get(attr("office", "string-value"), found) == found
        formulas = [element.get(attr("table", "formula")) for element in tree.iter() if element.get(attr("table", "formula"))]
        protected = [(6, column) for column in (0, 1, 7)]
        assert all(actual[row][column] == "Text: =1+1" and metadata[row][column].get(attr("office", "value-type")) == "string" for row, column in protected)
        assert not formulas
        if mode == "quoted-as-text":
            assert not mismatches and not nontext, (mismatches, nontext)
        else:
            assert coerced_free_text, "Default coercion must be observed before claiming the guidance is reproduced"
        results.append({"mode": mode, "language": language, "rowsIncludingHeader": 7, "columns": 9, "displayValuesCompared": 63, "emptyCellsCheckedForHiddenStoredValues": sum(not cell for row in expected for cell in row), "displayMismatches": mismatches, "nontextNonemptyCells": nontext, "coercedFreeText": coerced_free_text, "formulaAttributes": 0, "protectedFormulaLikeCellsRemainLiteral": 3, "csvSHA256": digest, "fodsSHA256": hashlib.sha256(output.read_bytes()).hexdigest(), "documentedTextImportPreservesValues": mode == "quoted-as-text" and not mismatches and not nontext})
receipt = {"observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "exporterSourceCommit": generated["unchangedExporterSourceCommit"], "sourceHashes": generated["sourceHashes"], "engineVersion": json.loads((HERE / "engine-invocations.json").read_text())["version"], "results": results, "limits": ["Default import intentionally documents coercion, not a successful exact-text preservation result.", "Quoted-as-text imports preserve intended date columns as strings too; users may deliberately convert them after import.", "No GUI, browser file-save, other spreadsheet product, later save/reopen or calendar acceptance.", "The serializer and stored user values were not changed."]}
(HERE / "verification.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"checks": [{"mode": row["mode"], "language": row["language"], "displayMismatches": len(row["displayMismatches"]), "coercedFreeText": len(row["coercedFreeText"]), "textImportPreservesValues": row["documentedTextImportPreservesValues"]} for row in results]}))
