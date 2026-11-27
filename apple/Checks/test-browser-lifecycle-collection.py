#!/usr/bin/env python3
"""Synthetic collector checks only; never starts simctl, a device, or a native build."""
import importlib.util
import json
import os
from pathlib import Path
import re
import tempfile
from types import SimpleNamespace
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

def focus_record(event="keyboard_did_show", field="company", uptime=12.0):
    return {"event": event, "field": field, "uptime": uptime,
            "flags": {key: False for key in module.FOCUS_EVENT_FLAGS[event]}}

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

class FocusLifecycleCollectionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.namespace = self.base / "acceptance"
        self.source = self.namespace / SCOPE / module.FOCUS_LOG_NAME
        self.source.parent.mkdir(parents=True)
        self.output = self.base / "collected"
    def tearDown(self):
        self.temporary.cleanup()
    def test_only_original_allowlisted_focus_metadata_is_exported(self):
        original = encoded(focus_record(), focus_record("text_editing_began", "company", 12.1))
        self.source.write_bytes(original)
        result = module.collect(self.namespace, self.output, kind="focus")
        self.assertEqual(result["status"], "copied")
        self.assertEqual((self.output / (SCOPE + ".jsonl")).read_bytes(), original)
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual(result["files"][0]["bytes"], len(original))
        self.assertTrue(result["files"][0]["sourceReadTwiceMatched"])
    def test_private_unbounded_or_malformed_focus_logs_are_not_exported(self):
        cases = []
        value = focus_record(); value["email"] = "private-fixture@example.invalid"; cases.append(encoded(value))
        value = focus_record(); value["field"] = "private-fixture-employer"; cases.append(encoded(value))
        value = focus_record(); value["event"] = "private-fixture-event"; cases.append(encoded(value))
        value = focus_record(); value["flags"]["rawIdentifier"] = True; cases.append(encoded(value))
        value = focus_record(); value["flags"]["nativeHasWindow"] = 1; cases.append(encoded(value))
        value = focus_record(); value["uptime"] = float("nan"); cases.append(encoded(value))
        value = focus_record("capacity_reached", "company"); value["flags"]["capacityReached"] = True; cases.append(encoded(value))
        cases.append(encoded(focus_record())[:-1])
        cases.append(b"x" * (module.MAX_BYTES + 1))
        cases.append(b'{"event":"private-fixture-event","event":"capacity_reached","field":"none","uptime":1,"flags":{"capacityReached":true}}\n')
        for index, original in enumerate(cases):
            with self.subTest(index=index):
                self.source.write_bytes(original)
                target = self.base / ("invalid-" + str(index))
                result = module.collect(self.namespace, target, kind="focus")
                self.assertEqual(result["status"], "failed_closed")
                self.assertFalse(list(target.glob("*.jsonl")))
                self.assertNotIn("private-fixture", json.dumps(result))
    def test_focus_collector_does_not_follow_links_or_copy_browser_log(self):
        browser = self.source.parent / module.LOG_NAME
        browser.write_bytes(encoded(record()))
        absent = module.collect(self.namespace, self.output, kind="focus")
        self.assertEqual(absent["status"], "no_logs")
        self.source.symlink_to(browser)
        result = module.collect(self.namespace, self.base / "linked", kind="focus")
        self.assertEqual(result["status"], "failed_closed")
        self.assertFalse(list((self.base / "linked").glob("*.jsonl")))
    def test_owned_ci_command_selects_only_the_focus_trace(self):
        container = self.base / "app-container"
        namespace = container / "Library/Application Support/CareerFinderUIAcceptance"
        scope = namespace / SCOPE
        scope.mkdir(parents=True)
        original = encoded(focus_record())
        (scope / module.FOCUS_LOG_NAME).write_bytes(original)
        (scope / module.LOG_NAME).write_bytes(encoded(record()))
        selection = self.base / "selection.json"
        checkout = "a" * 40
        selection.write_text(json.dumps({"createdDevice": {"udid": SCOPE}, "checkoutSHA": checkout}))
        arguments = ["collect-browser-lifecycle.py", "--kind", "focus", "--selection", str(selection),
                     "--device", SCOPE, "--output", str(self.output)]
        environment = {"GITHUB_ACTIONS": "true", "RUNNER_OS": "macOS", "GITHUB_SHA": checkout}
        lookup = SimpleNamespace(returncode=0, stdout=str(container) + "\n")
        with patch.dict(os.environ, environment), patch("sys.argv", arguments), patch.object(module.subprocess, "run", return_value=lookup):
            self.assertEqual(module.main(), 0)
        self.assertEqual((self.output / (SCOPE + ".jsonl")).read_bytes(), original)
        self.assertEqual(json.loads((self.output / "manifest.json").read_text())["files"][0]["bytes"], len(original))
    def test_swift_focus_allowlists_match_export_schema(self):
        swift = (HERE.parent / "AhmadCareer/CareerAppEnvironment.swift").read_text()
        events = re.search(r"enum OpportunityFocusEvent: String \{(.*?)\n    \}", swift, re.S).group(1)
        fields = re.search(r"enum OpportunityFocusField: String \{(.*?)\n    \}", swift, re.S).group(1)
        flags = re.search(r"enum OpportunityFocusFlag: String \{(.*?)\n    \}", swift, re.S).group(1)
        self.assertEqual(set(re.findall(r'= "([a-z_]+)"', events)), set(module.FOCUS_EVENT_FLAGS))
        self.assertEqual(set(re.search(r"\bcase ([^\n]+)", fields).group(1).replace(" ", "").split(",")), module.FOCUS_FIELDS)
        swift_flags = {name.strip() for line in re.findall(r"\bcase ([^\n]+)", flags) for name in line.split(",")}
        self.assertEqual(swift_flags, set().union(*module.FOCUS_EVENT_FLAGS.values()))
        logger = swift.split("static func recordOpportunityFocus(", 1)[1]
        payload = re.search(r"JSONSerialization\.data\(withJSONObject: \[(.*?)\], options:", logger, re.S).group(1)
        self.assertEqual(set(re.findall(r'"([a-z]+)"\s*:', payload)), {"event", "field", "uptime", "flags"})

if __name__ == "__main__":
    unittest.main()
