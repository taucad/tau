#!/usr/bin/env python3
"""Focused semantic regression test for the local transcript collector."""

from __future__ import annotations

import gzip
import json
import subprocess
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

import collect as collector_module
from collect import CaptureIdentityError, Config, collect, message_classification, parse_utc, sanitize


ROOT_ID = "11111111-1111-4111-8111-111111111111"
CHILD_ID = "22222222-2222-4222-8222-222222222222"
OLD_AT = "2026-05-01T00:00:00Z"
CURRENT_AT = "2026-08-20T00:00:00Z"


def record(timestamp: str, kind: str, payload: dict[str, object]) -> dict[str, object]:
    return {"timestamp": timestamp, "type": kind, "payload": payload}


def write_records(path: Path, records: list[dict[str, object]], partial: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = b"".join(json.dumps(item, separators=(",", ":")).encode() + b"\n" for item in records)
    if partial:
        body += b'{"timestamp":"2026-08-21T00:00:00Z","type":"response_item"'
    path.write_bytes(body)


def read_gzip_jsonl(path: Path) -> list[dict[str, object]]:
    with gzip.open(path, "rt", encoding="utf-8") as source:
        return [json.loads(line) for line in source]


def read_zstd_jsonl(path: Path) -> list[dict[str, object]]:
    decoded = subprocess.check_output(["zstd", "-d", "-c", "-q", str(path)])
    return [json.loads(line) for line in decoded.splitlines()]


def tree_bytes(path: Path) -> dict[str, bytes]:
    return {item.relative_to(path).as_posix(): item.read_bytes() for item in path.rglob("*") if item.is_file()}


class CollectorTest(unittest.TestCase):
    def test_shared_native_dialogue_identity_connects_families(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            claude_home = root / ".claude"
            project = claude_home / "projects" / "-Users-rifont-git-tau"
            first_id = "10000000-0000-4000-8000-000000000001"
            second_id = "10000000-0000-4000-8000-000000000002"
            distinct_id = "10000000-0000-4000-8000-000000000003"
            injection_first_id = "10000000-0000-4000-8000-000000000004"
            injection_second_id = "10000000-0000-4000-8000-000000000005"

            def claude_message(
                uuid: str, text: str, timestamp: str = CURRENT_AT, **extra: object
            ) -> dict[str, object]:
                return {
                    "timestamp": timestamp,
                    "type": "user",
                    "uuid": uuid,
                    "message": {"role": "user", "content": text},
                    **extra,
                }

            write_records(
                project / f"{first_id}.jsonl",
                [claude_message("shared-native-event", "Copied native dialogue.")],
            )
            write_records(
                project / f"{second_id}.jsonl",
                [
                    claude_message("shared-native-event", "Copied native dialogue."),
                    claude_message("real-subsequent-event", "Retain real subsequent dialogue.", "2026-08-20T00:00:01Z"),
                ],
            )
            write_records(
                project / f"{distinct_id}.jsonl",
                [claude_message("distinct-native-event", "Copied native dialogue.")],
            )
            write_records(
                project / f"{injection_first_id}.jsonl",
                [
                    claude_message(
                        "shared-injection-event",
                        "<environment_context>\n  <cwd>/Users/rifont/git/tau</cwd>\n</environment_context>",
                    )
                ],
            )
            write_records(
                project / f"{injection_second_id}.jsonl",
                [
                    claude_message(
                        "shared-injection-event",
                        "<environment_context>\n  <cwd>/Users/rifont/git/tau</cwd>\n</environment_context>",
                    )
                ],
            )

            run_dir = root / "run"
            config = Config(
                run_dir=run_dir,
                cutoff=parse_utc("2026-06-06T00:00:00Z"),
                recent_cutoff=parse_utc("2026-08-05T00:00:00Z"),
                watermark=parse_utc("2026-09-04T20:32:13Z"),
                codex_home=root / ".codex",
                claude_home=claude_home,
                claude_app_support=root / "Claude",
                reserve_bytes=0,
            )
            collect(config)
            sources = {
                item["native_id"]: item
                for item in map(json.loads, (run_dir / "sources.jsonl").read_text().splitlines())
            }
            self.assertEqual(sources[first_id]["family_id"], sources[second_id]["family_id"])
            self.assertFalse(sources[first_id]["copied_context_source"])
            self.assertFalse(sources[second_id]["copied_context_source"])
            self.assertEqual(sources[first_id]["lineage_parents"], [])
            self.assertEqual(sources[second_id]["lineage_parents"], [])
            self.assertNotEqual(sources[first_id]["family_id"], sources[distinct_id]["family_id"])
            self.assertNotEqual(
                sources[injection_first_id]["family_id"], sources[injection_second_id]["family_id"]
            )
            injection_family = next(
                item
                for item in map(json.loads, (run_dir / "families.jsonl").read_text().splitlines())
                if item["family_id"] == sources[injection_first_id]["family_id"]
            )
            injection_episode = read_gzip_jsonl(run_dir / injection_family["episode_path"])
            self.assertEqual(injection_episode[0]["classification"], "injected-context")
            self.assertFalse(injection_episode[0]["preference_eligible"])
            family = next(
                item
                for item in map(json.loads, (run_dir / "families.jsonl").read_text().splitlines())
                if item["family_id"] == sources[first_id]["family_id"]
            )
            episode = read_gzip_jsonl(run_dir / family["episode_path"])
            subsequent = next(item for item in episode if item["text"] == "Retain real subsequent dialogue.")
            self.assertEqual(subsequent["classification"], "direct-user")
            self.assertTrue(subsequent["preference_eligible"])

    def test_distinct_native_ids_survive_a_shared_event_family_join(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            claude_home = root / ".claude"
            project = claude_home / "projects" / "-Users-rifont-git-tau"
            first_id = "20000000-0000-4000-8000-000000000001"
            second_id = "20000000-0000-4000-8000-000000000002"

            def message(uuid: str | None, text: str, timestamp: str) -> dict[str, object]:
                return {
                    "timestamp": timestamp,
                    "type": "user",
                    "uuid": uuid,
                    "message": {"role": "user", "content": text},
                }

            repeated_at = "2026-08-20T00:00:02Z"
            write_records(
                project / f"{first_id}.jsonl",
                [
                    message("shared-event", "Shared copied event.", CURRENT_AT),
                    message("genuine-repeat-a", "Same wording, distinct events.", repeated_at),
                    message(None, "No-ID text without ancestry.", repeated_at),
                ],
            )
            write_records(
                project / f"{second_id}.jsonl",
                [
                    message("shared-event", "Shared copied event.", CURRENT_AT),
                    message("genuine-repeat-b", "Same wording, distinct events.", repeated_at),
                    message(None, "No-ID text without ancestry.", repeated_at),
                ],
            )
            run_dir = root / "run"
            collect(
                Config(
                    run_dir=run_dir,
                    cutoff=parse_utc("2026-06-06T00:00:00Z"),
                    recent_cutoff=parse_utc("2026-08-05T00:00:00Z"),
                    watermark=parse_utc("2026-09-04T20:32:13Z"),
                    codex_home=root / ".codex",
                    claude_home=claude_home,
                    claude_app_support=root / "Claude",
                    reserve_bytes=0,
                )
            )
            family = json.loads((run_dir / "families.jsonl").read_text().strip())
            episode = read_gzip_jsonl(run_dir / family["episode_path"])
            repeats = [item for item in episode if item["text"] == "Same wording, distinct events."]
            self.assertEqual(len(repeats), 2)
            self.assertEqual({item["source_event_id"] for item in repeats}, {"genuine-repeat-a", "genuine-repeat-b"})
            self.assertEqual({item["classification"] for item in repeats}, {"direct-user"})
            self.assertTrue(all(item["preference_eligible"] for item in repeats))
            unproven = [item for item in episode if item["text"] == "No-ID text without ancestry."]
            self.assertEqual(len(unproven), 2)
            self.assertEqual({item["classification"] for item in unproven}, {"direct-user"})
            self.assertTrue(all(item["preference_eligible"] for item in unproven))

    def test_collects_redacts_deduplicates_and_resumes(self) -> None:
        probes = [
            "SERVICE_TOKEN=abcdefghijklmnopqrstuvwx",
            "Authorization: Basic dXNlcjpwYXNzd29yZA==",
            "data:image/png;base64,c2hvcnQ=",
            "password=hunter123",
        ]
        for probe in probes:
            redacted, changes = sanitize(probe)
            self.assertTrue(changes)
            self.assertNotEqual(redacted, probe)
            self.assertNotIn("sha256=", str(redacted))
        generated_class = message_classification(
            {"kind": "rollout", "generated_source": {"registered": True}},
            "user",
            "Evaluate this family.",
            {},
        )
        self.assertEqual(generated_class[:2], ("generated-evaluation-context", False))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            codex_home = root / ".codex"
            claude_home = root / ".claude"
            app_support = root / "Claude"
            run_dir = root / "run"
            root_path = codex_home / "sessions" / "2026" / "05" / "rollout-2026-05-01T00-00-00" / f"{ROOT_ID}.jsonl"
            child_path = codex_home / "sessions" / "2026" / "08" / "rollout-2026-08-20T00-00-00" / f"{CHILD_ID}.jsonl"

            root_records = [
                record(OLD_AT, "session_meta", {"id": ROOT_ID, "cwd": "/Users/rifont/git/tau"}),
                record(
                    OLD_AT,
                    "response_item",
                    {"type": "message", "role": "user", "id": "short-correction", "content": [{"type": "input_text", "text": "No, retain every prompt."}]},
                ),
                record(
                    OLD_AT,
                    "response_item",
                    {"type": "message", "role": "assistant", "id": "visible-answer", "content": [{"type": "output_text", "text": "Understood."}]},
                ),
                record(
                    OLD_AT,
                    "response_item",
                    {"type": "message", "role": "user", "id": "rebased-native-event", "content": [{"type": "input_text", "text": "Copied native event with rebased wrapper time."}]},
                ),
                record(
                    OLD_AT,
                    "response_item",
                    {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "No-ID ancestor copy."}]},
                ),
                record(
                    OLD_AT,
                    "response_item",
                    {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "No-ID uncertain repeat."}]},
                ),
            ]
            child_records = [
                record(
                    CURRENT_AT,
                    "session_meta",
                    {"id": CHILD_ID, "cwd": "/Users/rifont/git/tau", "parent_thread_id": ROOT_ID, "thread_source": "subagent"},
                ),
                record(
                    CURRENT_AT,
                    "response_item",
                    {"type": "message", "role": "user", "id": "copied-correction", "content": [{"type": "input_text", "text": "No, retain every prompt."}]},
                ),
                record(
                    "2026-08-20T00:00:01Z",
                    "response_item",
                    {"type": "message", "role": "user", "id": "repeated-correction", "content": [{"type": "input_text", "text": "No, retain every prompt."}]},
                ),
                record(
                    CURRENT_AT,
                    "response_item",
                    {"type": "message", "role": "user", "id": "rebased-native-event", "content": [{"type": "input_text", "text": "Copied native event with rebased wrapper time."}]},
                ),
                record(
                    OLD_AT,
                    "response_item",
                    {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "No-ID ancestor copy."}]},
                ),
                record(
                    CURRENT_AT,
                    "response_item",
                    {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "No-ID uncertain repeat."}]},
                ),
                record(
                    CURRENT_AT,
                    "response_item",
                    {
                        "type": "message",
                        "role": "user",
                        "id": "delegated-copy",
                        "content": [{"type": "input_text", "text": "Copied parent context. Authorization: Bearer abcdefghijklmnopqrstuvwxyz"}],
                    },
                ),
            ]
            claude_id = "33333333-3333-4333-8333-333333333333"
            claude_path = claude_home / "projects" / "-Users-rifont-git-tau" / f"{claude_id}.jsonl"
            write_records(
                claude_path,
                [
                    {"timestamp": "2026-08-18T00:00:00Z", "type": "user", "uuid": "claude-direct", "message": {"role": "user", "content": "Cross-provider inherited text."}},
                    {"timestamp": "2026-08-18T00:00:04Z", "type": "user", "message": {"role": "user", "content": "Cross-provider no-ID context."}},
                    {"timestamp": "2026-08-18T00:00:01Z", "type": "user", "uuid": "claude-summary", "isCompactSummary": True, "message": {"role": "user", "content": "Synthesized compact summary."}},
                    {"timestamp": "2026-08-18T00:00:02Z", "type": "user", "uuid": "claude-meta", "isMeta": True, "message": {"role": "user", "content": "Generated meta context."}},
                ],
            )
            child_records.append(
                record(
                    "2026-08-20T00:00:03Z",
                    "response_item",
                    {"type": "message", "role": "user", "id": "imported-cross-provider", "content": [{"type": "input_text", "text": "Cross-provider inherited text."}]},
                )
            )
            child_records.append(
                record(
                    "2026-08-18T00:00:04Z",
                    "response_item",
                    {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "Cross-provider no-ID context."}]},
                )
            )
            child_records.append(
                record(
                    "2026-09-04T20:32:13Z",
                    "response_item",
                    {"type": "message", "role": "assistant", "id": "fractional-boundary", "content": [{"type": "output_text", "text": "Included before fractional watermark."}]},
                )
            )
            write_records(root_path, root_records)
            write_records(child_path, child_records, partial=True)
            desktop_path = app_support / "claude-code-sessions" / "metadata.json"
            desktop_path.parent.mkdir(parents=True)
            desktop_path.write_text(json.dumps({"sessionId": "../../unsafe", "title": "First", "lastActivityAt": 1787193600000}))
            (codex_home / "external_agent_session_imports.json").write_text(
                json.dumps({"records": [{"source_path": str(claude_path), "imported_thread_id": CHILD_ID}]})
            )
            config = Config(
                run_dir=run_dir,
                cutoff=parse_utc("2026-06-06T00:00:00Z"),
                recent_cutoff=parse_utc("2026-08-05T00:00:00Z"),
                watermark=parse_utc("2026-09-04T20:32:13Z"),
                codex_home=codex_home,
                claude_home=claude_home,
                claude_app_support=app_support,
                reserve_bytes=0,
            )

            first = collect(config)
            self.assertEqual(first["collection_status"], "archived-available-sources")
            self.assertEqual(first["selected_source_files"], 3)
            self.assertEqual(first["independent_families"], 1)
            self.assertEqual(first["quality_gaps"]["trailing_partial_files"], 1)
            self.assertEqual(first["coverage_status"], "bounded-with-explicit-gaps")

            sources = [json.loads(line) for line in (run_dir / "sources.jsonl").read_text().splitlines()]
            source_by_id = {item["native_id"]: item for item in sources}
            self.assertEqual(source_by_id[ROOT_ID]["selection"], "family-context")
            self.assertEqual(source_by_id[CHILD_ID]["selection"], "in-window")
            self.assertTrue(source_by_id[CHILD_ID]["trailing_partial"])

            family = json.loads((run_dir / "families.jsonl").read_text().strip())
            episode_path = run_dir / family["episode_path"]
            episode = read_gzip_jsonl(episode_path)
            correction = [item for item in episode if item["text"] == "No, retain every prompt."]
            self.assertEqual(len(correction), 3)
            self.assertEqual(
                {item["classification"] for item in correction},
                {"direct-user", "delegated-user-echo"},
            )
            direct = next(item for item in correction if item["classification"] == "direct-user")
            self.assertTrue(direct["preference_eligible"])
            self.assertTrue(
                all(
                    not item["preference_eligible"]
                    for item in correction
                    if item["classification"] == "delegated-user-echo"
                )
            )
            rebased_native = [
                item
                for item in episode
                if item["text"] == "Copied native event with rebased wrapper time."
            ]
            self.assertEqual(len(rebased_native), 2)
            self.assertEqual(
                {item["classification"] for item in rebased_native},
                {"direct-user", "inherited-exact-event"},
            )
            no_id_copy = [item for item in episode if item["text"] == "No-ID ancestor copy."]
            self.assertEqual(len(no_id_copy), 2)
            self.assertEqual(
                {item["classification"] for item in no_id_copy},
                {"direct-user", "inherited-exact-event"},
            )
            uncertain_repeat = [item for item in episode if item["text"] == "No-ID uncertain repeat."]
            self.assertEqual(len(uncertain_repeat), 2)
            self.assertEqual(
                {item["classification"] for item in uncertain_repeat},
                {"direct-user", "delegated-user-echo"},
            )
            imported = [item for item in episode if item["text"] == "Cross-provider inherited text."]
            self.assertEqual(len(imported), 2)
            self.assertEqual(
                {item["classification"] for item in imported}, {"direct-user", "delegated-user-echo"}
            )
            imported_without_ids = [
                item for item in episode if item["text"] == "Cross-provider no-ID context."
            ]
            self.assertEqual(len(imported_without_ids), 2)
            self.assertEqual(
                {item["classification"] for item in imported_without_ids},
                {"direct-user", "delegated-user-echo"},
            )
            compact = next(item for item in episode if item["text"] == "Synthesized compact summary.")
            meta = next(item for item in episode if item["text"] == "Generated meta context.")
            self.assertEqual(compact["classification"], "compaction-summary")
            self.assertEqual(meta["classification"], "claude-meta-context")
            self.assertFalse(compact["preference_eligible"])
            self.assertFalse(meta["preference_eligible"])
            delegated = next(item for item in episode if item.get("source_event_id") == "delegated-copy")
            self.assertEqual(delegated["classification"], "delegated-user-echo")
            self.assertFalse(delegated["preference_eligible"])
            self.assertIn("<introspect:redacted-credential:", delegated["text"])
            self.assertNotIn("abcdefghijklmnopqrstuvwxyz", delegated["text"])
            self.assertIn("Understood.", {item["text"] for item in episode})
            self.assertIn("Included before fractional watermark.", {item["text"] for item in episode})

            snapshot_path = run_dir / source_by_id[CHILD_ID]["snapshot_path"]
            snapshot_bytes = snapshot_path.read_bytes()
            original_episode_path = episode_path
            original_episode_bytes = episode_path.read_bytes()
            self.assertEqual(episode_path.read_bytes()[4:8], b"\0\0\0\0")
            self.assertNotIn(b"abcdefghijklmnopqrstuvwxyz", subprocess.check_output(["zstd", "-d", "-c", "-q", str(snapshot_path)]))

            second = collect(config)
            self.assertEqual(second["delta"]["reused"], 3)

            corrupted = bytearray(snapshot_path.read_bytes())
            corrupted[len(corrupted) // 2] ^= 0xFF
            snapshot_path.write_bytes(corrupted)
            repaired = collect(config)
            self.assertEqual(repaired["delta"]["processed"], 1)
            self.assertEqual(repaired["delta"]["reused"], 2)
            read_zstd_jsonl(snapshot_path)

            child_records.append(
                record(
                    "2026-08-22T00:00:00Z",
                    "response_item",
                    {"type": "message", "role": "assistant", "id": "new-answer", "content": [{"type": "output_text", "text": "New suffix."}]},
                )
            )
            write_records(child_path, child_records)
            third = collect(config)
            self.assertEqual(third["delta"]["processed"], 1)
            self.assertEqual(third["delta"]["reused"], 2)
            family = json.loads((run_dir / "families.jsonl").read_text().strip())
            changed_child = next(
                item for item in map(json.loads, (run_dir / "sources.jsonl").read_text().splitlines())
                if item.get("native_id") == CHILD_ID
            )
            self.assertNotEqual(snapshot_path, run_dir / changed_child["snapshot_path"])
            self.assertEqual(snapshot_path.read_bytes(), snapshot_bytes)
            self.assertNotEqual(original_episode_path, run_dir / family["episode_path"])
            self.assertEqual(original_episode_path.read_bytes(), original_episode_bytes)
            self.assertIn("New suffix.", {item["text"] for item in read_gzip_jsonl(run_dir / family["episode_path"])})

            first_metadata = next(
                item for item in map(json.loads, (run_dir / "sources.jsonl").read_text().splitlines())
                if item.get("provider") == "claude-desktop"
            )
            first_metadata_path = run_dir / first_metadata["snapshot_path"]
            first_metadata_bytes = first_metadata_path.read_bytes()
            self.assertNotIn("..", Path(first_metadata["snapshot_path"]).name)
            desktop_path.write_text(json.dumps({"sessionId": "../../unsafe", "title": "Second", "lastActivityAt": 1787193600000}))
            collect(config)
            changed_metadata = next(
                item for item in map(json.loads, (run_dir / "sources.jsonl").read_text().splitlines())
                if item.get("provider") == "claude-desktop"
            )
            self.assertNotEqual(first_metadata["snapshot_path"], changed_metadata["snapshot_path"])
            self.assertEqual(first_metadata_path.read_bytes(), first_metadata_bytes)
            collect(config)
            reused_metadata = next(
                item for item in map(json.loads, (run_dir / "sources.jsonl").read_text().splitlines())
                if item.get("provider") == "claude-desktop"
            )
            self.assertEqual(reused_metadata["collection_status"], "reused")
            current_metadata_path = run_dir / reused_metadata["snapshot_path"]
            expected_metadata_bytes = current_metadata_path.read_bytes()
            damaged_metadata = bytearray(expected_metadata_bytes)
            damaged_metadata[len(damaged_metadata) // 2] ^= 0xFF
            current_metadata_path.write_bytes(damaged_metadata)
            collect(config)
            repaired_metadata = next(
                item for item in map(json.loads, (run_dir / "sources.jsonl").read_text().splitlines())
                if item.get("provider") == "claude-desktop"
            )
            self.assertEqual(repaired_metadata["snapshot_path"], reused_metadata["snapshot_path"])
            self.assertEqual(current_metadata_path.read_bytes(), expected_metadata_bytes)

            baseline = tree_bytes(run_dir)
            mismatches = [
                replace(config, cutoff=parse_utc("2026-06-07T00:00:00Z")),
                replace(config, recent_cutoff=parse_utc("2026-08-06T00:00:00Z")),
                replace(config, watermark=parse_utc("2026-09-04T20:32:14Z")),
                replace(config, codex_home=root / "different-codex"),
                replace(config, claude_home=root / "different-claude"),
                replace(config, claude_app_support=root / "different-app-support"),
            ]
            for mismatch in mismatches:
                with self.assertRaisesRegex(CaptureIdentityError, "new run directory"):
                    collect(mismatch)
                self.assertEqual(tree_bytes(run_dir), baseline)
            with patch.object(collector_module, "TRANSFORM_VERSION", collector_module.TRANSFORM_VERSION + 1):
                with self.assertRaisesRegex(CaptureIdentityError, "new run directory"):
                    collect(config)
            self.assertEqual(tree_bytes(run_dir), baseline)

            invalid_dir = root / "invalid"
            with self.assertRaises(ValueError):
                collect(replace(config, run_dir=invalid_dir, cutoff=config.recent_cutoff))
            self.assertFalse(invalid_dir.exists())
            with self.assertRaisesRegex(ValueError, "explicit UTC offset"):
                collect(replace(config, run_dir=invalid_dir, cutoff=config.cutoff.replace(tzinfo=None)))
            self.assertFalse(invalid_dir.exists())

            prepared_dir = root / "prepared-run"
            prepared_brief = prepared_dir / "lanes" / "integration" / "brief.md"
            prepared_brief.parent.mkdir(parents=True)
            prepared_brief.write_text("Approved mandate; collect into this owned run.")
            prepared_result = collect(replace(config, run_dir=prepared_dir))
            self.assertEqual(prepared_result["collection_status"], "archived-available-sources")
            self.assertEqual(prepared_brief.read_text(), "Approved mandate; collect into this owned run.")

            legacy_dir = root / "legacy"
            legacy_dir.mkdir()
            (legacy_dir / "sources.jsonl").write_bytes(b"legacy")
            legacy_before = tree_bytes(legacy_dir)
            with self.assertRaisesRegex(CaptureIdentityError, "populated legacy run.*new run directory"):
                collect(replace(config, run_dir=legacy_dir))
            self.assertEqual(tree_bytes(legacy_dir), legacy_before)

            cache_root = root / "cache-key"
            cache_codex = cache_root / ".codex"
            cache_run = cache_root / "run"
            a_id = "44444444-4444-4444-8444-444444444444"
            b_id = "55555555-5555-4555-8555-555555555555"
            for native_id, text in ((a_id, "Human family A."), (b_id, "Generated family B.")):
                path = cache_codex / "sessions" / "2026" / "08" / f"{native_id}.jsonl"
                write_records(
                    path,
                    [
                        record(CURRENT_AT, "session_meta", {"id": native_id, "cwd": "/Users/rifont/git/tau"}),
                        record(
                            CURRENT_AT,
                            "response_item",
                            {"type": "message", "role": "user", "id": f"message-{native_id}", "content": [{"type": "input_text", "text": text}]},
                        ),
                    ],
                )
            cache_config = Config(
                run_dir=cache_run,
                cutoff=parse_utc("2026-06-06T00:00:00Z"),
                recent_cutoff=parse_utc("2026-08-05T00:00:00Z"),
                watermark=parse_utc("2026-09-04T20:32:13Z"),
                codex_home=cache_codex,
                claude_home=cache_root / ".claude",
                claude_app_support=cache_root / "Claude",
                reserve_bytes=0,
            )
            estimate_run = cache_root / "estimate-run"
            estimate_config = replace(cache_config, run_dir=estimate_run, estimate_only=True)
            collect(estimate_config)
            estimate_then_collect = collect(replace(estimate_config, estimate_only=False))
            self.assertEqual(estimate_then_collect["collection_status"], "archived-available-sources")
            collect(cache_config)
            first_sources = [json.loads(line) for line in (cache_run / "sources.jsonl").read_text().splitlines()]
            first_sources_by_native = {item["native_id"]: item for item in first_sources}
            family_by_native = {item["native_id"]: item["family_id"] for item in first_sources}
            first_families = {
                item["family_id"]: item for item in map(json.loads, (cache_run / "families.jsonl").read_text().splitlines())
            }
            generated_manifest = cache_root / "generated-sources.json"
            generated_manifest.write_text(
                json.dumps({"sources": [{"provider": "codex", "native_id": b_id, "purpose": "fixture", "provenance": "test"}]})
            )
            generated_config = Config(
                **{**cache_config.__dict__, "generated_source_manifest": generated_manifest}
            )
            collect(generated_config)
            second_families = {
                item["family_id"]: item for item in map(json.loads, (cache_run / "families.jsonl").read_text().splitlines())
            }
            family_a = family_by_native[a_id]
            family_b = family_by_native[b_id]
            self.assertEqual(second_families[family_a]["collection_status"], "reused")
            self.assertEqual(first_families[family_a]["fingerprint"], second_families[family_a]["fingerprint"])
            self.assertEqual(first_families[family_a]["compressed_sha256"], second_families[family_a]["compressed_sha256"])
            self.assertEqual(second_families[family_b]["collection_status"], "processed")
            self.assertNotEqual(first_families[family_b]["fingerprint"], second_families[family_b]["fingerprint"])
            self.assertNotEqual(first_families[family_b]["episode_path"], second_families[family_b]["episode_path"])
            self.assertEqual(
                collector_module.file_sha256(cache_run / first_families[family_b]["episode_path"]),
                first_families[family_b]["compressed_sha256"],
            )
            second_sources = {
                item["native_id"]: item
                for item in map(json.loads, (cache_run / "sources.jsonl").read_text().splitlines())
            }
            self.assertEqual(first_sources_by_native[a_id]["snapshot_path"], second_sources[a_id]["snapshot_path"])
            self.assertEqual(first_sources_by_native[b_id]["snapshot_path"], second_sources[b_id]["snapshot_path"])
            generated_episode = read_gzip_jsonl(cache_run / second_families[family_b]["episode_path"])
            generated_event = next(item for item in generated_episode if item["text"] == "Generated family B.")
            self.assertEqual(generated_event["classification"], "generated-evaluation-context")
            self.assertFalse(generated_event["preference_eligible"])


if __name__ == "__main__":
    unittest.main()
