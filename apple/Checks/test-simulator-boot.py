#!/usr/bin/env python3
"""Offline parser regressions; these never invoke simctl or run a native test."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

CHECKS = Path(__file__).resolve().parent
FIXTURES = CHECKS / "Fixtures" / "SimulatorBoot"
SPEC = importlib.util.spec_from_file_location("simulator_boot", CHECKS / "verify-simulator-boot.py")
BOOT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BOOT)
FINISHED = (FIXTURES / "finished.log").read_text()
FAILED_BYTES = gzip.decompress((FIXTURES / "ci-44294650087-failed.log.gz").read_bytes())
FAILED = FAILED_BYTES.decode("utf-8")
GOOD_ID = "C9F9B041-95EB-4E12-8DD4-1FCD130CADCE"
FAILED_ID = "D26ED71E-9D97-4E79-B376-C104ABB9517A"
EXITS = {"boot": 0, "log": 0, "inventory": 0}


def inventory(device=GOOD_ID, **changes):
    # Constructed parser data, not evidence of any live simulator's state.
    return {"devices": {"com.apple.CoreSimulator.SimRuntime.iOS-fixture": [
        {"udid": device, "name": "Fixture iPhone", "isAvailable": True,
         "state": "Booted", **changes}
    ]}}


class SimulatorBootVerificationTests(unittest.TestCase):
    def test_actual_terminal_migration_failure_cannot_pass_with_exit_zero_and_booted_state(self):
        self.assertEqual(hashlib.sha256(FAILED_BYTES).hexdigest(),
                         "afdab1f19178b58ebc24811266f01a08d83fc3719d893f4907b19f78521835a2")
        result = BOOT.verify(FAILED, inventory(FAILED_ID), FAILED_ID, EXITS)
        self.assertFalse(result["passed"])
        self.assertEqual(result["bootObservation"]["finalStatus"]["status"], 3)
        self.assertIn("The boot log reports a failure.", result["reasons"])

    def test_recorded_finished_format_with_exact_available_booted_device(self):
        result = BOOT.verify(FINISHED, inventory(), GOOD_ID, EXITS)
        self.assertTrue(result["passed"], result["reasons"])
        self.assertEqual(result["bootObservation"]["finalStatus"]["status"], 4294967295)

    def test_prior_failed_status_is_not_erased_by_a_later_finished_message(self):
        failed_then_finished = FAILED + FINISHED.replace(
            "Monitoring boot status for TestFlutteriPhoneWithWatch (" + GOOD_ID + ").\n", ""
        )
        result = BOOT.verify(failed_then_finished, inventory(FAILED_ID), FAILED_ID, EXITS)
        self.assertFalse(result["passed"])
        self.assertEqual(result["bootObservation"]["terminalStatusCount"], 2)

    def test_finished_word_and_already_booted_shortcut_are_not_terminal_proof(self):
        for log in ("Finished\n", "Device already booted, nothing to do.\n", ""):
            with self.subTest(log=log):
                self.assertFalse(BOOT.verify(log, inventory(), GOOD_ID, EXITS)["passed"])

    def test_terminal_failure_or_unknown_status_cannot_be_relabelled_finished(self):
        for status in ("3", "4", "999", "not-a-number"):
            with self.subTest(status=status):
                log = FINISHED.replace("Status=4294967295", "Status=" + status)
                self.assertFalse(BOOT.verify(log, inventory(), GOOD_ID, EXITS)["passed"])

    def test_success_requires_final_terminal_record_and_exact_finished_tail(self):
        for log in (
            FINISHED.replace("isTerminal=YES", "isTerminal=NO"),
            FINISHED.replace("\tFinished", "\tFinished plugin com.apple.example"),
            FINISHED + "[2026-11-18 00:00:00 +0000] Status=2, isTerminal=NO, Elapsed=00:01.\n",
            FINISHED + "Data Migration Failed\n",
            FINISHED + "Unrecognized trailing output\n",
        ):
            with self.subTest(log=log):
                self.assertFalse(BOOT.verify(log, inventory(), GOOD_ID, EXITS)["passed"])

    def test_log_and_inventory_must_both_match_selected_device_exactly_once(self):
        absent = {"devices": {}}
        wrong = inventory(FAILED_ID)
        duplicate = inventory()
        duplicate["devices"]["another-runtime"] = list(next(iter(duplicate["devices"].values())))
        for value in (absent, wrong, duplicate):
            with self.subTest(inventory=value):
                self.assertFalse(BOOT.verify(FINISHED, value, GOOD_ID, EXITS)["passed"])
        self.assertFalse(BOOT.verify(FINISHED, inventory(FAILED_ID), FAILED_ID, EXITS)["passed"])
        self.assertFalse(BOOT.verify(FINISHED + FINISHED, inventory(), GOOD_ID, EXITS)["passed"])
        malformed_monitor = FINISHED.replace("\n[2020", "\nMonitoring boot status for another device (unknown).\n[2020")
        self.assertFalse(BOOT.verify(malformed_monitor, inventory(), GOOD_ID, EXITS)["passed"])
        self.assertFalse(BOOT.verify(FINISHED, inventory(), "invalid-device-id", EXITS)["passed"])

    def test_unavailable_or_not_booted_device_cannot_pass(self):
        for changes in (
            {"state": "Shutdown"}, {"state": "Booting"}, {"state": None},
            {"isAvailable": False}, {"isAvailable": "true"},
            {"availabilityError": "Runtime unavailable"},
        ):
            with self.subTest(changes=changes):
                self.assertFalse(BOOT.verify(FINISHED, inventory(**changes), GOOD_ID, EXITS)["passed"])

    def test_malformed_inventory_cannot_pass(self):
        for value in (None, [], {}, {"devices": []}, {"devices": {"runtime": "Booted"}},
                      {"devices": {"runtime": [None]}}):
            with self.subTest(value=value):
                self.assertFalse(BOOT.verify(FINISHED, value, GOOD_ID, EXITS)["passed"])

    def test_every_captured_process_result_must_succeed(self):
        for name in EXITS:
            with self.subTest(process=name):
                self.assertFalse(BOOT.verify(FINISHED, inventory(), GOOD_ID, {**EXITS, name: 7})["passed"])
        self.assertFalse(BOOT.verify(FINISHED, inventory(), GOOD_ID, {})["passed"])

    def run_cli(self, log, device, inventory_value):
        with tempfile.TemporaryDirectory(prefix="career-boot-parser-") as directory:
            root = Path(directory)
            boot = root / "boot.log"
            devices = root / "devices.json"
            receipt = root / "receipt.json"
            boot.write_text(log)
            devices.write_text(json.dumps(inventory_value))
            command = [sys.executable, str(CHECKS / "verify-simulator-boot.py"),
                       "--device", device, "--boot-log", str(boot), "--inventory", str(devices),
                       "--boot-exit", "0", "--log-exit", "0", "--inventory-exit", "0",
                       "--output", str(receipt)]
            process = subprocess.run(command, capture_output=True, text=True, timeout=5)
            result = json.loads(receipt.read_text())
            self.assertEqual(result["inputs"]["bootLog"]["sha256"], hashlib.sha256(boot.read_bytes()).hexdigest())
            self.assertEqual(result["inputs"]["deviceInventory"]["sha256"], hashlib.sha256(devices.read_bytes()).hexdigest())
            self.assertEqual(result["verifierSHA256"], hashlib.sha256((CHECKS / "verify-simulator-boot.py").read_bytes()).hexdigest())
            return process, result

    def test_cli_writes_hashed_success_and_failure_receipts_and_matching_exit_status(self):
        for log, device, value, passed in (
            (FINISHED, GOOD_ID, inventory(), True),
            (FAILED, FAILED_ID, inventory(FAILED_ID), False),
            (FINISHED, GOOD_ID, None, False),
        ):
            with self.subTest(passed=passed, device=device):
                process, receipt = self.run_cli(log, device, value)
                self.assertEqual(process.returncode, 0 if passed else 1, process.stderr)
                self.assertEqual(receipt["passed"], passed)
                self.assertEqual(receipt["selectedDeviceID"], device)


if __name__ == "__main__":
    unittest.main()
