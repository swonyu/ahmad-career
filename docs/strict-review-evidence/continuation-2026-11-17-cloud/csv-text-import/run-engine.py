"""Import synthetic production CSV with independent, temporary Calc profiles."""
from pathlib import Path
import datetime
import json
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
version = subprocess.check_output(["soffice", "--version"], text=True).strip()
runs = []
with tempfile.TemporaryDirectory(prefix="career-csv-text-import-") as profile_root:
    for mode in ("default", "quoted-as-text"):
        for language in ("en", "ar"):
            output = HERE / mode
            output.mkdir(exist_ok=True)
            profile = Path(profile_root) / (mode + "-" + language)
            command = ["soffice", "-env:UserInstallation=" + profile.as_uri(), "--headless"]
            if mode == "quoted-as-text":
                # Token 7: quoted fields as text; token 13: evaluate formulas.
                command += ["--infilter=Text - txt - csv (StarCalc):44,34,76,1,,1033,true,false,true,false,false,0,true"]
            command += ["--convert-to", "fods", "--outdir", str(output), str(HERE / ("career-records-" + language + ".csv"))]
            result = subprocess.run(command, text=True, capture_output=True, timeout=45)
            runs.append({"mode": mode, "language": language, "command": command, "exitCode": result.returncode, "stdout": result.stdout.strip(), "stderr": result.stderr.strip()})
            assert result.returncode == 0, runs[-1]
            assert (output / ("career-records-" + language + ".fods")).is_file()
receipt = {"observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "version": version, "source": "https://help.libreoffice.org/latest/en-US/text/shared/guide/csv_params.html", "runs": runs, "scope": "Headless content and cell-type import check. Separate temporary profiles; no GUI, browser saving, account or employer request."}
(HERE / "engine-invocations.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"version": version, "successfulImports": len(runs)}))
