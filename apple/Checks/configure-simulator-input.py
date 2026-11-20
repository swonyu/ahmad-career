#!/usr/bin/env python3
"""Set one fresh CI simulator's stored keyboard preference; never claim UI readiness."""

import argparse
import ctypes
import datetime
import hashlib
import json
import os
import pathlib
import plistlib
import re
import stat
import subprocess
import sys

DOMAIN = "com.apple.iphonesimulator"
UUID_PATTERN = r"[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}"


class ConfigurationError(Exception):
    """A bounded, non-sensitive precondition or configuration failure."""


def require(condition, message):
    if not condition:
        raise ConfigurationError(message)


def command(args, label):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError, UnicodeError) as error:
        raise ConfigurationError(label + " could not complete (" + type(error).__name__ + ").") from error
    require(result.returncode == 0, label + " failed with exit " + str(result.returncode) + ".")
    return result.stdout


class Preferences:
    """Minimal exact-domain CoreFoundation bridge; borrowed references stay borrowed."""

    def __init__(self):
        self.owned = []
        self.lib = ctypes.CDLL("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
        ref, index, type_id, boolean = ctypes.c_void_p, ctypes.c_long, ctypes.c_ulong, ctypes.c_ubyte
        signatures = {
            "CFStringCreateWithCString": (ref, [ref, ctypes.c_char_p, ctypes.c_uint32]),
            "CFStringGetTypeID": (type_id, []),
            "CFStringGetLength": (index, [ref]),
            "CFStringGetMaximumSizeForEncoding": (index, [index, ctypes.c_uint32]),
            "CFStringGetCString": (boolean, [ref, ctypes.POINTER(ctypes.c_char), index, ctypes.c_uint32]),
            "CFGetTypeID": (type_id, [ref]),
            "CFDictionaryGetTypeID": (type_id, []),
            "CFDictionaryGetCount": (index, [ref]),
            "CFDictionaryGetValue": (ref, [ref, ref]),
            "CFDictionaryGetKeysAndValues": (None, [ref, ctypes.POINTER(ref), ctypes.POINTER(ref)]),
            "CFDictionaryCreateMutable": (ref, [ref, index, ref, ref]),
            "CFDictionaryCreateMutableCopy": (ref, [ref, index, ref]),
            "CFDictionarySetValue": (None, [ref, ref, ref]),
            "CFBooleanGetTypeID": (type_id, []),
            "CFBooleanGetValue": (boolean, [ref]),
            "CFPreferencesCopyMultiple": (ref, [ref, ref, ref, ref]),
            "CFPreferencesSetValue": (None, [ref, ref, ref, ref, ref]),
            "CFPreferencesSynchronize": (boolean, [ref, ref, ref]),
            "CFEqual": (boolean, [ref, ref]),
            "CFRelease": (None, [ref]),
        }
        for name, (result, arguments) in signatures.items():
            function = getattr(self.lib, name)
            function.restype, function.argtypes = result, arguments
        self.user = ref.in_dll(self.lib, "kCFPreferencesCurrentUser").value
        self.host = ref.in_dll(self.lib, "kCFPreferencesAnyHost").value
        self.false = ref.in_dll(self.lib, "kCFBooleanFalse").value
        require(self.user and self.host and self.false, "CoreFoundation preference constants are unavailable.")
        self.domain = self.string(DOMAIN)

    def own(self, value):
        require(value, "CoreFoundation did not return the required object.")
        self.owned.append(value)
        return value

    def close(self):
        while self.owned:
            self.lib.CFRelease(self.owned.pop())

    def string(self, text):
        return self.own(self.lib.CFStringCreateWithCString(None, text.encode("utf-8"), 0x08000100))

    def dictionary(self, value, label):
        require(value and self.lib.CFGetTypeID(value) == self.lib.CFDictionaryGetTypeID(),
                label + " must be a CoreFoundation dictionary.")
        return value

    def copy_dictionary(self, value):
        if value:
            self.dictionary(value, "Existing preference value")
            return self.own(self.lib.CFDictionaryCreateMutableCopy(None, 0, value))
        # These exported symbols are callback structures, not object-reference constants.
        keys = ctypes.addressof(ctypes.c_byte.in_dll(self.lib, "kCFTypeDictionaryKeyCallBacks"))
        values = ctypes.addressof(ctypes.c_byte.in_dll(self.lib, "kCFTypeDictionaryValueCallBacks"))
        return self.own(self.lib.CFDictionaryCreateMutable(None, 0, keys, values))

    def synchronize(self):
        require(self.lib.CFPreferencesSynchronize(self.domain, self.user, self.host),
                "Simulator preference synchronization failed.")

    def read_domain(self):
        # CopyMultiple returns a dictionary, including an empty dictionary for absent values.
        # A NULL or wrong-type response is an error, never a fallback to empty preferences.
        value = self.own(self.lib.CFPreferencesCopyMultiple(None, self.domain, self.user, self.host))
        return self.dictionary(value, "Simulator preference domain")

    def string_value(self, value):
        require(self.lib.CFGetTypeID(value) == self.lib.CFStringGetTypeID(),
                "DevicePreferences contains a non-string key.")
        length = self.lib.CFStringGetLength(value)
        maximum = self.lib.CFStringGetMaximumSizeForEncoding(length, 0x08000100)
        require(0 <= maximum <= 4096, "A DevicePreferences key has an unsupported size.")
        buffer = ctypes.create_string_buffer(maximum + 1)
        require(self.lib.CFStringGetCString(value, buffer, maximum + 1, 0x08000100),
                "A DevicePreferences key could not be read.")
        return buffer.value.decode("utf-8")

    def reject_uuid_aliases(self, devices, identifier):
        if not devices:
            return
        count = self.lib.CFDictionaryGetCount(devices)
        require(0 <= count <= 10000, "DevicePreferences has an unsupported entry count.")
        keys = (ctypes.c_void_p * count)()
        self.lib.CFDictionaryGetKeysAndValues(devices, keys, None)
        names = [self.string_value(key) for key in keys]
        aliases = [name for name in names if name.casefold() == identifier.casefold()]
        require(aliases in ([], [identifier]), "DevicePreferences contains an ambiguous owned-UUID alias.")

    def boolean_state(self, value):
        if not value:
            return {"present": False}
        require(self.lib.CFGetTypeID(value) == self.lib.CFBooleanGetTypeID(),
                "The owned keyboard preference must be a Boolean when present.")
        return {"present": True, "value": bool(self.lib.CFBooleanGetValue(value)), "type": "CFBoolean"}


def validate_backing_file():
    # Read only to distinguish a genuinely missing file from corrupt/unreadable data.
    # All mutation and synchronization go through CFPreferences, never plist-file edits.
    path = pathlib.Path.home() / "Library/Preferences" / (DOMAIN + ".plist")
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return "absent"
    require(stat.S_ISREG(metadata.st_mode), "The existing Simulator preference file must be a regular file.")
    try:
        with path.open("rb") as stream:
            value = plistlib.load(stream)
    except (OSError, ValueError, plistlib.InvalidFileException) as error:
        raise ConfigurationError("The existing Simulator preference file is unreadable or malformed.") from error
    require(isinstance(value, dict), "The existing Simulator preference file must contain a dictionary.")
    return "readable-dictionary"


def validate_owner(args, receipt):
    require(sys.platform == "darwin" and os.environ.get("GITHUB_ACTIONS") == "true",
            "This helper only runs on the disposable macOS GitHub Actions runner.")
    run = os.environ.get("GITHUB_RUN_ID", "")
    attempt = os.environ.get("GITHUB_RUN_ATTEMPT", "")
    checkout = os.environ.get("GITHUB_SHA", "")
    require(run.isdigit() and attempt.isdigit() and int(attempt) > 0, "Missing valid run identity.")
    require(re.fullmatch(r"[A-Fa-f0-9]{40}", checkout), "Missing valid workflow checkout identity.")
    require(re.fullmatch(UUID_PATTERN, args.device), "The requested device is not one UUID.")
    identifier = args.device.upper()
    require(os.environ.get("CAREER_UI_DEVICE", "").upper() == identifier, "The selected device environment disagrees.")
    receipt.update(runID=run, runAttempt=attempt, checkoutSHA=checkout, requestedDeviceUUID=identifier)
    with pathlib.Path(args.selection).open("rb") as stream:
        selection = json.load(stream)
    require(selection.get("schemaVersion") == 1, "Unsupported selection receipt schema.")
    require(selection.get("runID") == run and selection.get("runAttempt") == attempt
            and selection.get("checkoutSHA") == checkout, "The selection receipt is not from this exact run and checkout.")
    created = selection.get("createdDevice")
    require(isinstance(created, dict), "The selection receipt lacks its created device.")
    expected_name = "CareerFinder-CI-" + run + "-" + attempt
    require(str(created.get("udid", "")).upper() == identifier and created.get("name") == expected_name
            and created.get("state") == "Shutdown" and created.get("isAvailable") is True,
            "The selection receipt does not identify the owned fresh Shutdown device.")
    version_text = command(["xcodebuild", "-version"], "Xcode version read")
    version = re.search(r"^Xcode ([0-9.]+)$", version_text, re.MULTILINE)
    receipt["observedXcodeVersion"] = version.group(1) if version else None
    require(version is not None and version.group(1) == "26.6",
            "This stored-preference hardening must be reviewed for the observed Xcode version.")
    inventory = json.loads(command(["xcrun", "simctl", "list", "devices", identifier, "--json"],
                                   "Owned simulator inventory read"))
    matches = [(runtime, device) for runtime, devices in inventory["devices"].items() for device in devices
               if str(device.get("udid", "")).upper() == identifier]
    require(len(matches) == 1, "The owned UUID must occur exactly once in the current inventory.")
    runtime, current = matches[0]
    require(current.get("name") == expected_name and current.get("state") == "Shutdown"
            and current.get("isAvailable") is True and not current.get("availabilityError")
            and runtime == created.get("runtime")
            and current.get("deviceTypeIdentifier") == created.get("deviceTypeIdentifier"),
            "The owned fresh simulator changed identity or is not available and Shutdown.")
    receipt.update(runID=run, runAttempt=attempt, checkoutSHA=checkout, deviceUUID=identifier,
                   deviceName=expected_name, runtime=runtime, xcodeVersion=version.group(1),
                   ownershipAndShutdownVerified=True)
    return identifier


def configure(identifier, receipt):
    receipt["backingFileState"] = validate_backing_file()
    preferences = Preferences()
    try:
        preferences.synchronize()
        before = preferences.read_domain()
        device_key = preferences.string("DevicePreferences")
        uuid_key = preferences.string(identifier)
        keyboard_key = preferences.string("ConnectHardwareKeyboard")
        devices = preferences.lib.CFDictionaryGetValue(before, device_key)
        if devices:
            preferences.dictionary(devices, "DevicePreferences")
        preferences.reject_uuid_aliases(devices, identifier)
        device = preferences.lib.CFDictionaryGetValue(devices, uuid_key) if devices else None
        if device:
            preferences.dictionary(device, "The owned device preference entry")
        old = preferences.lib.CFDictionaryGetValue(device, keyboard_key) if device else None
        receipt["previousOwnedPreference"] = preferences.boolean_state(old)
        expected_device = preferences.copy_dictionary(device)
        preferences.lib.CFDictionarySetValue(expected_device, keyboard_key, preferences.false)
        expected_devices = preferences.copy_dictionary(devices)
        preferences.lib.CFDictionarySetValue(expected_devices, uuid_key, expected_device)
        expected_domain = preferences.copy_dictionary(before)
        preferences.lib.CFDictionarySetValue(expected_domain, device_key, expected_devices)
        # Detect drift before the one write. CFPreferences has no compare-and-swap:
        # this relies on the exclusive disposable runner and still checks after writing.
        preferences.synchronize()
        latest = preferences.read_domain()
        require(preferences.lib.CFEqual(before, latest), "Simulator preferences changed before configuration.")
        receipt["writeAttempted"] = True
        preferences.lib.CFPreferencesSetValue(device_key, expected_devices, preferences.domain,
                                             preferences.user, preferences.host)
        preferences.synchronize()
        after = preferences.read_domain()
        require(preferences.lib.CFEqual(after, expected_domain),
                "Readback differs from the exact owned-device change; refusing to continue.")
        read_devices = preferences.dictionary(preferences.lib.CFDictionaryGetValue(after, device_key),
                                              "Readback DevicePreferences")
        read_device = preferences.dictionary(preferences.lib.CFDictionaryGetValue(read_devices, uuid_key),
                                             "Readback owned device")
        read_value = preferences.lib.CFDictionaryGetValue(read_device, keyboard_key)
        readback = preferences.boolean_state(read_value)
        require(readback == {"present": True, "value": False, "type": "CFBoolean"},
                "The owned device keyboard preference did not read back as Boolean false.")
        receipt.update(readbackOwnedPreference=readback, synchronizedReadbackVerified=True,
                       allOtherPreferenceValuesPreserved=True, globalKeyboardPreferenceChanged=False)
    finally:
        preferences.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selection", required=True)
    parser.add_argument("--device", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    receipt = {
        "schemaVersion": 1,
        "recordedAtUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "helperSHA256": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        "status": "failed",
        "scope": "Stored per-device Simulator keyboard preference on one owned fresh CI UUID.",
        "preferenceDomain": DOMAIN,
        "userScope": "current user",
        "hostScope": "any host",
        "writeAttempted": False,
        "ownershipAndShutdownVerified": False,
        "compatibilityLimit": "Maintained-tool preference convention, not an Apple guarantee for Xcode 26.6.",
        "acceptanceLimit": "Stored-value readback is not effective keyboard-mode or UI acceptance. All real-key, geometry, deadline and journey gates remain required.",
        "concurrencyLimit": "Exclusive disposable runner; before/after equality detects drift but does not make the preference update transactional.",
    }
    output = None
    try:
        temporary = pathlib.Path(os.environ["RUNNER_TEMP"]).resolve(strict=True)
        selected = pathlib.Path(args.selection).resolve(strict=True)
        requested_output = pathlib.Path(args.output).resolve()
        require(selected.parent == temporary and selected.name == "career-iphone-selection.json",
                "Selection receipt must be the owned runner-temp file.")
        require(requested_output.parent == temporary and requested_output.name == "career-iphone-input-configuration.json",
                "Output must be the owned runner-temp receipt.")
        output = requested_output
        receipt["stage"] = "verify owned device and toolchain"
        identifier = validate_owner(args, receipt)
        receipt["stage"] = "configure and verify stored preference"
        configure(identifier, receipt)
        receipt.update(status="stored-preference-configured", stage="complete")
    except ConfigurationError as error:
        receipt["error"] = str(error)
    except Exception as error:
        # Do not print preference values, simulator inventories, command output or secrets.
        receipt["error"] = "Unexpected " + type(error).__name__ + " during the bounded precondition."
    finally:
        rendered = json.dumps(receipt, indent=2) + "\n"
        if output is not None:
            output.write_text(rendered)
        print(rendered, end="")
    return 0 if receipt["status"] == "stored-preference-configured" else 1


if __name__ == "__main__":
    raise SystemExit(main())
