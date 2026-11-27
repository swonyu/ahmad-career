#!/usr/bin/env python3
"""Synthetic collector checks only; never starts simctl, a device, or a native build."""
import importlib.util
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("browser_lifecycle_collector", HERE / "collect-browser-lifecycle.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SCOPE = "004B949E-334F-4C1B-A6C4-B199AAAE5906"

def record(event="present_completed", uptime=12.0):
    return {"event": event, "uptime": uptime, "flags": {key: False for key in module.EVENT_FLAGS[event]}}

def encoded(*records):
    return b"".join((json.dumps(value) + "\n").encode() for value in records)

class BrowserLifecycleCollectionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.namespace = self.base / "acceptance"
        self.source = self.namespace / SCOPE / module.LOG_NAME
        self.source.parent.mkdir(parents=True)
        self.output = self.base / "collected"
    def tearDown(self):
        self.temporary.cleanup()
    def test_original_bytes_are_copied_without_rewriting(self):
        original = encoded(record(), record("delegate_did_finish", 12.1))
        self.source.write_bytes(original)
        result = module.collect(self.namespace, self.output)
        self.assertEqual(result["status"], "copied")
        self.assertEqual((self.output / (SCOPE + ".jsonl")).read_bytes(), original)
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual(result["files"][0]["records"], 2)
        self.assertTrue(result["files"][0]["sourceReadTwiceMatched"])
        self.assertEqual(result["files"][0]["sourceModificationTimeNs"], self.source.stat().st_mtime_ns)
        self.assertTrue(result["files"][0]["uptimeNondecreasing"])
    def test_private_or_malformed_values_are_not_exported(self):
        bad = []
        value = record(); value["email"] = "private-fixture@example.invalid"; bad.append(encoded(value))
        value = record(); value["event"] = "private-fixture-name"; bad.append(encoded(value))
        value = record(); value["flags"]["private-fixture-name"] = True; bad.append(encoded(value))
        value = record(); value["flags"]["hasTrackedBrowser"] = 1; bad.append(encoded(value))
        value = record(); value["uptime"] = float("nan"); bad.append(encoded(value))
        value = record(); value["uptime"] = True; bad.append(encoded(value))
        value = record(); value["uptime"] = 10 ** 400; bad.append(encoded(value))
        bad.append(b"[" * 2000 + b"0" + b"]" * 2000 + b"\n")
        bad.append(encoded(record())[:-1])
        bad.append(b'{"event":"private-fixture-name","event":"capacity_reached","uptime":1,"flags":{"capacityReached":true}}\n')
        for index, original in enumerate(bad):
            with self.subTest(index=index):
                self.source.write_bytes(original)
                target = self.base / ("invalid-" + str(index))
                result = module.collect(self.namespace, target)
                self.assertEqual(result["status"], "failed_closed")
                self.assertFalse(list(target.glob("*.jsonl")))
                self.assertNotIn("private-fixture", json.dumps(result))
    def test_oversized_or_linked_log_is_rejected(self):
        self.source.write_bytes(b"x" * (module.MAX_BYTES + 1))
        self.assertEqual(module.collect(self.namespace, self.output)["status"], "failed_closed")
        self.source.unlink()
        private = self.base / "outside.txt"; private.write_bytes(encoded(record()))
        self.source.symlink_to(private)
        result = module.collect(self.namespace, self.base / "linked")
        self.assertEqual(result["status"], "failed_closed")
        self.assertFalse(list((self.base / "linked").glob("*.jsonl")))
    def test_changing_source_is_not_promoted_to_original(self):
        first, second = encoded(record()), encoded(record(uptime=13))
        self.source.write_bytes(first)
        with patch.object(module, "bounded_read", side_effect=[first, second]):
            result = module.collect(self.namespace, self.output)
        self.assertEqual(result["status"], "failed_closed")
        self.assertFalse(list(self.output.glob("*.jsonl")))
    def test_capacity_and_clock_limits_are_explicit(self):
        capped = record("capacity_reached", 14); capped["flags"]["capacityReached"] = True
        self.source.write_bytes(encoded(record(uptime=15), capped))
        result = module.collect(self.namespace, self.output)
        self.assertEqual(result["status"], "copied")
        self.assertTrue(result["files"][0]["capacityReached"])
        self.assertFalse(result["files"][0]["uptimeNondecreasing"])
        self.assertIn("do not establish", result["boundary"])
    def test_absent_logs_are_not_presented_as_callback_evidence(self):
        result = module.collect(self.namespace, self.output)
        self.assertEqual(result["status"], "no_logs")
        self.assertEqual(result["files"], [])
    def test_owned_selection_cannot_target_a_different_device_or_revision(self):
        selection = {"createdDevice": {"udid": SCOPE}, "checkoutSHA": "a" * 40}
        module.validate_selection(selection, SCOPE, "a" * 40)
        for invalid in [[], {}, {"createdDevice": []}]:
            with self.assertRaises(module.CollectionFailure):
                module.validate_selection(invalid, SCOPE, "a" * 40)
        for device, revision in [("104B949E-334F-4C1B-A6C4-B199AAAE5906", "a" * 40), (SCOPE, "b" * 40)]:
            with self.assertRaises(module.CollectionFailure):
                module.validate_selection(selection, device, revision)
    def test_collector_names_match_actual_swift_allowlists(self):
        swift = (HERE.parent / "AhmadCareer/CareerAppEnvironment.swift").read_text()
        events = re.search(r"enum BrowserLifecycleEvent: String \{(.*?)\n    \}", swift, re.S).group(1)
        flags = re.search(r"enum BrowserLifecycleFlag: String \{(.*?)\n    \}", swift, re.S).group(1)
        self.assertEqual(set(re.findall(r'= "([a-z_]+)"', events)), set(module.EVENT_FLAGS))
        swift_flags = {name.strip() for line in re.findall(r"\bcase ([^\n]+)", flags) for name in line.split(",")}
        self.assertEqual(swift_flags, set().union(*module.EVENT_FLAGS.values()))

if __name__ == "__main__":
    unittest.main()
