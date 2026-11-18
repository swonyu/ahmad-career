#!/usr/bin/env python3
"""Exercise the workflow's real selection code using mocked simctl responses only."""
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest
from unittest.mock import patch

WORKFLOW = Path(__file__).resolve().parents[2] / '.github/workflows/phone-quality.yml'
BLOCK = WORKFLOW.read_text().split('      - name: Create a fresh iPhone on this disposable hosted runner\n', 1)[1]
SOURCE = textwrap.dedent(BLOCK.split('        run: |\n', 1)[1].split('\n      - name:', 1)[0])
CODE = compile(SOURCE, str(WORKFLOW), 'exec')
RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-26-5'
TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro'
OLD_ID = 'D26ED71E-9D97-4E79-B376-C104ABB9517A'
NEW_ID = '7A58BBF8-E79E-46C8-93AA-68987CE75950'
AIR_ID = '919E71ED-A69E-41D9-BCB1-0A259C2832D4'
NAME = 'CareerFinder-CI-12345-2'


def device(identifier=OLD_ID, name='iPhone 17 Pro', **changes):
    return {'udid': identifier, 'name': name, 'deviceTypeIdentifier': TYPE,
            'isAvailable': True, 'state': 'Shutdown', **changes}


def inventory():
    return {'devices': {
        'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [device('104D9314-C907-445F-A270-A0FE812F5986')],
        RUNTIME: [
            device(),
            device('583C001B-E00B-4B4C-8BC3-4DE9099838A2', 'iPhone 17 Pro Max',
                   deviceTypeIdentifier=TYPE + '-Max'),
            device(AIR_ID, 'iPhone Air',
                   deviceTypeIdentifier='com.apple.CoreSimulator.SimDeviceType.iPhone-Air'),
        ],
        'com.apple.CoreSimulator.SimRuntime.tvOS-27-0': [
            device('8FE08898-4FBF-4FD4-B91D-02D829247611', 'Apple TV',
                   deviceTypeIdentifier='com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K'),
        ],
    }}


