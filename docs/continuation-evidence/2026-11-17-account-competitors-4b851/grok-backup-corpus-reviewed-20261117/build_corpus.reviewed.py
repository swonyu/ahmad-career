#!/usr/bin/env python3
"""Write the synthetic phone-backup corpus and a shape manifest.

This does not import Career Finder, does not call WorkspaceTransfer.decode,
and is not device or project acceptance.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "generated"
ORIGIN = "https://career-finder-service.jazzy-drake-8323.chatgpt.site"
WORKSPACE = "22222222-2222-4222-8222-222222222222"
EXPORTED = "2026-11-17T18:00:00Z"
LEVER_GLOBAL = "https://jobs.lever.co/acme/11111111-1111-4111-8111-111111111111"
LEVER_EU = "https://jobs.eu.lever.co/acme/11111111-1111-4111-8111-111111111111"
GH_BOARDS = "https://boards.greenhouse.io/canonical"
GH_JOB_BOARDS = "https://job-boards.greenhouse.io/canonical"
PLAN = "33333333-3333-4333-8333-333333333333"

ROOT_KEYS = {"format", "version", "platform", "exportedAt", "source", "data", "extensions"}
SOURCE_KEYS = {"scope", "serviceOrigin", "workspaceId"}
DATA_KEYS = {"profile", "jobs", "applicationRecords", "recordDrafts", "opportunityDraft", "continuationHolds"}
PROFILE_STRINGS = {
    "firstName", "lastName", "email", "phone", "city", "country", "headline",
    "experienceLevel", "website", "linkedin",
}
PROFILE_ARRAYS = {"skills", "targetRoles", "targetCountries", "workModes"}
JOB_KEYS = {"url", "title", "company", "location", "country"}
RECORD_STRINGS = {"id", "stage", "appliedOn", "followUpOn", "note", "updatedAt"}
DRAFT_STRINGS = {"stage", "appliedOn", "followUpOn", "note"}
STAGES = {"saved", "applied", "interview", "offer", "closed"}
LEVELS = {"entry", "mid", "senior", "any"}
MODES = {"remote", "hybrid", "on-site"}
RECEIPT_KEYS = {
    "attemptId", "title", "employer", "state", "applicationId", "createdAt",
    "error", "evidenceMode", "resumeSHA256", "provider",
}


def profile():
    return {
        "firstName": "Synthetic",
        "lastName": "Applicant",
        "email": "synthetic@example.com",
        "phone": "",
        "city": "Riyadh",
        "country": "SA",
        "headline": "",
        "skills": [],
        "targetRoles": [],
        "targetCountries": [],
        "workModes": ["remote", "hybrid"],
        "experienceLevel": "mid",
        "website": "",
        "linkedin": "",
        "resume": None,
    }


def job(url, title, company):
    return {"url": url, "title": title, "company": company, "location": "Riyadh", "country": "SA"}


def opportunity():
    return {"url": "", "title": "", "company": "", "location": "", "country": ""}


def record(record_id, url, title, company, note, stage="saved", applied=False):
    return {
        "id": record_id,
        "job": job(url, title, company),
        "stage": stage,
        "appliedElsewhere": applied,
        "appliedOn": "",
        "followUpOn": "",
        "note": note,
        "revision": 1,
        "archived": False,
        "updatedAt": EXPORTED,
    }


def draft(url, title, company, note, stage="saved"):
    return {
        "job": job(url, title, company),
        "draft": {"stage": stage, "appliedOn": "", "followUpOn": "", "note": note},
    }


def envelope(platform, jobs, records, drafts, holds=None, extension=None, scope="unpaired"):
    source = {"scope": scope}
    if scope == "workspace":
        source["serviceOrigin"] = ORIGIN
        source["workspaceId"] = WORKSPACE
    body = {
        "format": "career-finder-phone-workspace",
        "version": 1,
        "platform": platform,
        "exportedAt": EXPORTED,
        "source": source,
        "data": {
            "profile": profile(),
            "jobs": jobs,
            "applicationRecords": records,
            "recordDrafts": drafts,
            "opportunityDraft": opportunity(),
            "continuationHolds": holds or [],
        },
    }
    if extension is not None:
        body["extensions"] = extension
    return body


def receipt(attempt_id, state, title, evidence="unknown"):
    # Exact keys from WorkspaceStorage.receiptJson. No planId exists there.
    return {
        "attemptId": attempt_id,
        "title": title,
        "employer": "Acme",
        "state": state,
        "applicationId": "",
        "createdAt": EXPORTED,
        "error": "",
        "evidenceMode": evidence,
        "resumeSHA256": "",
        "provider": "lever",
    }


def write(name, value):
    path = ROOT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(value, str):
        path.write_text(value, encoding="utf-8")
    else:
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def shape_errors(value):
    errors = []
    if not isinstance(value, dict):
        return ["root is not an object"]
    extra = set(value) - ROOT_KEYS
    missing = {"format", "version", "platform", "exportedAt", "source", "data"} - set(value)
    if extra:
        errors.append("unknown root fields: " + ",".join(sorted(extra)))
    if missing:
        errors.append("missing root fields: " + ",".join(sorted(missing)))
    if value.get("format") != "career-finder-phone-workspace" or value.get("version") != 1:
        errors.append("format/version is not career-finder-phone-workspace v1")
    if value.get("platform") not in {"ios", "android"}:
        errors.append("platform is not ios or android")
    source = value.get("source")
    if isinstance(source, dict):
        extra_s = set(source) - SOURCE_KEYS
        if extra_s:
            errors.append("unknown source fields: " + ",".join(sorted(extra_s)))
        if source.get("scope") not in {"unpaired", "workspace"}:
            errors.append("source.scope is not unpaired or workspace")
    data = value.get("data")
    if not isinstance(data, dict):
        errors.append("data is not an object")
        return errors
    extra_d = set(data) - DATA_KEYS
    missing_d = DATA_KEYS - set(data)
    if extra_d:
        errors.append("unknown data fields: " + ",".join(sorted(extra_d)))
    if missing_d:
        errors.append("missing data fields: " + ",".join(sorted(missing_d)))
    prof = data.get("profile")
    if isinstance(prof, dict):
        if not PROFILE_STRINGS <= set(prof) or not PROFILE_ARRAYS <= set(prof) or "resume" not in prof:
            errors.append("profile is missing a field required by WorkspaceTransfer.decode")
        if prof.get("experienceLevel") not in LEVELS:
            errors.append("experienceLevel is not a wire enum")
        modes = prof.get("workModes")
        if not isinstance(modes, list) or any(mode not in MODES for mode in modes):
            errors.append("workModes contains a non-wire value")
    for item in data.get("jobs") or []:
        if set(item) - JOB_KEYS:
            errors.append("job contains a field outside the common five")
    for item in data.get("applicationRecords") or []:
        if not RECORD_STRINGS <= set(item):
            errors.append("application record is missing a common string field")
        if item.get("stage") not in STAGES:
            errors.append("record stage is not a wire stage")
        if item.get("stage") in {"applied", "interview", "offer"} and item.get("appliedElsewhere") is not True:
            errors.append("applied stage without appliedElsewhere")
    for item in data.get("recordDrafts") or []:
        draft_body = item.get("draft") if isinstance(item, dict) else None
        if not isinstance(draft_body, dict) or not DRAFT_STRINGS <= set(draft_body):
            errors.append("record draft is missing stage/appliedOn/followUpOn/note")
        elif len(draft_body.get("note", "")) > 2000:
            errors.append("draft note exceeds 2000 code points/scalars for this ASCII/Arabic sample")
    extension = value.get("extensions")
    if isinstance(extension, dict) and "android" in extension:
        archive = extension["android"].get("receiptArchive", [])
        for item in archive:
            if "planId" in item:
                errors.append("receiptArchive invented planId; receiptJson has no planId")
            unknown = set(item) - RECEIPT_KEYS
            if unknown:
                errors.append("receipt field outside receiptJson: " + ",".join(sorted(unknown)))
    return errors


def main():
    same_job = job(LEVER_GLOBAL, "مهندس برمجيات", "Acme")
    files = {
        "01-two-unfinished-notes-one-job.json": envelope(
            "android",
            [same_job],
            [],
            [
                draft(LEVER_GLOBAL, "مهندس برمجيات", "Acme", "ملاحظة أولى لم تُحفظ"),
                draft(LEVER_GLOBAL, "مهندس برمجيات", "Acme", "ملاحظة ثانية مختلفة"),
            ],
        ),
        "02-destination-existing-note.json": envelope(
            "android",
            [same_job],
            [],
            [draft(LEVER_GLOBAL, "مهندس برمجيات", "Acme", "ملاحظة الوجهة الحالية")],
        ),
        "02-import-two-alternatives.json": envelope(
            "android",
            [same_job],
            [],
            [
                draft(LEVER_GLOBAL, "مهندس برمجيات", "Acme", "بديل مستورد ألف"),
                draft(LEVER_GLOBAL, "مهندس برمجيات", "Acme", "بديل مستورد باء"),
            ],
        ),
        "03-distinct-lever-global-eu-and-greenhouse-hosts.json": envelope(
            "android",
            [
                job(LEVER_GLOBAL, "Global role", "Acme"),
                job(LEVER_EU, "EU role", "Acme EU"),
                job(GH_BOARDS, "Greenhouse boards host", "Canonical"),
                job(GH_JOB_BOARDS, "Greenhouse job-boards host", "Canonical"),
            ],
            [
                record("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", LEVER_GLOBAL, "Global role", "Acme", "global note"),
                record("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", LEVER_EU, "EU role", "Acme EU", "eu note"),
                record("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", GH_BOARDS, "Greenhouse boards host", "Canonical", "boards note"),
                record("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", GH_JOB_BOARDS, "Greenhouse job-boards host", "Canonical", "job-boards note"),
            ],
            [],
        ),
        "04-same-greenhouse-link-with-slash-and-utm.json": envelope(
            "android",
            [
                job(GH_BOARDS, "One role", "Canonical"),
                job(GH_BOARDS + "/?utm_source=mail", "One role", "Canonical"),
            ],
            [],
            [],
        ),
        "05-unknown-root-approval-field.json": {
            **envelope("ios", [same_job], [], [draft(LEVER_GLOBAL, "مهندس برمجيات", "Acme", "ملاحظة محفوظة في الملف")]),
            "approved": True,
        },
        "06-oversized-draft-note.json": envelope(
            "android",
            [same_job],
            [],
            [draft(LEVER_GLOBAL, "مهندس برمجيات", "Acme", "N" * 2001)],
        ),
        "08-self-reported-flag-and-prepared-receipt.json": envelope(
            "android",
            [same_job],
            [record(
                "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
                LEVER_GLOBAL, "مهندس برمجيات", "Acme",
                "Self-reported applied elsewhere. Not an employer receipt.",
                stage="applied", applied=True,
            )],
            [draft(LEVER_GLOBAL, "مهندس برمجيات", "Acme", "مسودة غير معتمدة")],
            holds=[PLAN],
            extension={
                "android": {
                    "receiptArchive": [
                        receipt("44444444-4444-4444-8444-444444444441", "ready", "Prepared not approved", "live"),
                        receipt("44444444-4444-4444-8444-444444444442", "dispatching", "Dispatching without plan id", "live"),
                    ]
                }
            },
            scope="workspace",
        ),
    }
    proposed = {
        "schema": "proposed-server-workspace-view",
        "representableInPhoneBackup": False,
        "reason": "activePlanIds and attempt.planId are returned by hosted workspace/attemptView. WorkspaceStorage.receiptJson and career-finder-phone-workspace data have neither field. This object is a review fixture, not a phone backup.",
        "workspaceView": {
            "activePlanIds": [],
            "recoverablePlans": [],
            "attempts": [{
                "id": "44444444-4444-4444-8444-444444444442",
                "attemptId": "44444444-4444-4444-8444-444444444442",
                "planId": PLAN,
                "state": "dispatching",
                "createdAt": EXPORTED,
                "dispatchedAt": EXPORTED,
                "confirmedAt": None,
                "mode": "local",
                "evidenceMode": "live",
                "dispatchCount": 1,
                "title": "مهندس برمجيات",
                "company": "Acme",
                "url": LEVER_GLOBAL,
                "provider": "lever",
                "error": None,
            }],
        },
        "mustNot": [
            "call submit or advance",
            "label the attempt Approved",
            "resend automatically if the later result is uncertain",
            "treat an explicit Stop as optional refresh behavior",
        ],
    }
    damaged = '{"format":"career-finder-phone-workspace","version":1,"data":'
    written = []
    for name, value in files.items():
        path = write(name, value)
        raw = path.read_bytes()
        errors = shape_errors(value)
        written.append({"file": name, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "shapeErrors": errors})
    damaged_path = write("07-damaged-truncated.json", damaged)
    written.append({
        "file": "07-damaged-truncated.json",
        "sha256": hashlib.sha256(damaged_path.read_bytes()).hexdigest(),
        "bytes": damaged_path.stat().st_size,
        "shapeErrors": ["not JSON"],
    })
    proposed_path = write("proposed/09-server-expired-dispatch.json", proposed)
    written.append({
        "file": "proposed/09-server-expired-dispatch.json",
        "sha256": hashlib.sha256(proposed_path.read_bytes()).hexdigest(),
        "bytes": proposed_path.stat().st_size,
        "shapeErrors": ["proposed server view, not a phone backup"],
    })
    manifest = {
        "kind": "synthetic-phone-backup-corpus",
        "acceptance": "shape and review expectations only; not WorkspaceTransfer.decode, not a device, not CI",
        "baseline": {
            "packetSnapshots": [
                "8bfd3136227ce79625df8e2b57678de5fbfa201e",
                "3a709eb15f1024df78ee03474f511568df2dc3de",
                "842472684b194e993355f632902ccc81366c164c",
            ],
            "packetPreparedAt": "2026-11-17T14:07:14.234637+00:00",
            "schemaFilesIdenticalAtCa3": [
                "android/app/src/main/java/com/saleh/careerfinder/WorkspaceTransfer.kt",
                "android/app/src/main/java/com/saleh/careerfinder/Models.kt",
                "android/app/src/main/java/com/saleh/careerfinder/WorkspaceStorage.kt",
                "apple/AhmadCareer/MobileApplicationState.swift",
                "apple/AhmadCareer/NativeApplicationsStore.swift",
            ],
            "workspaceTransferGitBlob": "8e1c1dec5bcc1f12a97427c49974e717473e7ccc",
            "workspaceTransferSha256": "766f4101f4164cc434537ef7aac15cddec08c224d22ceb085785c375cf78105e",
            "mobileApplicationStateGitBlob": "edc87b8f27699167f7b85b204cb4b825f4db9172",
            "ca3Commit": "ca3d3411d8b5b36fa7093dff782f4a7b931261c7",
            "ca3ModelTsDiffers": True,
            "ca3ModelDelta": "publicURL URL constructor catch, optional hosted record location. Phone backup keys unchanged.",
            "notCovered": "Unintegrated accessibility patches and any dirty native tree newer than ca3 were not in the uploaded packages.",
        },
        "files": written,
    }
    write("manifest.json", manifest)
    print(json.dumps({"files": len(written), "shapeFailures": [item for item in written if item["file"].startswith("0") and item["shapeErrors"] and not item["file"].startswith("04") and not item["file"].startswith("05") and not item["file"].startswith("06") and not item["file"].startswith("07")]}, indent=2))


if __name__ == "__main__":
    main()
