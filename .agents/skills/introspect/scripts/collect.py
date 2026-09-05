#!/usr/bin/env python3
"""Collect sanitized, lineage-aware local Codex and Claude transcript snapshots."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO, Iterable, Iterator
from urllib.parse import quote

SCHEMA_VERSION = 1
TRANSFORM_VERSION = 6
GIB = 1024**3
DEFAULT_RESERVE_BYTES = 3 * GIB
RECORD_PREFIX_BYTES = 64 * 1024
STATE_NAME = "collection-state.json"
CAPTURE_IDENTITY_NAME = "capture-identity.json"

TIMESTAMP_RE = re.compile(rb'"timestamp"\s*:\s*"([^"\\]{1,64})"')
TYPE_RE = re.compile(rb'"type"\s*:\s*"([^"\\]{1,96})"')
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)

SENSITIVE_KEYS = {
    "accesskey",
    "accesskeyid",
    "accesstoken",
    "apikey",
    "authorization",
    "authtoken",
    "bearertoken",
    "clientsecret",
    "cookie",
    "credentials",
    "idtoken",
    "password",
    "passwd",
    "privatekey",
    "proxyauthorization",
    "refreshtoken",
    "secretaccesskey",
    "secretkey",
    "setcookie",
}
SAFE_TOKEN_KEYS = {
    "completiontokens",
    "contextwindow",
    "inputtokens",
    "outputtokens",
    "tokencount",
    "tokenlimit",
    "tokensused",
}
INJECTION_MARKERS = (
    "# AGENTS.md instructions for ",
    "<app-context>",
    "<environment_context>",
    "<plugins_instructions>",
    "<permissions instructions>",
    "<recommended_plugins>",
    "<skills_instructions>",
)
CONTEXT_BLOCK_RE = re.compile(
    r"<(?P<tag>app-context|environment_context|plugins_instructions|permissions instructions|recommended_plugins|skills_instructions)>.*?</(?P=tag)>",
    re.DOTALL,
)
AGENTS_BLOCK_RE = re.compile(
    r"# AGENTS\.md instructions for [^\n]+\n+<INSTRUCTIONS>.*?</INSTRUCTIONS>", re.DOTALL
)

EMBEDDED_SECRET_PATTERNS = (
    ("anthropic-key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{16,}\b")),
    ("openai-key", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")),
    ("github-token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b")),
    ("slack-token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{16,}\b")),
    ("aws-access-key", re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
    ("oauth-token", re.compile(r"\bya29\.[A-Za-z0-9_-]{16,}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")),
    ("authorization", re.compile(r"(?i)(\b(?:Bearer|Basic)\s+)([A-Za-z0-9._~+/=-]{8,})")),
    (
        "json-credential",
        re.compile(
            r'(?i)(["\'](?:[a-z][a-z0-9]*[_-])*(?:access[_-]?key|api[_-]?key|authorization|cookie|credentials|password|passwd|private[_-]?key|secret|token)["\']\s*:\s*["\'])([^"\']{8,})(["\'])'
        ),
    ),
    ("url-credential", re.compile(r"(?i)(\b[a-z][a-z0-9+.-]*://[^/\s:@]+:)([^@\s/]+)(@)")),
    (
        "credential-assignment",
        re.compile(
            r"(?i)(\b(?:[a-z][a-z0-9]*[_-])*(?:access[_-]?key|api[_-]?key|authorization|cookie|credentials|password|passwd|private[_-]?key|secret|token)\b\s*[:=]\s*)([^\s,;\]\}\"']{8,})"
        ),
    ),
    (
        "private-key",
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", re.S),
    ),
)


@dataclass(frozen=True)
class Config:
    run_dir: Path
    cutoff: datetime
    recent_cutoff: datetime
    watermark: datetime
    codex_home: Path
    claude_home: Path
    claude_app_support: Path
    generated_source_manifest: Path | None = None
    reserve_bytes: int = DEFAULT_RESERVE_BYTES
    estimate_only: bool = False


class LowDiskError(RuntimeError):
    pass


class CaptureIdentityError(ValueError):
    pass


class UnionFind:
    def __init__(self) -> None:
        self.parents: dict[str, str] = {}

    def add(self, value: str) -> None:
        self.parents.setdefault(value, value)

    def find(self, value: str) -> str:
        self.add(value)
        parent = self.parents[value]
        if parent != value:
            self.parents[value] = self.find(parent)
        return self.parents[value]

    def union(self, left: str, right: str) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root != right_root:
            self.parents[max(left_root, right_root)] = min(left_root, right_root)


def parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"timestamp requires an explicit UTC offset: {value}")
    return parsed.astimezone(timezone.utc)


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(f".{path.name}.partial")
    partial.write_bytes(json_bytes(value) + b"\n")
    os.replace(partial, path)


def capture_identity(config: Config) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "transform_version": TRANSFORM_VERSION,
        "cutoff_utc": iso(config.cutoff),
        "recent_cutoff_utc": iso(config.recent_cutoff),
        "watermark_utc": iso(config.watermark),
        "native_roots": {
            "codex_home": str(config.codex_home.resolve()),
            "claude_home": str(config.claude_home.resolve()),
            "claude_app_support": str(config.claude_app_support.resolve()),
        },
    }


def validate_config(config: Config) -> None:
    if any(value.tzinfo is None or value.utcoffset() is None for value in (config.cutoff, config.recent_cutoff, config.watermark)):
        raise ValueError("capture timestamps require an explicit UTC offset")
    if not config.cutoff < config.recent_cutoff < config.watermark:
        raise ValueError("expected cutoff < recent_cutoff < watermark")
    if config.reserve_bytes < 0:
        raise ValueError("reserve_bytes must be non-negative")


def establish_capture_identity(config: Config) -> None:
    expected = capture_identity(config)
    identity_path = config.run_dir / "lanes" / "collector" / CAPTURE_IDENTITY_NAME
    if identity_path.exists():
        try:
            existing = json.loads(identity_path.read_text())
        except (json.JSONDecodeError, OSError) as error:
            raise CaptureIdentityError(
                f"run capture identity is unreadable; use a new run directory: {config.run_dir}"
            ) from error
        if existing != expected:
            raise CaptureIdentityError(
                f"run capture identity does not match requested capture; use a new run directory: {config.run_dir}"
            )
        return
    captured_paths = (
        "sources.jsonl", "families.jsonl", "corpus-summary.json", "transcripts", "episodes",
        f"lanes/collector/{STATE_NAME}", "lanes/collector/source-inventory.json",
        "lanes/collector/progress.json", "lanes/collector/ready-families.jsonl",
        "lanes/collector/delta.json", "lanes/collector/compression-estimate.json",
    )
    if any((config.run_dir / relative).exists() for relative in captured_paths):
        raise CaptureIdentityError(
            f"populated legacy run has no complete capture identity; use a new run directory: {config.run_dir}"
        )
    config.run_dir.mkdir(parents=True, exist_ok=True)
    atomic_json(identity_path, expected)


def atomic_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(f".{path.name}.partial")
    with partial.open("wb") as output:
        for row in rows:
            output.write(json_bytes(row) + b"\n")
        output.flush()
        os.fsync(output.fileno())
    os.replace(partial, path)


def gzip_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(f".{path.name}.partial")
    with partial.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=6, mtime=0) as output:
            for row in rows:
                output.write(json_bytes(row) + b"\n")
        raw.flush()
        os.fsync(raw.fileno())
    os.replace(partial, path)


def zstd_binary() -> str:
    binary = shutil.which("zstd")
    if binary is None:
        raise RuntimeError("zstd is required for lossless transcript snapshots")
    return binary


def verify_zstd(path: Path) -> None:
    result = subprocess.run(
        [zstd_binary(), "-q", "-t", str(path)],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise OSError(f"zstd integrity check failed for {path}: {result.stderr.decode('utf-8', 'replace')[:240]}")


def zstd_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(f".{path.name}.partial")
    try:
        with partial.open("wb") as output:
            process = subprocess.Popen(
                [zstd_binary(), "-c", "-q", "-3", "--long=27"],
                stdin=subprocess.PIPE,
                stdout=output,
                stderr=subprocess.PIPE,
            )
            assert process.stdin is not None
            assert process.stderr is not None
            try:
                for row in rows:
                    process.stdin.write(json_bytes(row) + b"\n")
                process.stdin.close()
                returncode = process.wait()
                error = process.stderr.read()
                process.stderr.close()
            except BaseException:
                process.kill()
                process.wait()
                raise
            if returncode != 0:
                raise OSError(f"zstd failed with exit {returncode}: {error.decode('utf-8', 'replace')[:240]}")
            output.flush()
            os.fsync(output.fileno())
        verify_zstd(partial)
        os.replace(partial, path)
    except BaseException:
        partial.unlink(missing_ok=True)
        raise


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return default


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    try:
        return [json.loads(line) for line in path.read_text().splitlines() if line]
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def generated_source_registry(path: Path | None) -> dict[tuple[str, str], dict[str, Any]]:
    if path is None:
        return {}
    value = json.loads(path.read_text())
    records = value.get("sources") if isinstance(value, dict) else value
    if not isinstance(records, list):
        raise ValueError("generated-source manifest must be a JSON list or an object with a sources list")
    result: dict[tuple[str, str], dict[str, Any]] = {}
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("provider"), str):
            raise ValueError("each generated-source record requires provider and native_id or source_key")
        identity = record.get("source_key") or record.get("native_id")
        if not isinstance(identity, str):
            raise ValueError("each generated-source record requires native_id or source_key")
        result[(record["provider"], identity)] = record
    return result


def sqlite_readonly(path: Path) -> sqlite3.Connection:
    uri = f"file:{quote(str(path))}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only = ON")
    return connection


def file_id(path: Path) -> str:
    matches = UUID_RE.findall(path.stem)
    return matches[-1].lower() if matches else sha256_bytes(str(path).encode())[:32]


def claude_project(path: Path, project_root: Path) -> str:
    return path.relative_to(project_root).parts[0]


def claude_root_id(path: Path, project_root: Path) -> str:
    relative = path.relative_to(project_root)
    if "subagents" in relative.parts:
        return relative.parts[1]
    return path.stem


def source_key(provider: str, path: Path, project_root: Path | None = None) -> str:
    if provider == "codex":
        return f"codex:{file_id(path)}"
    assert project_root is not None
    relative = path.relative_to(project_root).as_posix()
    return f"claude:{sha256_bytes(relative.encode())[:20]}"


def normalize_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.lower())


def credential_key(key: str) -> bool:
    normalized = normalize_key(key)
    if normalized in SAFE_TOKEN_KEYS:
        return False
    return normalized in SENSITIVE_KEYS or normalized.endswith(
        ("accesskey", "apikey", "authorization", "authtoken", "clientsecret", "cookie", "credentials", "password", "privatekey", "refreshtoken", "secretkey")
    )


def marker(kind: str, value: str | bytes) -> str:
    raw = value.encode("utf-8", "surrogatepass") if isinstance(value, str) else value
    return f"<introspect:{kind}:bytes={len(raw)}>"


def redact_embedded(value: str) -> tuple[str, list[str]]:
    changes: list[str] = []
    output = value
    for kind, pattern in EMBEDDED_SECRET_PATTERNS:
        def replace(match: re.Match[str]) -> str:
            changes.append(kind)
            if kind in {"authorization", "credential-assignment"}:
                return f"{match.group(1)}{marker('redacted-credential', match.group(2))}"
            if kind in {"json-credential", "url-credential"}:
                return f"{match.group(1)}{marker('redacted-credential', match.group(2))}{match.group(3)}"
            return marker("redacted-credential", match.group(0))

        output = pattern.sub(replace, output)
    return output, changes


def looks_like_binary(value: str) -> bool:
    if value.startswith("data:") and ";base64," in value[:256]:
        return True
    if len(value) < 64 * 1024:
        return False
    sample = value[:4096]
    allowed = sum(char.isalnum() or char in "+/=_-\r\n" for char in sample)
    return allowed / max(len(sample), 1) > 0.98


def sanitize(value: Any, path: str = "$") -> tuple[Any, list[dict[str, str]]]:
    changes: list[dict[str, str]] = []
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if credential_key(str(key)):
                raw = json_bytes(child)
                sanitized[key] = marker("redacted-credential", raw)
                changes.append({"path": child_path, "kind": "credential-key"})
                continue
            sanitized_child, child_changes = sanitize(child, child_path)
            sanitized[key] = sanitized_child
            changes.extend(child_changes)
        return sanitized, changes
    if isinstance(value, list):
        sanitized_list: list[Any] = []
        for index, child in enumerate(value):
            sanitized_child, child_changes = sanitize(child, f"{path}[{index}]")
            sanitized_list.append(sanitized_child)
            changes.extend(child_changes)
        return sanitized_list, changes
    if isinstance(value, str):
        if looks_like_binary(value):
            changes.append({"path": path, "kind": "binary-payload"})
            return marker("binary-payload", value), changes
        sanitized_string, kinds = redact_embedded(value)
        changes.extend({"path": path, "kind": kind} for kind in kinds)
        return sanitized_string, changes
    return value, changes


def prefix_metadata(raw: bytes) -> tuple[datetime | None, list[str]]:
    prefix = raw[:RECORD_PREFIX_BYTES]
    timestamp_match = TIMESTAMP_RE.search(prefix)
    timestamp = None
    if timestamp_match:
        try:
            timestamp = parse_utc(timestamp_match.group(1).decode("ascii"))
        except (UnicodeDecodeError, ValueError):
            pass
    types = [item.decode("utf-8", "replace") for item in TYPE_RE.findall(prefix)[:3]]
    return timestamp, types


def complete_lines(path: Path, limit: int) -> Iterator[tuple[int, int, int, bytes, bool]]:
    with path.open("rb") as source:
        line_number = 0
        offset = 0
        while offset < limit:
            raw = source.readline(limit - offset + 1)
            if not raw:
                return
            line_number += 1
            end = offset + len(raw)
            crossed_limit = end > limit
            if crossed_limit:
                yield line_number, offset, end, raw, False
                return
            complete = raw.endswith(b"\n")
            if not complete and end == limit:
                try:
                    json.loads(raw)
                    complete = True
                except (json.JSONDecodeError, UnicodeDecodeError):
                    pass
            yield line_number, offset, end, raw, complete
            if not complete:
                return
            offset = end


def selected_head_metadata(record: dict[str, Any], provider: str) -> dict[str, Any]:
    payload = record.get("payload") if provider == "codex" else record
    if not isinstance(payload, dict):
        return {}
    allowed = (
        "agentId",
        "agent_path",
        "cwd",
        "entrypoint",
        "forked_from_id",
        "gitBranch",
        "id",
        "isSidechain",
        "originator",
        "parent_thread_id",
        "sessionId",
        "thread_source",
        "type",
        "userType",
    )
    result = {key: payload[key] for key in allowed if key in payload and not isinstance(payload[key], (dict, list))}
    source = payload.get("source")
    if isinstance(source, str):
        result["source"] = source
    elif isinstance(source, dict):
        result["source_kind"] = sorted(source.keys())
    return result


def scan_source(path: Path, provider: str, watermark: datetime) -> dict[str, Any]:
    before = path.stat()
    digest = hashlib.sha256()
    first_event: datetime | None = None
    last_event: datetime | None = None
    boundary = 0
    records = 0
    parse_failures = 0
    trailing_partial = False
    stopped_at_watermark = False
    head: dict[str, Any] = {}
    for line_number, start, end, raw, complete in complete_lines(path, before.st_size):
        if not complete:
            trailing_partial = True
            break
        timestamp, _ = prefix_metadata(raw)
        if timestamp is not None and timestamp > watermark:
            stopped_at_watermark = True
            break
        if records < 8 and len(raw) <= 2 * 1024 * 1024:
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict) and not head:
                    head = selected_head_metadata(parsed, provider)
            except (json.JSONDecodeError, UnicodeDecodeError):
                parse_failures += 1
        digest.update(raw)
        boundary = end
        records += 1
        if timestamp is not None:
            first_event = timestamp if first_event is None else min(first_event, timestamp)
            last_event = timestamp if last_event is None else max(last_event, timestamp)
    after = path.stat()
    return {
        "source_size": before.st_size,
        "source_mtime_ns": before.st_mtime_ns,
        "capture_boundary": boundary,
        "source_prefix_sha256": digest.hexdigest(),
        "record_count": records,
        "first_event_at": iso(first_event),
        "last_event_at": iso(last_event),
        "preflight_parse_failures": parse_failures,
        "trailing_partial": trailing_partial,
        "stopped_at_watermark": stopped_at_watermark,
        "changed_while_scanning": before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns,
        "head": head,
    }


def codex_index(codex_home: Path) -> tuple[dict[str, dict[str, Any]], list[tuple[str, str]], list[dict[str, Any]]]:
    database = codex_home / "state_5.sqlite"
    if not database.exists():
        return {}, [], []
    threads: dict[str, dict[str, Any]] = {}
    edges: list[tuple[str, str]] = []
    missing: list[dict[str, Any]] = []
    with sqlite_readonly(database) as connection:
        for row in connection.execute(
            "SELECT id, rollout_path, created_at_ms, recency_at_ms, cwd, git_origin_url, git_branch, archived, "
            "thread_source, agent_path, project_id FROM threads"
        ):
            item = dict(row)
            threads[item["id"]] = item
            if not Path(item["rollout_path"]).exists():
                missing.append(item)
        edges = [(row[0], row[1]) for row in connection.execute("SELECT parent_thread_id, child_thread_id FROM thread_spawn_edges")]
    return threads, edges, missing


def codex_cloud_catalog(codex_home: Path) -> dict[str, int]:
    database = codex_home / "sqlite" / "codex-dev.db"
    result: Counter[str] = Counter()
    if not database.exists():
        return {}
    try:
        with sqlite_readonly(database) as connection:
            for row in connection.execute("SELECT source_kind, COUNT(*) FROM local_thread_catalog GROUP BY source_kind"):
                result[str(row[0])] = int(row[1])
    except sqlite3.Error:
        return {}
    return dict(result)


def discover_sources(config: Config, previous: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], list[tuple[str, str]], list[dict[str, Any]]]:
    codex_threads, codex_edges, missing_codex = codex_index(config.codex_home)
    candidates: list[tuple[str, str, Path, Path | None]] = []
    for root in (config.codex_home / "sessions", config.codex_home / "archived_sessions"):
        if root.exists():
            candidates.extend(("codex", "rollout", path, None) for path in root.rglob("*.jsonl"))
    claude_projects = config.claude_home / "projects"
    if claude_projects.exists():
        for path in claude_projects.rglob("*.jsonl"):
            kind = "subagent" if "subagents" in path.parts else "root"
            candidates.append(("claude", kind, path, claude_projects))
    rows: list[dict[str, Any]] = []
    generated = generated_source_registry(config.generated_source_manifest)
    state_sources = previous.get("sources", {}) if previous.get("watermark_utc") == iso(config.watermark) else {}
    for provider, kind, path, project_root in sorted(candidates, key=lambda item: str(item[2])):
        key = source_key(provider, path, project_root)
        stat = path.stat()
        prior = state_sources.get(str(path))
        unchanged = bool(prior and prior.get("source_size") == stat.st_size and prior.get("source_mtime_ns") == stat.st_mtime_ns)
        scan = dict(prior["scan"]) if unchanged else scan_source(path, provider, config.watermark)
        native_id = file_id(path) if provider == "codex" else (claude_root_id(path, project_root) if kind == "root" else path.stem)
        row: dict[str, Any] = {
            "schema_version": SCHEMA_VERSION,
            "source_key": key,
            "provider": provider,
            "kind": kind,
            "source_path": str(path),
            "native_id": native_id,
            "scan_reused": unchanged,
            "source_size": stat.st_size,
            "source_mtime_ns": stat.st_mtime_ns,
            **scan,
        }
        generated_record = generated.get((provider, key)) or generated.get((provider, native_id))
        if generated_record:
            row["generated_source"] = {
                "registered": True,
                "provenance": generated_record.get("provenance"),
                "purpose": generated_record.get("purpose"),
            }
        if provider == "codex":
            indexed = codex_threads.get(native_id, {})
            row["index"] = {
                name: indexed.get(name)
                for name in ("archived", "cwd", "git_branch", "git_origin_url", "project_id", "thread_source", "agent_path")
                if indexed.get(name) is not None
            }
            row["project"] = classify_codex_project(indexed, scan.get("head", {}))
        else:
            assert project_root is not None
            project = claude_project(path, project_root)
            root_id = claude_root_id(path, project_root)
            row["project_bucket"] = project
            row["root_native_id"] = root_id
            row["project"] = classify_claude_project(project, scan.get("head", {}))
            if kind == "subagent":
                row["parent_native_id"] = root_id
        rows.append(row)
    return rows, codex_threads, codex_edges, missing_codex


def classify_codex_project(indexed: dict[str, Any], head: dict[str, Any]) -> dict[str, str]:
    cwd = str(indexed.get("cwd") or head.get("cwd") or "")
    origin = str(indexed.get("git_origin_url") or "")
    if cwd == "/Users/rifont/git/tau" or cwd.startswith("/Users/rifont/git/tau/"):
        return {"scope": "tau", "evidence": "cwd"}
    if "/.codex/worktrees/" in cwd and cwd.endswith("/tau"):
        return {"scope": "tau", "evidence": "codex-worktree-cwd"}
    if "taucad/tau" in origin:
        return {"scope": "tau", "evidence": "git-origin"}
    return {"scope": "other", "evidence": "cwd-or-index"}


def classify_claude_project(project: str, head: dict[str, Any]) -> dict[str, str]:
    cwd = str(head.get("cwd") or "")
    if "-Users-rifont-git-tau" in project or "-T-tau-" in project:
        return {"scope": "tau", "evidence": "encoded-cwd"}
    if cwd == "/Users/rifont/git/tau" or cwd.startswith("/Users/rifont/git/tau/"):
        return {"scope": "tau", "evidence": "event-cwd"}
    return {"scope": "other", "evidence": "encoded-cwd-or-event"}


def desktop_metadata(
    config: Config, direct_by_native: dict[str, str], previous: dict[str, dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[tuple[str, str]], list[dict[str, Any]]]:
    root = config.claude_app_support / "claude-code-sessions"
    rows: list[dict[str, Any]] = []
    edges: list[tuple[str, str]] = []
    unavailable: list[dict[str, Any]] = []
    local_to_cli: dict[str, str] = {}
    parsed: list[tuple[Path, dict[str, Any]]] = []
    if not root.exists():
        return rows, edges, unavailable
    for path in sorted(root.rglob("*.json")):
        try:
            value = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError) as error:
            rows.append({"provider": "claude-desktop", "kind": "metadata", "source_path": str(path), "status": "parse-error", "error": type(error).__name__})
            continue
        parsed.append((path, value))
        local_id = value.get("sessionId")
        cli_id = value.get("cliSessionId")
        if isinstance(local_id, str) and isinstance(cli_id, str):
            local_to_cli[local_id] = cli_id
    for path, value in parsed:
        native_id = str(value.get("sessionId") or file_id(path))
        cli_id = value.get("cliSessionId")
        prior_ids = [item for item in value.get("priorCliSessionIds", []) if isinstance(item, str)]
        sanitized, changes = sanitize(value)
        envelope = {"schema": "introspect.desktop-metadata.v1", "source_path": str(path), "redactions": changes, "record": sanitized}
        content_identity = sha256_bytes(json_bytes({"transform_version": TRANSFORM_VERSION, "envelope": envelope}))
        safe_id = sha256_bytes(f"claude-desktop:{native_id}".encode())[:20]
        relative = Path("transcripts") / "claude" / "desktop" / f"{safe_id}.{content_identity}.jsonl.gz"
        snapshot = config.run_dir / relative
        prior = previous.get(f"claude-desktop:{native_id}")
        reused = bool(
            prior
            and prior.get("content_identity") == content_identity
            and prior.get("snapshot_path") == str(relative)
            and snapshot.exists()
            and prior.get("compressed_sha256") == file_sha256(snapshot)
        )
        if not reused:
            gzip_jsonl(snapshot, [envelope])
        compressed_sha256 = file_sha256(snapshot)
        row = {
            "schema_version": SCHEMA_VERSION,
            "source_key": f"claude-desktop:{native_id}",
            "provider": "claude-desktop",
            "kind": "metadata",
            "source_path": str(path),
            "native_id": native_id,
            "status": "metadata-only",
            "snapshot_path": str(relative),
            "content_identity": content_identity,
            "compressed_sha256": compressed_sha256,
            "collection_status": "reused" if reused else "processed",
            "last_event_at": iso(datetime.fromtimestamp(value["lastActivityAt"] / 1000, timezone.utc)) if isinstance(value.get("lastActivityAt"), (int, float)) else None,
            "title_present": bool(value.get("title")),
            "title_source": value.get("titleSource"),
            "transcript_unavailable": value.get("transcriptUnavailable") is True,
            "cli_session_id": cli_id,
            "prior_cli_session_ids": prior_ids,
            "forked_from_session_id": value.get("forkedFromSessionId"),
            "redaction_count": len(changes),
        }
        rows.append(row)
        cli_key = direct_by_native.get(cli_id) if isinstance(cli_id, str) else None
        if cli_key:
            for prior in prior_ids:
                prior_key = direct_by_native.get(prior)
                if prior_key:
                    edges.append((prior_key, cli_key))
            fork_local = value.get("forkedFromSessionId")
            fork_cli = local_to_cli.get(fork_local) if isinstance(fork_local, str) else None
            fork_key = direct_by_native.get(fork_cli) if fork_cli else None
            if fork_key:
                edges.append((fork_key, cli_key))
        if value.get("transcriptUnavailable") is True or (isinstance(cli_id, str) and cli_id not in direct_by_native):
            unavailable.append(row)
    return rows, edges, unavailable


def explicit_import_edges(codex_home: Path, by_path: dict[str, str], codex_by_id: dict[str, str]) -> list[tuple[str, str]]:
    data = read_json(codex_home / "external_agent_session_imports.json", {})
    edges: list[tuple[str, str]] = []
    for record in data.get("records", []):
        source = by_path.get(str(record.get("source_path")))
        imported = codex_by_id.get(str(record.get("imported_thread_id")))
        if source and imported:
            edges.append((source, imported))
    return edges


def connect_families(
    sources: list[dict[str, Any]],
    codex_edges: list[tuple[str, str]],
    desktop_edges: list[tuple[str, str]],
    import_edges: list[tuple[str, str]],
    native_dialogue_edges: list[tuple[str, str]],
) -> tuple[dict[str, str], dict[str, list[str]], list[tuple[str, str]]]:
    union = UnionFind()
    codex_by_id = {row["native_id"]: row["source_key"] for row in sources if row["provider"] == "codex"}
    claude_direct = {
        (row.get("project_bucket"), row["native_id"]): row["source_key"]
        for row in sources
        if row["provider"] == "claude" and row["kind"] == "root"
    }
    resolved_edges: list[tuple[str, str]] = []
    for row in sources:
        union.add(row["source_key"])
        if row["provider"] == "claude" and row["kind"] == "subagent":
            parent = claude_direct.get((row.get("project_bucket"), row.get("parent_native_id")))
            if parent:
                resolved_edges.append((parent, row["source_key"]))
        head = row.get("head", {})
        if row["provider"] == "codex":
            for parent_id in (head.get("parent_thread_id"), head.get("forked_from_id")):
                if isinstance(parent_id, str) and parent_id in codex_by_id:
                    resolved_edges.append((codex_by_id[parent_id], row["source_key"]))
    for parent_id, child_id in codex_edges:
        if parent_id in codex_by_id and child_id in codex_by_id:
            resolved_edges.append((codex_by_id[parent_id], codex_by_id[child_id]))
    resolved_edges.extend(desktop_edges)
    resolved_edges.extend(import_edges)
    for left, right in resolved_edges:
        union.union(left, right)
    for left, right in native_dialogue_edges:
        union.union(left, right)
    groups: dict[str, list[str]] = defaultdict(list)
    for row in sources:
        groups[union.find(row["source_key"])].append(row["source_key"])
    family_for: dict[str, str] = {}
    families: dict[str, list[str]] = {}
    by_key = {row["source_key"]: row for row in sources}
    for members in groups.values():
        ordered = sorted(members, key=lambda key: (by_key[key].get("first_event_at") or "9999", key))
        family_id = f"family-{sha256_bytes(ordered[0].encode())[:20]}"
        families[family_id] = sorted(members)
        family_for.update({member: family_id for member in members})
    return family_for, families, resolved_edges


def disk_guard(path: Path, reserve_bytes: int) -> None:
    existing = path
    while not existing.exists() and existing != existing.parent:
        existing = existing.parent
    free = shutil.disk_usage(existing).free
    if free < reserve_bytes:
        raise LowDiskError(f"free space {free} is below reserve {reserve_bytes}")


def snapshot_rows(row: dict[str, Any], watermark: datetime) -> Iterator[dict[str, Any]]:
    path = Path(row["source_path"])
    boundary = int(row["capture_boundary"])
    provider = row["provider"]
    digest = hashlib.sha256()
    consumed = 0
    for line_number, start, end, raw, complete in complete_lines(path, boundary):
        if not complete or end > boundary:
            raise OSError(f"source prefix changed before complete-record boundary: {path}")
        timestamp, _ = prefix_metadata(raw)
        if timestamp is not None and timestamp > watermark:
            raise OSError(f"source prefix no longer matches frozen watermark: {path}")
        digest.update(raw)
        consumed = end
        envelope: dict[str, Any] = {
            "schema": "introspect.native-record.v1",
            "source_key": row["source_key"],
            "line": line_number,
            "byte_start": start,
            "byte_end": end,
        }
        try:
            native = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            envelope["record"] = None
            envelope["parse_error"] = {"type": type(error).__name__, "message": "record could not be parsed"}
            yield envelope
            continue
        sanitized, changes = sanitize(native)
        envelope["record"] = sanitized
        if changes:
            envelope["redactions"] = changes
        yield envelope
    if consumed != boundary or digest.hexdigest() != row["source_prefix_sha256"]:
        raise OSError(f"source prefix changed after census: {path}")


def write_snapshot(
    row: dict[str, Any], config: Config, prior: dict[str, Any] | None
) -> tuple[str, dict[str, int | str], bool]:
    provider = row["provider"]
    identity = sha256_bytes(
        json_bytes(
            {
                "transform_version": TRANSFORM_VERSION,
                "source_key": row["source_key"],
                "source_prefix_sha256": row.get("source_prefix_sha256"),
                "capture_boundary": row.get("capture_boundary"),
            }
        )
    )
    safe_id = sha256_bytes(row["source_key"].encode())[:20]
    if provider == "codex":
        relative = Path("transcripts") / "codex" / f"{safe_id}.{identity}.jsonl.zst"
    else:
        relative = Path("transcripts") / "claude" / f"{safe_id}.{identity}.jsonl.zst"
    destination = config.run_dir / relative
    same_prefix = bool(
        prior
        and prior.get("transform_version") == TRANSFORM_VERSION
        and prior.get("scan", {}).get("source_prefix_sha256") == row.get("source_prefix_sha256")
        and prior.get("scan", {}).get("capture_boundary") == row.get("capture_boundary")
        and prior.get("snapshot_path") == str(relative)
        and destination.exists()
        and prior.get("snapshot_counts", {}).get("compressed_sha256") == file_sha256(destination)
    )
    if same_prefix:
        return str(relative), dict(prior.get("snapshot_counts", {})), True
    disk_guard(destination, config.reserve_bytes + 512 * 1024 * 1024)
    counts: Counter[str] = Counter()

    def counted() -> Iterator[dict[str, Any]]:
        last_check = 0
        for envelope in snapshot_rows(row, config.watermark):
            counts["records"] += 1
            counts["parse_failures"] += int("parse_error" in envelope)
            counts["redactions"] += len(envelope.get("redactions", []))
            current = int(envelope["byte_end"])
            if current - last_check >= 256 * 1024 * 1024:
                disk_guard(destination, config.reserve_bytes + 512 * 1024 * 1024)
                last_check = current
            yield envelope

    partial = destination.with_name(f".{destination.name}.partial")
    try:
        zstd_jsonl(destination, counted())
        disk_guard(destination, config.reserve_bytes)
    except Exception:
        partial.unlink(missing_ok=True)
        raise
    counts["snapshot_bytes"] = destination.stat().st_size
    counts["compressed_sha256"] = file_sha256(destination)
    return str(relative), dict(counts), False


def text_parts(message: Any) -> list[str]:
    if isinstance(message, str):
        return [message]
    if isinstance(message, dict):
        return text_parts(message.get("content"))
    if not isinstance(message, list):
        return []
    result: list[str] = []
    for item in message:
        if isinstance(item, str):
            result.append(item)
        elif isinstance(item, dict) and item.get("type") in {"input_text", "output_text", "text"} and isinstance(item.get("text"), str):
            result.append(item["text"])
    return result


def extracted_message(provider: str, native: dict[str, Any]) -> tuple[str, str, str | None, str | None, dict[str, Any]] | None:
    timestamp = native.get("timestamp") if isinstance(native.get("timestamp"), str) else None
    if provider == "codex":
        payload = native.get("payload")
        if not isinstance(payload, dict):
            return None
        top_type = native.get("type")
        if top_type == "response_item" and payload.get("type") == "message" and payload.get("role") in {"user", "assistant"}:
            text = "\n".join(text_parts(payload.get("content")))
            return str(payload["role"]), text, payload.get("id"), timestamp, {"native_type": "response_item.message"}
        if top_type == "event_msg" and payload.get("type") in {"user_message", "agent_message"}:
            text = payload.get("message")
            if isinstance(text, str):
                role = "user" if payload["type"] == "user_message" else "assistant"
                return role, text, payload.get("id"), timestamp, {"native_type": f"event_msg.{payload['type']}"}
        if top_type == "compacted":
            text = "\n".join(text_parts(payload.get("message")))
            if text:
                return "assistant", text, payload.get("id"), timestamp, {
                    "native_type": "compacted",
                    "is_compact_summary": True,
                }
        return None
    record_type = native.get("type")
    if record_type not in {"user", "assistant"}:
        return None
    text = "\n".join(text_parts(native.get("message")))
    if not text:
        return None
    metadata = {
        "native_type": str(record_type),
        "user_type": native.get("userType"),
        "origin": native.get("origin"),
        "prompt_source": native.get("promptSource"),
        "is_compact_summary": native.get("isCompactSummary") is True,
        "is_meta": native.get("isMeta") is True,
        "content_types": sorted(
            {
                str(item.get("type"))
                for item in (native.get("message", {}).get("content", []) if isinstance(native.get("message"), dict) else [])
                if isinstance(item, dict) and item.get("type") is not None
            }
        ),
    }
    return str(record_type), text, native.get("uuid"), timestamp, metadata


def structurally_injected_only(text: str, markers: list[str]) -> bool:
    if not markers:
        return False
    remainder = CONTEXT_BLOCK_RE.sub("", text)
    remainder = AGENTS_BLOCK_RE.sub("", remainder)
    return not remainder.strip()


def message_classification(
    row: dict[str, Any], role: str, text: str, metadata: dict[str, Any]
) -> tuple[str, bool, list[str]]:
    markers = [value for value in INJECTION_MARKERS if value in text]
    if metadata.get("is_compact_summary"):
        return "compaction-summary", False, markers
    if metadata.get("is_meta"):
        return "claude-meta-context", False, markers
    if "tool_result" in metadata.get("content_types", []):
        return "tool-result-context", False, markers
    if row.get("generated_source", {}).get("registered"):
        return "generated-evaluation-context", False, markers
    if role == "user" and structurally_injected_only(text, markers):
        return "injected-context", False, markers
    if role == "assistant":
        return "visible-assistant", False, []
    delegated = is_delegated_source(row)
    if delegated:
        return "delegated-user-echo", False, markers
    if markers:
        return "mixed-user-and-injected-context", True, markers
    return "direct-user", True, []


def is_delegated_source(row: dict[str, Any]) -> bool:
    return (
        row["kind"] == "subagent"
        or row.get("index", {}).get("thread_source") == "subagent"
        or row.get("head", {}).get("thread_source") == "subagent"
        or row.get("head", {}).get("isSidechain") is True
    )


def shared_native_dialogue_edges(sources: list[dict[str, Any]], watermark: datetime) -> list[tuple[str, str]]:
    """Connect source files that contain the same real provider-native dialogue event."""
    excluded = {
        "claude-meta-context",
        "compaction-summary",
        "generated-evaluation-context",
        "injected-context",
        "tool-result-context",
    }
    first_source: dict[tuple[str, str, str, str, str], str] = {}
    edges: set[tuple[str, str]] = set()
    for row in sorted(sources, key=lambda item: item["source_key"]):
        if row["provider"] not in {"codex", "claude"}:
            continue
        for envelope in snapshot_rows(row, watermark):
            native = envelope.get("record")
            if not isinstance(native, dict):
                continue
            extracted = extracted_message(row["provider"], native)
            if extracted is None:
                continue
            role, text, native_id, timestamp, metadata = extracted
            if (
                not text
                or not isinstance(native_id, str)
                or not native_id
                or not isinstance(timestamp, str)
                or not timestamp
            ):
                continue
            classification, _, _ = message_classification(row, role, text, metadata)
            if classification in excluded:
                continue
            try:
                event_at = iso(parse_utc(timestamp)) or ""
            except ValueError:
                continue
            identity = (
                row["provider"],
                native_id,
                role,
                sha256_bytes(text.encode("utf-8", "surrogatepass")),
                event_at,
            )
            prior = first_source.setdefault(identity, row["source_key"])
            if prior != row["source_key"]:
                edges.add((prior, row["source_key"]))
    return sorted(edges)


def read_snapshot_messages(row: dict[str, Any], config: Config) -> Iterator[dict[str, Any]]:
    snapshot = config.run_dir / row["snapshot_path"]
    process = subprocess.Popen(
        [zstd_binary(), "-d", "-c", "-q", str(snapshot)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    assert process.stdout is not None
    assert process.stderr is not None
    try:
        source = process.stdout
        for line in source:
            envelope = json.loads(line)
            native = envelope.get("record")
            if not isinstance(native, dict):
                continue
            extracted = extracted_message(row["provider"], native)
            if extracted is None:
                continue
            role, text, native_id, timestamp, metadata = extracted
            if not text:
                continue
            classification, eligible, markers = message_classification(row, role, text, metadata)
            yield {
                "schema": "introspect.episode-event.v1",
                "source_key": row["source_key"],
                "source_path": row["source_path"],
                "source_line": envelope["line"],
                "source_byte_start": envelope["byte_start"],
                "source_event_id": native_id,
                "event_at": timestamp,
                "role": role,
                "text": text,
                "text_sha256": sha256_bytes(text.encode("utf-8", "surrogatepass")),
                "classification": classification,
                "preference_eligible": eligible,
                "injection_markers": markers,
                **metadata,
            }
    finally:
        process.stdout.close()
        returncode = process.wait()
        error = process.stderr.read()
        process.stderr.close()
        if returncode != 0:
            raise OSError(f"zstd decode failed for {snapshot}: {error[:240]}")


def write_family_episode(
    family_id: str, members: list[dict[str, Any]], config: Config, fingerprint: str, prior_family: dict[str, Any] | None
) -> dict[str, Any]:
    relative = Path("episodes") / f"{family_id}.{fingerprint}.jsonl.gz"
    destination = config.run_dir / relative
    if (
        prior_family
        and prior_family.get("transform_version") == TRANSFORM_VERSION
        and prior_family.get("fingerprint") == fingerprint
        and prior_family.get("episode_path") == str(relative)
        and destination.exists()
        and prior_family.get("compressed_sha256") == file_sha256(destination)
    ):
        return {**prior_family, "collection_status": "reused", "episode_path": str(relative)}
    member_by_key = {member["source_key"]: member for member in members}

    def ordered_ancestors(source_key: str) -> list[str]:
        distances: dict[str, int] = {}
        pending = [(parent, 1) for parent in member_by_key[source_key].get("lineage_parents", [])]
        while pending:
            parent, distance = pending.pop(0)
            if parent not in member_by_key or distances.get(parent, distance + 1) <= distance:
                continue
            distances[parent] = distance
            pending.extend(
                (ancestor, distance + 1) for ancestor in member_by_key[parent].get("lineage_parents", [])
            )
        return [source_key for source_key, _ in sorted(distances.items(), key=lambda item: (item[1], item[0]))]

    ancestors = {member["source_key"]: ordered_ancestors(member["source_key"]) for member in members}
    seen_ids: dict[tuple[str, str, str, str, str], dict[str, Any]] = {}
    source_native_events: dict[
        str, dict[tuple[str, str, str, str], list[dict[str, Any]]]
    ] = defaultdict(lambda: defaultdict(list))
    source_events: dict[str, dict[tuple[str, str, str], list[dict[str, Any]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    source_occurrences: Counter[tuple[str, str, str, str]] = Counter()
    counts: Counter[str] = Counter()
    text_bytes = 0
    def episode_rows() -> Iterator[dict[str, Any]]:
        nonlocal text_bytes
        for member in sorted(
            members,
            key=lambda item: (
                len(ancestors[item["source_key"]]),
                item.get("first_event_at") or "",
                item["source_key"],
            ),
        ):
            for event in read_snapshot_messages(member, config):
                event["family_id"] = family_id
                duplicate: dict[str, Any] | None = None
                native_id = event.get("source_event_id")
                event_at = event.get("event_at")
                normalized_event_at: str | None = None
                if isinstance(event_at, str) and event_at:
                    try:
                        normalized_event_at = iso(parse_utc(event_at))
                    except ValueError:
                        pass
                lineage_key = (
                    (event["role"], event["text_sha256"], normalized_event_at)
                    if normalized_event_at
                    else None
                )
                native_key: tuple[str, str, str, str, str] | None = None
                ancestor_native_key: tuple[str, str, str, str] | None = None
                if isinstance(native_id, str) and native_id:
                    ancestor_native_key = (
                        member["provider"],
                        native_id,
                        event["role"],
                        event["text_sha256"],
                    )
                    if normalized_event_at:
                        native_key = (
                            member["provider"],
                            native_id,
                            event["role"],
                            event["text_sha256"],
                            normalized_event_at,
                        )
                        duplicate = seen_ids.get(native_key)
                    if duplicate is None:
                        for ancestor in ancestors[member["source_key"]]:
                            if member_by_key[ancestor]["provider"] != member["provider"]:
                                continue
                            prior_events = source_native_events[ancestor][ancestor_native_key]
                            if prior_events:
                                duplicate = prior_events[0]
                                break
                elif lineage_key is not None:
                    occurrence_key = (member["source_key"], *lineage_key)
                    source_occurrences[occurrence_key] += 1
                    occurrence = source_occurrences[occurrence_key]
                    for ancestor in ancestors[member["source_key"]]:
                        if member_by_key[ancestor]["provider"] != member["provider"]:
                            continue
                        prior_occurrences = source_events[ancestor][lineage_key]
                        if occurrence <= len(prior_occurrences):
                            duplicate = prior_occurrences[occurrence - 1]
                            break
                if duplicate:
                    event["duplicate_of"] = {
                        "source_key": duplicate["source_key"],
                        "source_line": duplicate["source_line"],
                        "source_event_id": duplicate.get("source_event_id"),
                    }
                    event["preference_eligible"] = False
                    event["classification"] = "inherited-exact-event"
                    counts["inherited_exact_events"] += 1
                else:
                    if native_key is not None:
                        seen_ids[native_key] = event
                    counts[f"{event['role']}_messages"] += 1
                    counts[f"classification:{event['classification']}"] += 1
                    counts["preference_eligible"] += int(event["preference_eligible"])
                    text_bytes += len(event["text"].encode("utf-8", "surrogatepass"))
                if lineage_key is not None:
                    source_events[member["source_key"]][lineage_key].append(event)
                if ancestor_native_key is not None:
                    source_native_events[member["source_key"]][ancestor_native_key].append(event)
                yield event
    disk_guard(destination, config.reserve_bytes)
    gzip_jsonl(destination, episode_rows())
    return {
        "schema_version": SCHEMA_VERSION,
        "transform_version": TRANSFORM_VERSION,
        "family_id": family_id,
        "fingerprint": fingerprint,
        "episode_path": str(relative),
        "collection_status": "processed",
        "source_members": [member["source_key"] for member in members],
        "source_count": len(members),
        "task_count": sum(not is_delegated_source(member) for member in members),
        "first_event_at": min((member["first_event_at"] for member in members if member.get("first_event_at")), default=None),
        "last_event_at": max((member["last_event_at"] for member in members if member.get("last_event_at")), default=None),
        "recent_30d": any(member.get("recent_30d") for member in members),
        "text_bytes": text_bytes,
        "episode_bytes": destination.stat().st_size,
        "compressed_sha256": file_sha256(destination),
        "counts": dict(counts),
    }


def family_fingerprint(members: list[dict[str, Any]]) -> str:
    material = [
        {
            "source_key": member["source_key"],
            "source_prefix_sha256": member.get("source_prefix_sha256"),
            "capture_boundary": member.get("capture_boundary"),
            "selection": member.get("selection"),
            "generated_source": member.get("generated_source"),
            "copied_context_source": member.get("copied_context_source"),
            "lineage_parents": member.get("lineage_parents", []),
            "delegated_context": {
                "kind": member.get("kind"),
                "index_thread_source": member.get("index", {}).get("thread_source"),
                "head_thread_source": member.get("head", {}).get("thread_source"),
                "head_is_sidechain": member.get("head", {}).get("isSidechain"),
            },
        }
        for member in sorted(members, key=lambda item: item["source_key"])
    ]
    return sha256_bytes(json_bytes({"transform_version": TRANSFORM_VERSION, "members": material}))


def estimate_files(rows: list[dict[str, Any]], config: Config, collector_dir: Path) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for row in rows:
        path = Path(row["source_path"])
        raw_size = int(row["capture_boundary"])
        sample_id = sha256_bytes(row["source_key"].encode())[:12]
        snapshot = collector_dir / f".capacity-{sample_id}.jsonl.zst"
        episode = collector_dir / f".capacity-{sample_id}.episode.jsonl.gz"
        sample_row = {**row, "snapshot_path": str(snapshot.relative_to(config.run_dir))}
        disk_guard(snapshot, config.reserve_bytes + 512 * 1024 * 1024)
        try:
            zstd_jsonl(snapshot, snapshot_rows(row, config.watermark))
            gzip_jsonl(episode, read_snapshot_messages(sample_row, config))
            snapshot_bytes = snapshot.stat().st_size
            episode_bytes = episode.stat().st_size
        finally:
            snapshot.unlink(missing_ok=True)
            episode.unlink(missing_ok=True)
        results.append(
            {
                "source_path": str(path),
                "raw_bytes": raw_size,
                "records": row["record_count"],
                "measurement": "sanitized-envelope-zstd-plus-extracted-message-gzip",
                "snapshot_compressed_bytes": snapshot_bytes,
                "episode_compressed_bytes": episode_bytes,
                "measured_compressed_bytes": snapshot_bytes + episode_bytes,
                "compressed_to_raw_ratio": (snapshot_bytes + episode_bytes) / raw_size if raw_size else 0,
            }
        )
    return results


def collect(config: Config) -> dict[str, Any]:
    validate_config(config)
    establish_capture_identity(config)
    observed_at = iso(datetime.now(timezone.utc))
    collector_dir = config.run_dir / "lanes" / "collector"
    collector_dir.mkdir(parents=True, exist_ok=True)
    state_path = collector_dir / STATE_NAME
    previous = read_json(state_path, {})
    sources, codex_threads, codex_edges, missing_codex = discover_sources(config, previous)
    inventory_path = collector_dir / "source-inventory.json"
    inventory = read_json(inventory_path, {})
    if inventory.get("watermark_utc") == iso(config.watermark) and isinstance(inventory.get("source_paths"), list):
        inventory_paths = set(inventory["source_paths"])
        post_census_sources = [row for row in sources if row["source_path"] not in inventory_paths]
        sources = [row for row in sources if row["source_path"] in inventory_paths]
        inventory_observed_at = inventory.get("observed_at")
    else:
        post_census_sources = []
        inventory_observed_at = observed_at
        atomic_json(
            inventory_path,
            {
                "schema_version": SCHEMA_VERSION,
                "watermark_utc": iso(config.watermark),
                "observed_at": observed_at,
                "source_paths": sorted(row["source_path"] for row in sources),
            },
        )
    if config.estimate_only:
        picks: list[dict[str, Any]] = []
        for provider in ("codex", "claude"):
            provider_rows = sorted(
                (row for row in sources if row["provider"] == provider), key=lambda row: row["source_size"]
            )
            if provider_rows:
                picks.extend(provider_rows[-3:])
                picks.append(provider_rows[len(provider_rows) // 2])
        picks = list({row["source_key"]: row for row in picks}.values())
        estimates = estimate_files(picks, config, collector_dir)
        raw_total = sum(row["source_size"] for row in sources)
        ratios = [item["compressed_to_raw_ratio"] for item in estimates if item["raw_bytes"]]
        provider_projection: dict[str, dict[str, int | float]] = {}
        source_provider_by_path = {row["source_path"]: row["provider"] for row in sources}
        for provider in ("codex", "claude"):
            provider_raw = sum(row["source_size"] for row in sources if row["provider"] == provider)
            provider_samples = [
                item for item in estimates if source_provider_by_path.get(item["source_path"]) == provider
            ]
            sampled_raw = sum(item["raw_bytes"] for item in provider_samples)
            sampled_compressed = sum(item["measured_compressed_bytes"] for item in provider_samples)
            weighted_ratio = sampled_compressed / sampled_raw if sampled_raw else 0
            provider_projection[provider] = {
                "raw_bytes": provider_raw,
                "sampled_raw_bytes": sampled_raw,
                "sampled_compressed_bytes": sampled_compressed,
                "weighted_sample_ratio": weighted_ratio,
                "projected_compressed_bytes": int(provider_raw * weighted_ratio),
            }
        result = {
            "schema_version": SCHEMA_VERSION,
            "transform_version": TRANSFORM_VERSION,
            "watermark_utc": iso(config.watermark),
            "metadata_observed_at": observed_at,
            "source_inventory_observed_at": inventory_observed_at,
            "post_census_source_files_ignored": len(post_census_sources),
            "codec": "zstd -3 --long=27 snapshots; gzip -6 episodes",
            "estimate_scope": "sampled actual sanitized envelopes plus extracted per-source message episodes; family dedup can reduce episode bytes",
            "raw_source_bytes": raw_total,
            "source_files": len(sources),
            "provider_files": dict(Counter(row["provider"] for row in sources)),
            "codex_index_missing_files": len(missing_codex),
            "sample": estimates,
            "stratified_weighted_projection": provider_projection,
            "projected_compressed_bytes_weighted": sum(
                int(item["projected_compressed_bytes"]) for item in provider_projection.values()
            ),
            "projected_compressed_bytes_low": int(raw_total * min(ratios)) if ratios else 0,
            "projected_compressed_bytes_high": int(raw_total * max(ratios)) if ratios else 0,
        }
        atomic_json(collector_dir / "compression-estimate.json", result)
        atomic_json(
            state_path,
            {
                "schema_version": SCHEMA_VERSION,
                "watermark_utc": iso(config.watermark),
                "collection_status": "census-only",
                "analysis_status": "not-analyzed",
                "sources": {
                    row["source_path"]: {
                        "transform_version": TRANSFORM_VERSION,
                        "source_size": row["source_size"],
                        "source_mtime_ns": row["source_mtime_ns"],
                        "scan": {key: row[key] for key in (
                            "capture_boundary", "source_prefix_sha256", "record_count", "first_event_at", "last_event_at",
                            "preflight_parse_failures", "trailing_partial", "stopped_at_watermark", "changed_while_scanning", "head"
                        )},
                    }
                    for row in sources
                },
            },
        )
        return result

    by_key = {row["source_key"]: row for row in sources}
    by_path = {row["source_path"]: row["source_key"] for row in sources}
    codex_by_id = {row["native_id"]: row["source_key"] for row in sources if row["provider"] == "codex"}
    direct_by_native = {
        row["native_id"]: row["source_key"] for row in sources if row["provider"] == "claude" and row["kind"] == "root"
    }
    previous_desktop = {
        row["source_key"]: row
        for row in read_jsonl(config.run_dir / "sources.jsonl")
        if row.get("provider") == "claude-desktop" and isinstance(row.get("source_key"), str)
    }
    desktop_rows, desktop_edges, unavailable_desktop = desktop_metadata(config, direct_by_native, previous_desktop)
    import_edges = explicit_import_edges(config.codex_home, by_path, codex_by_id)
    dialogue_edges = shared_native_dialogue_edges(sources, config.watermark)
    family_for, families, resolved_edges = connect_families(
        sources, codex_edges, desktop_edges, import_edges, dialogue_edges
    )
    copied_context_keys = {child for _, child in resolved_edges}
    lineage_parents: dict[str, set[str]] = defaultdict(set)
    for parent, child in resolved_edges:
        lineage_parents[child].add(parent)
    for row in sources:
        row["copied_context_source"] = row["source_key"] in copied_context_keys
        row["lineage_parents"] = sorted(lineage_parents[row["source_key"]])
    selected_families: set[str] = set()
    for row in sources:
        last = row.get("last_event_at")
        last_at = parse_utc(last) if isinstance(last, str) else None
        in_window = bool(last_at and config.cutoff <= last_at <= config.watermark)
        row["in_window"] = in_window
        row["recent_30d"] = bool(last_at and config.recent_cutoff <= last_at <= config.watermark)
        row["family_id"] = family_for[row["source_key"]]
        if in_window:
            selected_families.add(row["family_id"])
    selected = [row for row in sources if row["family_id"] in selected_families]
    for row in sources:
        row["selection"] = (
            "in-window"
            if row["in_window"]
            else ("family-context" if row["family_id"] in selected_families else "out-of-window")
        )

    previous_sources = previous.get("sources", {})
    state_rows: dict[str, Any] = {
        row["source_path"]: {
            "transform_version": TRANSFORM_VERSION,
            "source_size": row["source_size"],
            "source_mtime_ns": row["source_mtime_ns"],
            "scan": {key: row[key] for key in (
                "capture_boundary", "source_prefix_sha256", "record_count", "first_event_at", "last_event_at",
                "preflight_parse_failures", "trailing_partial", "stopped_at_watermark", "changed_while_scanning", "head"
            )},
            "snapshot_path": previous_sources.get(row["source_path"], {}).get("snapshot_path"),
            "snapshot_counts": previous_sources.get(row["source_path"], {}).get("snapshot_counts", {}),
        }
        for row in sources
    }
    delta: Counter[str] = Counter()
    progress_path = collector_dir / "progress.json"
    selected_by_family: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in selected:
        selected_by_family[row["family_id"]].append(row)
    prior_families = {item["family_id"]: item for item in previous.get("families", []) if "family_id" in item}
    family_rows: list[dict[str, Any]] = []
    ready_path = collector_dir / "ready-families.jsonl"
    ready_path.write_bytes(b"")
    completed_sources = 0
    stop_for_disk = False
    ordered_families = sorted(
        selected_by_family.items(),
        key=lambda item: (sum(member["capture_boundary"] for member in item[1]), item[0]),
    )
    with ready_path.open("ab") as ready:
        for family_id, members in ordered_families:
            family_complete = len(members) == len(families[family_id])
            for row in members:
                prior = previous_sources.get(row["source_path"])
                try:
                    snapshot_path, snapshot_counts, reused = write_snapshot(row, config, prior)
                    row["snapshot_path"] = snapshot_path
                    row["snapshot_counts"] = snapshot_counts
                    row["status"] = "reused" if reused else "processed"
                    delta[row["status"]] += 1
                except (OSError, LowDiskError) as error:
                    row["status"] = "blocked-low-disk" if isinstance(error, LowDiskError) else "read-error"
                    row["error"] = {"type": type(error).__name__, "message": str(error)}
                    delta[row["status"]] += 1
                    family_complete = False
                    stop_for_disk = isinstance(error, LowDiskError)
                state_rows[row["source_path"]]["snapshot_path"] = row.get("snapshot_path")
                state_rows[row["source_path"]]["snapshot_counts"] = row.get("snapshot_counts", {})
                completed_sources += 1
                if completed_sources % 10 == 0 or stop_for_disk:
                    atomic_json(
                        progress_path,
                        {
                            "status": "collecting",
                            "completed_sources": completed_sources,
                            "selected_sources": len(selected),
                            "closed_families": len(family_rows),
                            "selected_families": len(selected_families),
                            "delta": dict(delta),
                        },
                    )
                    atomic_json(
                        state_path,
                        {
                            "schema_version": SCHEMA_VERSION,
                            "transform_version": TRANSFORM_VERSION,
                            "watermark_utc": iso(config.watermark),
                            "collection_status": "in-progress",
                            "analysis_status": "not-analyzed",
                            "sources": state_rows,
                            "families": family_rows,
                        },
                    )
                if stop_for_disk:
                    break
            if family_complete:
                fingerprint = family_fingerprint(members)
                family_row = write_family_episode(family_id, members, config, fingerprint, prior_families.get(family_id))
                family_rows.append(family_row)
                ready.write(json_bytes(family_row) + b"\n")
                ready.flush()
                os.fsync(ready.fileno())
                atomic_jsonl(config.run_dir / "families.jsonl", family_rows)
            if stop_for_disk:
                break

    complete_selected = [row for row in selected if row.get("status") in {"processed", "reused"}]

    missing_rows = [
        {
            "schema_version": SCHEMA_VERSION,
            "source_key": f"codex-missing:{item['id']}",
            "provider": "codex",
            "kind": "missing-indexed-rollout",
            "source_path": item["rollout_path"],
            "native_id": item["id"],
            "status": "missing",
        }
        for item in missing_codex
    ]
    manifest_rows = sorted(sources + desktop_rows + missing_rows, key=lambda row: row["source_key"])
    atomic_jsonl(config.run_dir / "sources.jsonl", manifest_rows)
    atomic_jsonl(config.run_dir / "families.jsonl", family_rows)
    previous_paths = set(previous_sources)
    current_paths = {row["source_path"] for row in sources}
    delta["removed"] = len(previous_paths - current_paths)
    delta_payload = {
        "schema_version": SCHEMA_VERSION,
        "watermark_utc": iso(config.watermark),
        "cutoff_utc": iso(config.cutoff),
        "recent_cutoff_utc": iso(config.recent_cutoff),
        "counts": dict(delta),
        "removed_source_paths": sorted(previous_paths - current_paths),
    }
    atomic_json(collector_dir / "delta.json", delta_payload)
    statuses = Counter(row.get("status", "unselected") for row in sources)
    quality_gaps = {
        "parse_failure_records": sum(row.get("snapshot_counts", {}).get("parse_failures", 0) for row in complete_selected),
        "trailing_partial_files": sum(row.get("trailing_partial", False) for row in sources),
        "changed_while_scanning_files": sum(row.get("changed_while_scanning", False) for row in sources),
        "missing_indexed_codex_files": len(missing_codex),
        "claude_desktop_unavailable_or_unmatched": len(unavailable_desktop),
    }
    archived_available = len(complete_selected) == len(selected)
    summary = {
        "schema_version": SCHEMA_VERSION,
        "transform_version": TRANSFORM_VERSION,
        "collection_status": "archived-available-sources" if archived_available else "incomplete",
        "coverage_status": "bounded-with-explicit-gaps" if any(quality_gaps.values()) else "complete-as-of-event-watermark",
        "analysis_status": "not-analyzed",
        "metadata_observed_at": observed_at,
        "source_inventory_observed_at": inventory_observed_at,
        "post_census_source_files_ignored": len(post_census_sources),
        "watermark_utc": iso(config.watermark),
        "cutoff_utc": iso(config.cutoff),
        "recent_cutoff_utc": iso(config.recent_cutoff),
        "source_files": len(sources),
        "selected_source_files": len(selected),
        "snapshotted_source_files": len(complete_selected),
        "direct_tasks": sum(not is_delegated_source(row) for row in selected),
        "independent_families": len(selected_families),
        "closed_families": len(family_rows),
        "recent_30d_files": sum(row["recent_30d"] for row in sources),
        "registered_generated_sources": sum(bool(row.get("generated_source")) for row in sources),
        "generated_source_manifest": str(config.generated_source_manifest) if config.generated_source_manifest else None,
        "provider_files": dict(Counter(row["provider"] for row in sources)),
        "selected_provider_files": dict(Counter(row["provider"] for row in selected)),
        "statuses": dict(statuses),
        "lineage_edges": len(resolved_edges),
        "codex_index_threads": len(codex_threads),
        "codex_index_missing_files": len(missing_codex),
        "codex_cloud_catalog": codex_cloud_catalog(config.codex_home),
        "claude_desktop_metadata": len(desktop_rows),
        "claude_desktop_unavailable_or_unmatched": len(unavailable_desktop),
        "quality_gaps": quality_gaps,
        "delta": dict(delta),
    }
    atomic_json(config.run_dir / "corpus-summary.json", summary)
    final_state = {
        "schema_version": SCHEMA_VERSION,
        "watermark_utc": iso(config.watermark),
        "collection_status": summary["collection_status"],
        "analysis_status": "not-analyzed",
        "sources": state_rows,
        "families": family_rows,
    }
    atomic_json(state_path, final_state)
    atomic_json(progress_path, {"status": summary["collection_status"], **summary})
    return summary


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--run-dir", required=True, type=Path)
    result.add_argument("--cutoff-utc", required=True, type=parse_utc)
    result.add_argument("--recent-cutoff-utc", required=True, type=parse_utc)
    result.add_argument("--watermark-utc", required=True, type=parse_utc)
    result.add_argument("--codex-home", type=Path, default=Path.home() / ".codex")
    result.add_argument("--claude-home", type=Path, default=Path.home() / ".claude")
    result.add_argument("--claude-app-support", type=Path, default=Path.home() / "Library" / "Application Support" / "Claude")
    result.add_argument("--generated-source-manifest", type=Path)
    result.add_argument("--reserve-bytes", type=int, default=DEFAULT_RESERVE_BYTES)
    result.add_argument("--estimate-only", action="store_true")
    return result


def main() -> int:
    arguments = parser().parse_args()
    if not arguments.cutoff_utc < arguments.recent_cutoff_utc < arguments.watermark_utc:
        raise SystemExit("expected cutoff-utc < recent-cutoff-utc < watermark-utc")
    config = Config(
        run_dir=arguments.run_dir.resolve(),
        cutoff=arguments.cutoff_utc,
        recent_cutoff=arguments.recent_cutoff_utc,
        watermark=arguments.watermark_utc,
        codex_home=arguments.codex_home.resolve(),
        claude_home=arguments.claude_home.resolve(),
        claude_app_support=arguments.claude_app_support.resolve(),
        generated_source_manifest=arguments.generated_source_manifest.resolve() if arguments.generated_source_manifest else None,
        reserve_bytes=arguments.reserve_bytes,
        estimate_only=arguments.estimate_only,
    )
    result = collect(config)
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