class FreshSimulatorSelectionTests(unittest.TestCase):
    def execute(self, before=None, created=None, output=NEW_ID + '\n', create_error=None,
                architecture='arm64', error=None, expected_type=TYPE, expected_runtime=RUNTIME):
        before = inventory() if before is None else before
        after = copy.deepcopy(before)
        after['devices'].setdefault(expected_runtime, []).append(
            device(NEW_ID, NAME, deviceTypeIdentifier=expected_type))
        if created is not None:
            after = created
        calls = []

        def simctl(command, **kwargs):
            calls.append(command)
            if command == ['xcrun', 'simctl', 'list', 'devices', 'available', '--json']:
                return json.dumps(before if len(calls) == 1 else after).encode()
            self.assertEqual(command, ['xcrun', 'simctl', 'create', NAME, expected_type, expected_runtime])
            self.assertTrue(kwargs.get('text'))
            if create_error:
                raise create_error
            return output

        with tempfile.TemporaryDirectory(prefix='career-selection-fixture-') as folder:
            root = Path(folder)
            env_file = root / 'github-env'
            env_file.touch()
            env = {'GITHUB_RUN_ID': '12345', 'GITHUB_RUN_ATTEMPT': '2', 'GITHUB_SHA': 'fixture-sha',
                   'GITHUB_ENV': str(env_file), 'RUNNER_TEMP': folder}
            with patch.dict(os.environ, env), patch('subprocess.check_output', side_effect=simctl), \
                 patch('platform.machine', return_value=architecture), contextlib.redirect_stdout(io.StringIO()) as messages:
                if error:
                    with self.assertRaises(error):
                        exec(CODE, {})
                else:
                    exec(CODE, {})
            receipt_path = root / 'career-iphone-selection.json'
            receipt = json.loads(receipt_path.read_text()) if receipt_path.exists() else None
            environment = env_file.read_text()
            if error:
                self.assertEqual(environment, '', 'A failed creation/verification must not publish a fallback device.')
                self.assertIsNone(receipt)
            return calls, environment, receipt, messages.getvalue()

    def test_regular_size_numbered_pro_is_selected_before_alphabetically_later_air(self):
        calls, environment, receipt, messages = self.execute()
        self.assertEqual(len(calls), 3)
        self.assertEqual(environment, 'CAREER_UI_DEVICE=' + NEW_ID + '\nCAREER_UI_ARCH=arm64\n')
        self.assertEqual(receipt['sourceDevice']['udid'], OLD_ID)
        self.assertEqual(receipt['sourceDevice']['runtime'], RUNTIME)
        self.assertEqual(receipt['sourceDevice']['deviceTypeIdentifier'], TYPE)
        self.assertEqual(receipt['createdDevice']['udid'], NEW_ID)
        self.assertEqual(receipt['createdDevice']['state'], 'Shutdown')
        self.assertEqual(receipt['checkoutSHA'], 'fixture-sha')
        self.assertIn('Selected iPhone 17 Pro on iOS 26.5 architecture arm64', messages)

    def test_latest_runtime_still_precedes_hardware_preference(self):
        before = inventory()
        latest = 'com.apple.CoreSimulator.SimRuntime.iOS-27-0'
        air_type = 'com.apple.CoreSimulator.SimDeviceType.iPhone-Air'
        before['devices'][latest] = [device(AIR_ID, 'iPhone Air', deviceTypeIdentifier=air_type)]
        _, _, receipt, _ = self.execute(before=before, expected_type=air_type, expected_runtime=latest)
        self.assertEqual(receipt['sourceDevice']['runtime'], latest)
        self.assertEqual(receipt['sourceDevice']['deviceTypeIdentifier'], air_type)

    def test_regular_numbered_phone_precedes_air_when_pro_is_absent(self):
        before = inventory()
        base_type = 'com.apple.CoreSimulator.SimDeviceType.iPhone-17'
        before['devices'][RUNTIME][0] = device(name='iPhone 17', deviceTypeIdentifier=base_type)
        _, _, receipt, _ = self.execute(before=before, expected_type=base_type)
        self.assertEqual(receipt['sourceDevice']['name'], 'iPhone 17')

    def test_newest_hardware_generation_is_ranked_numerically(self):
        before = {'devices': {RUNTIME: [
            device(name='iPhone 9 Pro', deviceTypeIdentifier='com.apple.CoreSimulator.SimDeviceType.iPhone-9-Pro'),
            device('583C001B-E00B-4B4C-8BC3-4DE9099838A2', 'iPhone 17',
                   deviceTypeIdentifier='com.apple.CoreSimulator.SimDeviceType.iPhone-17'),
        ]}}
        _, _, receipt, _ = self.execute(
            before=before, expected_type='com.apple.CoreSimulator.SimDeviceType.iPhone-17')
        self.assertEqual(receipt['sourceDevice']['name'], 'iPhone 17')

    def test_unavailable_preferred_device_does_not_override_available_model(self):
        before = inventory()
        before['devices'][RUNTIME][0]['isAvailable'] = False
        air_type = 'com.apple.CoreSimulator.SimDeviceType.iPhone-Air'
        _, _, receipt, _ = self.execute(before=before, expected_type=air_type)
        self.assertEqual(receipt['sourceDevice']['udid'], AIR_ID)

    def test_x86_runner_architecture_is_preserved(self):
        _, environment, receipt, _ = self.execute(architecture='x86_64')
        self.assertIn('CAREER_UI_ARCH=x86_64\n', environment)
        self.assertEqual(receipt['architecture'], 'x86_64')

    def test_creation_failure_cannot_fall_back_to_preexisting_device(self):
        calls, _, _, _ = self.execute(
            create_error=subprocess.CalledProcessError(1, ['simctl', 'create']),
            error=subprocess.CalledProcessError)
        self.assertEqual(len(calls), 2)

    def test_invalid_or_existing_create_identifier_is_rejected(self):
        for output in ('', 'not-a-uuid', NEW_ID + '\n' + OLD_ID, OLD_ID.lower()):
            with self.subTest(output=output):
                calls, _, _, _ = self.execute(output=output, error=AssertionError)
                self.assertEqual(len(calls), 2)

    def test_created_device_must_match_exactly_and_be_available_for_a_cold_boot(self):
        values = [{'devices': {}}, {'devices': {RUNTIME: [device(NEW_ID, NAME), device(NEW_ID, NAME)]}},
                  {'devices': {'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [device(NEW_ID, NAME)]}}]
        for changes in ({'state': 'Booted'}, {'isAvailable': False}, {'availabilityError': 'Unavailable'},
                        {'deviceTypeIdentifier': TYPE + '-Max'}, {'name': 'Different device'}):
            value = device(NEW_ID, NAME)
            value.update(changes)
            values.append({'devices': {RUNTIME: [value]}})
        for value in values:
            with self.subTest(value=value):
                self.execute(created=value, error=AssertionError)

    def test_missing_device_type_or_unsupported_architecture_stops_before_creation(self):
        before = {'devices': {RUNTIME: [device(deviceTypeIdentifier=None)]}}
        calls, _, _, _ = self.execute(before=before, error=AssertionError)
        self.assertEqual(len(calls), 1)
        calls, _, _, _ = self.execute(architecture='unknown', error=AssertionError)
        self.assertEqual(len(calls), 1)

    def test_runtime_below_ui_test_target_minimum_stops_before_creation(self):
        before = {'devices': {'com.apple.CoreSimulator.SimRuntime.iOS-16-6': [device()]}}
        calls, _, _, _ = self.execute(before=before, error=AssertionError)
        self.assertEqual(len(calls), 1)

    def test_no_eligible_phone_stops_before_creation(self):
        before = {'devices': {'com.apple.CoreSimulator.SimRuntime.iOS-15-0': [device()],
                              RUNTIME: [device(name='iPad Pro'), device(isAvailable=False)]}}
        calls, _, _, _ = self.execute(before=before, error=AssertionError)
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
