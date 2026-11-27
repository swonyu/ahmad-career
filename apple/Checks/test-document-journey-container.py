"""Small filesystem check for Xcode's late iPhone app-container replacement."""
import importlib.util
from pathlib import Path
import tempfile


spec = importlib.util.spec_from_file_location("document_journey", Path(__file__).with_name("run-ci-document-journey.py"))
journey = importlib.util.module_from_spec(spec)
spec.loader.exec_module(journey)

with tempfile.TemporaryDirectory() as temporary:
    parent = Path(temporary).resolve()
    original = parent / "11111111-1111-4111-8111-111111111111"
    runtime = parent / "22222222-2222-4222-8222-222222222222"
    original.mkdir(mode=0o700)
    runtime.mkdir(mode=0o700)
    test_id = "33333333-3333-4333-8333-333333333333"
    bootstrap = b'{"testID":"33333333-3333-4333-8333-333333333333"}\n'
    journey.migrate_bootstrap(original, runtime, test_id, bootstrap)
    destination = runtime / "Library" / "Application Support" / "CareerFinderUIAcceptance" / test_id \
        / "native-journey-bootstrap.private.json"
    assert journey.read_private(destination) == bootstrap

    destination.unlink()
    journey.publish_private(destination, b"tampered\n")
    try:
        journey.migrate_bootstrap(original, runtime, test_id, bootstrap)
    except AssertionError:
        pass
    else:
        raise AssertionError("A changed bootstrap was accepted")

    destination.unlink()
    destination.symlink_to(original)
    try:
        journey.migrate_bootstrap(original, runtime, test_id, bootstrap)
    except OSError:
        pass
    else:
        raise AssertionError("A bootstrap symlink was accepted")

print("late app-container bootstrap migration and rejection checks passed")
