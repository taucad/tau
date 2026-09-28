#!/usr/bin/env python3
"""Verify one bounded GeoSpec DSSE/in-toto record against an external policy."""

import base64
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile


class Rejection(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def require(condition, code):
    if not condition:
        raise Rejection(code)


def pairs(items):
    result = {}
    for key, value in items:
        require(key not in result, "MALFORMED_JSON")
        result[key] = value
    return result


def parse(data):
    return json.loads(
        data.decode("utf-8", errors="strict"),
        object_pairs_hook=pairs,
        parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)),
    )


def exact_keys(value, keys, code="MALFORMED_RECORD"):
    require(isinstance(value, dict) and set(value) == set(keys), code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def decode64(value):
    require(isinstance(value, str), "MALFORMED_ENVELOPE")
    try:
        encoded = value.encode("ascii")
        decoded = base64.b64decode(encoded, validate=True)
        require(base64.b64encode(decoded) == encoded, "MALFORMED_ENVELOPE")
        return decoded
    except (ValueError, UnicodeError):
        raise Rejection("MALFORMED_ENVELOPE") from None


def read_artifact(closure, entry, limit):
    exact_keys(entry, ["byteLength", "name", "sha256"])
    name = entry["name"]
    require(isinstance(name, str), "ARTIFACT_SET")
    relative = pathlib.PurePosixPath(name)
    require(not relative.is_absolute() and ".." not in relative.parts, "ARTIFACT_SET")
    target = closure.joinpath(*relative.parts)
    require(target.is_file() and not target.is_symlink(), "ARTIFACT_MISSING")
    resolved = target.resolve(strict=True)
    require(closure.resolve(strict=True) in resolved.parents, "ARTIFACT_SET")
    require(target.stat().st_size <= limit, "RESOURCE_LIMIT")
    data = target.read_bytes()
    require(len(data) == entry["byteLength"] and digest(data) == entry["sha256"], "ARTIFACT_DIGEST")
    return data


def main():
    envelope_path, policy_path, closure_path, openssl = sys.argv[1:]
    closure = pathlib.Path(closure_path)
    policy = parse(pathlib.Path(policy_path).read_bytes())
    exact_keys(
        policy,
        [
            "approvedPlanSha256",
            "cacheMode",
            "canonicalProfile",
            "engineManifestSha256",
            "evaluatorId",
            "evaluatorMode",
            "expectedClaimIds",
            "expectedJobChallenge",
            "expectedSubjects",
            "isolationClass",
            "maxArtifactBytes",
            "maxEnvelopeBytes",
            "numericProfile",
            "payloadType",
            "predicateType",
            "protocolVersion",
            "publicKeyPem",
            "registryVersion",
            "requirementRevision",
            "requireFreshChallenge",
            "runnerManifestSha256",
            "schema",
            "trustedKeyId",
        ],
        "MALFORMED_POLICY",
    )
    require(policy["schema"] == "geospec-trusted-verifier-policy-v3", "MALFORMED_POLICY")
    require(
        policy["predicateType"] == "https://taucad.dev/attestation/geospec-trusted-evaluation/v3",
        "MALFORMED_POLICY",
    )
    require(policy["evaluatorMode"] == "signed-local-record" and policy["isolationClass"] == "none", "EVALUATOR_BINDING")
    require(policy["maxArtifactBytes"] == 67108864, "MALFORMED_POLICY")
    require(policy["maxEnvelopeBytes"] == 4194304, "MALFORMED_POLICY")
    envelope_file = pathlib.Path(envelope_path)
    require(envelope_file.stat().st_size <= policy["maxEnvelopeBytes"], "RESOURCE_LIMIT")
    envelope = parse(envelope_file.read_bytes())
    exact_keys(envelope, ["payload", "payloadType", "signatures"], "MALFORMED_ENVELOPE")
    require(envelope["payloadType"] == policy["payloadType"], "PAYLOAD_TYPE")
    require(isinstance(envelope["signatures"], list) and len(envelope["signatures"]) == 1, "MALFORMED_ENVELOPE")
    signature_record = envelope["signatures"][0]
    exact_keys(signature_record, ["keyid", "sig"], "MALFORMED_ENVELOPE")
    require(signature_record["keyid"] == policy["trustedKeyId"], "TRUST_POLICY_KEY")
    payload = decode64(envelope["payload"])
    signature = decode64(signature_record["sig"])
    payload_type = envelope["payloadType"].encode("utf-8")
    pae = (
        b"DSSEv1 "
        + str(len(payload_type)).encode("ascii")
        + b" "
        + payload_type
        + b" "
        + str(len(payload)).encode("ascii")
        + b" "
        + payload
    )
    with tempfile.TemporaryDirectory(prefix="geospec-verification-") as temporary:
        directory = pathlib.Path(temporary)
        public_key = directory / "public.pem"
        pae_file = directory / "pae.bin"
        signature_file = directory / "signature.bin"
        public_key.write_text(policy["publicKeyPem"])
        pae_file.write_bytes(pae)
        signature_file.write_bytes(signature)
        public_der = subprocess.run(
            [openssl, "pkey", "-pubin", "-in", str(public_key), "-outform", "DER"],
            capture_output=True,
            timeout=5,
            check=False,
        )
        require(public_der.returncode == 0 and digest(public_der.stdout) == policy["trustedKeyId"], "TRUST_POLICY_KEY")
        verified = subprocess.run(
            [
                openssl,
                "pkeyutl",
                "-verify",
                "-pubin",
                "-inkey",
                str(public_key),
                "-rawin",
                "-in",
                str(pae_file),
                "-sigfile",
                str(signature_file),
            ],
            capture_output=True,
            timeout=5,
            check=False,
        )
        require(verified.returncode == 0, "SIGNATURE_INVALID")

    statement = parse(payload)
    exact_keys(statement, ["_type", "predicate", "predicateType", "subject"])
    require(statement["_type"] == "https://in-toto.io/Statement/v1", "PAYLOAD_TYPE")
    require(statement["predicateType"] == policy["predicateType"], "PAYLOAD_TYPE")
    predicate = statement["predicate"]
    exact_keys(
        predicate,
        [
            "artifacts",
            "assurance",
            "cache",
            "claims",
            "complete",
            "engine",
            "evaluator",
            "profiles",
            "requirements",
            "run",
            "runner",
            "schema",
            "subjects",
        ],
    )
    require(predicate["schema"] == "geospec-trusted-evaluation-predicate-v3", "MALFORMED_RECORD")
    require(predicate["complete"] is True, "INCOMPLETE_RUN")
    require(predicate["cache"] == {"mode": policy["cacheMode"], "persistent": False}, "CACHE_BINDING")
    require(
        predicate["evaluator"]
        == {"id": policy["evaluatorId"], "isolationClass": "none", "mode": "signed-local-record"},
        "EVALUATOR_BINDING",
    )
    require(
        predicate["assurance"]
        == {
            "geometryTruth": "trusted-evaluator-assertion",
            "heldSecurityEvaluation": "open-s10",
            "scope": "authenticated-complete-record-not-independent-geometry-proof",
        },
        "ASSURANCE_BINDING",
    )
    require(
        predicate["profiles"]
        == {
            "canonical": policy["canonicalProfile"],
            "numeric": policy["numericProfile"],
            "protocolVersion": policy["protocolVersion"],
            "registryVersion": policy["registryVersion"],
        },
        "PROFILE_BINDING",
    )
    requirements = predicate["requirements"]
    require(requirements["approvedPlanSha256"] == policy["approvedPlanSha256"], "REQUIREMENT_BINDING")
    require(requirements["requirementRevision"] == policy["requirementRevision"], "REQUIREMENT_BINDING")
    require(predicate["engine"]["manifestSha256"] == policy["engineManifestSha256"], "ENGINE_BINDING")
    require(predicate["runner"]["manifestSha256"] == policy["runnerManifestSha256"], "RUNNER_BINDING")
    require(
        not policy["requireFreshChallenge"]
        or (
            predicate["run"]["freshChallengeRequired"] is True
            and predicate["run"]["jobChallenge"] == policy["expectedJobChallenge"]
        ),
        "FRESHNESS_BINDING",
    )

    artifacts = {}
    for entry in predicate["artifacts"]:
        require(entry["name"] not in artifacts, "ARTIFACT_SET")
        artifacts[entry["name"]] = read_artifact(closure, entry, policy["maxArtifactBytes"])
    require(digest(artifacts["plan.json"]) == policy["approvedPlanSha256"], "REQUIREMENT_BINDING")
    require(digest(artifacts["engine.json"]) == policy["engineManifestSha256"], "ENGINE_BINDING")
    require(digest(artifacts["runner.json"]) == policy["runnerManifestSha256"], "RUNNER_BINDING")

    expected_subjects = policy["expectedSubjects"]
    require(
        statement["subject"]
        == [{"digest": {"sha256": row["sha256"]}, "name": row["name"]} for row in expected_subjects],
        "SUBJECT_BINDING",
    )
    for row in expected_subjects:
        require(digest(artifacts[row["name"]]) == row["sha256"], "SUBJECT_BINDING")

    plan = parse(artifacts["plan.json"])
    canonical_plan = parse(artifacts["canonical-plan.json"])
    canonical_result = parse(artifacts["canonical-result.json"])
    raw = parse(artifacts["raw-evaluation.json"])
    engine = parse(artifacts["engine.json"])
    runner = parse(artifacts["runner.json"])
    require(plan["schema"] == "geospec-approved-evaluation-plan-v2", "REQUIREMENT_BINDING")
    require(
        plan["authority"]
        == {
            "canonicalProfile": policy["canonicalProfile"],
            "protocolVersion": policy["protocolVersion"],
            "registryVersion": policy["registryVersion"],
            "requirementRevision": policy["requirementRevision"],
        },
        "REQUIREMENT_BINDING",
    )
    expected_subject_artifacts = []
    for subject in plan["subjects"]:
        ingest = subject["ingestRequest"]
        require(ingest["canonicalProfile"] == policy["canonicalProfile"], "SUBJECT_BINDING")
        require(ingest["protocolVersion"] == policy["protocolVersion"], "SUBJECT_BINDING")
        require(ingest["registryVersion"] == policy["registryVersion"], "SUBJECT_BINDING")
        require(ingest["method"] == "ingestSubject", "SUBJECT_BINDING")
        require(ingest["format"] == subject["format"], "SUBJECT_BINDING")
        require(ingest["frame"] == subject["frame"], "SUBJECT_BINDING")
        require(ingest["primaryByteLength"] == subject["primary"]["byteLength"], "SUBJECT_BINDING")
        require(
            ingest["resources"]
            == [{"byteLength": item["byteLength"], "name": item["name"]} for item in subject["resources"]],
            "SUBJECT_BINDING",
        )
        expected_subject_artifacts.append(
            {
                "name": f"subjects/{subject['slot']}/primary.{subject['format']}",
                "sha256": subject["primary"]["sha256"],
            }
        )
        primary_name = f"subjects/{subject['slot']}/primary.{subject['format']}"
        require(len(artifacts[primary_name]) == subject["primary"]["byteLength"], "SUBJECT_BINDING")
        require(digest(artifacts[primary_name]) == subject["primary"]["sha256"], "SUBJECT_BINDING")
        expected_subject_artifacts.extend(
            {
                "name": f"subjects/{subject['slot']}/resources/{item['name']}",
                "sha256": item["sha256"],
            }
            for item in subject["resources"]
        )
        for item in subject["resources"]:
            resource_name = f"subjects/{subject['slot']}/resources/{item['name']}"
            require(len(artifacts[resource_name]) == item["byteLength"], "SUBJECT_BINDING")
            require(digest(artifacts[resource_name]) == item["sha256"], "SUBJECT_BINDING")
    expected_subject_artifacts.sort(key=lambda item: item["name"])
    require(expected_subjects == expected_subject_artifacts, "SUBJECT_BINDING")
    expected_predicate_subjects = [
        {
            "expectedIdentity": subject["expectedIdentity"],
            "format": subject["format"],
            "frame": subject["frame"],
            "identityField": subject["identityField"],
            "primarySha256": subject["primary"]["sha256"],
            "resourceSha256": [item["sha256"] for item in subject["resources"]],
            "slot": subject["slot"],
        }
        for subject in plan["subjects"]
    ]
    require(predicate["subjects"] == expected_predicate_subjects, "SUBJECT_BINDING")
    require(raw["schema"] == "geospec-trusted-native-evaluation-v2" and raw["complete"] is True, "INCOMPLETE_RUN")
    require(raw["cache"] == {"mode": policy["cacheMode"], "persistent": False}, "CACHE_BINDING")
    initialization = raw["initialization"]
    exact_keys(
        initialization,
        ["base64", "canonicalProfile", "numericProfile", "protocolVersion", "registryVersion", "sha256"],
    )
    require(initialization["canonicalProfile"] == policy["canonicalProfile"], "PROFILE_BINDING")
    require(initialization["numericProfile"] == policy["numericProfile"], "PROFILE_BINDING")
    require(initialization["protocolVersion"] == policy["protocolVersion"], "PROFILE_BINDING")
    require(initialization["registryVersion"] == policy["registryVersion"], "PROFILE_BINDING")
    initialization_bytes = decode64(initialization["base64"])
    require(digest(initialization_bytes) == initialization["sha256"], "PROFILE_BINDING")
    initialization_response = parse(initialization_bytes)
    require(initialization_response["requestId"] == "trusted-evaluator-initialize", "PROFILE_BINDING")
    require(initialization_response["result"]["canonicalProfile"] == policy["canonicalProfile"], "PROFILE_BINDING")
    require(initialization_response["result"]["numericProfile"] == policy["numericProfile"], "PROFILE_BINDING")
    require(initialization_response["result"]["protocolVersion"] == policy["protocolVersion"], "PROFILE_BINDING")
    require(initialization_response["result"]["registryVersion"] == policy["registryVersion"], "PROFILE_BINDING")
    require(raw["canonicalPlan"]["sha256"] == digest(artifacts["canonical-plan.json"]), "RESULT_BINDING")
    require(raw["canonicalResult"]["sha256"] == digest(artifacts["canonical-result.json"]), "RESULT_BINDING")
    require(decode64(raw["canonicalPlan"]["base64"]) == artifacts["canonical-plan.json"], "RESULT_BINDING")
    require(decode64(raw["canonicalResult"]["base64"]) == artifacts["canonical-result.json"], "RESULT_BINDING")
    require(canonical_plan["numericProfile"] == policy["numericProfile"], "PROFILE_BINDING")
    require(canonical_result["numericProfile"] == policy["numericProfile"], "PROFILE_BINDING")
    require(canonical_plan["canonicalProfile"] == policy["canonicalProfile"], "PROFILE_BINDING")
    require(canonical_plan["protocolVersion"] == policy["protocolVersion"], "PROFILE_BINDING")
    require(canonical_plan["registryVersion"] == policy["registryVersion"], "PROFILE_BINDING")
    require(
        canonical_plan["plan"]["subjects"]
        == [
            {"slot": subject["slot"], subject["identityField"]: subject["expectedIdentity"]}
            for subject in plan["subjects"]
        ],
        "SUBJECT_BINDING",
    )

    expected_ids = policy["expectedClaimIds"]
    claims = canonical_plan["plan"]["claims"]
    results = canonical_result["results"]
    require([claim["claimId"] for claim in claims] == expected_ids, "CLAIM_SET")
    require([result["claimId"] for result in results] == expected_ids, "INCOMPLETE_RESULTS")
    require(len(set(expected_ids)) == len(expected_ids) == len(raw["rows"]), "CLAIM_SET")
    require(predicate["claims"]["count"] == len(expected_ids), "CLAIM_SET")
    require(predicate["claims"]["expectedClaimIds"] == expected_ids, "CLAIM_SET")
    require([entry["claim"] for entry in plan["claims"]] == claims, "CLAIM_BINDING")
    inventory = []
    for ordinal, (approved, claim, result, row) in enumerate(zip(plan["claims"], claims, results, raw["rows"], strict=True)):
        claim_bytes = decode64(row["canonicalClaim"])
        result_bytes = decode64(row["canonicalResult"])
        require(parse(claim_bytes) == claim and digest(claim_bytes) == row["canonicalClaimSha256"], "CLAIM_BINDING")
        require(row["canonicalClaimSha256"] == approved["canonicalClaimSha256"], "CLAIM_BINDING")
        require(parse(result_bytes) == result and digest(result_bytes) == row["canonicalResultSha256"], "RESULT_BINDING")
        require(row["ordinal"] == ordinal and row["claimId"] == approved["claim"]["claimId"], "CLAIM_BINDING")
        require(row["polarity"] == claim["polarity"], "POLARITY_BINDING")
        require(row["status"] == result["status"] and result["status"] in ["passed", "failed", "refused"], "RESULT_BINDING")
        inventory.append(
            {
                "canonicalClaimSha256": row["canonicalClaimSha256"],
                "canonicalResultSha256": row["canonicalResultSha256"],
                "claimId": row["claimId"],
                "ordinal": ordinal,
                "polarity": row["polarity"],
                "status": row["status"],
            }
        )
    require(predicate["claims"]["inventory"] == inventory, "RESULT_BINDING")

    require(len(raw["subjects"]) == len(plan["subjects"]), "SUBJECT_BINDING")
    for approved, observed in zip(plan["subjects"], raw["subjects"], strict=True):
        exact_keys(observed, ["actualIdentity", "admission", "identityField", "ingestRequest", "slot"])
        require(observed["slot"] == approved["slot"], "SUBJECT_BINDING")
        require(observed["identityField"] == approved["identityField"], "SUBJECT_BINDING")
        require(observed["actualIdentity"] == approved["expectedIdentity"], "SUBJECT_BINDING")
        exact_keys(observed["ingestRequest"], ["base64", "sha256"])
        ingest_bytes = decode64(observed["ingestRequest"]["base64"])
        require(digest(ingest_bytes) == observed["ingestRequest"]["sha256"], "SUBJECT_BINDING")
        require(observed["ingestRequest"]["sha256"] == approved["ingestRequestSha256"], "SUBJECT_BINDING")
        require(parse(ingest_bytes) == approved["ingestRequest"], "SUBJECT_BINDING")
        exact_keys(observed["admission"], ["base64", "sha256"])
        admission_bytes = decode64(observed["admission"]["base64"])
        require(digest(admission_bytes) == observed["admission"]["sha256"], "SUBJECT_BINDING")
        admission = parse(admission_bytes)
        require(admission["requestId"] == approved["ingestRequest"]["requestId"], "SUBJECT_BINDING")
        admitted = admission["result"]["subject"]
        require(admitted[approved["identityField"]] == approved["expectedIdentity"], "SUBJECT_BINDING")
        require(admitted["format"] == approved["format"], "SUBJECT_BINDING")
        descriptor = admitted["descriptor"]
        require(descriptor["format"] == approved["format"], "SUBJECT_BINDING")
        require(
            descriptor["primary"]
            == {"byteLength": approved["primary"]["byteLength"], "sha256": approved["primary"]["sha256"]},
            "SUBJECT_BINDING",
        )
        require(
            descriptor["resources"]
            == [
                {"byteLength": item["byteLength"], "name": item["name"], "sha256": item["sha256"]}
                for item in approved["resources"]
            ],
            "SUBJECT_BINDING",
        )

    require(engine["schema"] == "geospec-engine-artifact-manifest-v2", "ENGINE_BINDING")
    require(engine["platformPackage"] == "@taucad/geospec-engine-native-darwin-arm64", "ENGINE_BINDING")
    retained = engine["retainedArtifacts"]
    for entry in retained:
        require(entry["name"] in artifacts, "ENGINE_BINDING")
        require(
            len(artifacts[entry["name"]]) == entry["byteLength"]
            and digest(artifacts[entry["name"]]) == entry["sha256"],
            "ENGINE_BINDING",
        )
    require(runner["schema"] == "geospec-evaluator-runner-manifest-v1", "RUNNER_BINDING")
    for entry in runner["retainedArtifacts"]:
        require(entry["name"] in artifacts, "RUNNER_BINDING")
        require(
            len(artifacts[entry["name"]]) == entry["byteLength"]
            and digest(artifacts[entry["name"]]) == entry["sha256"],
            "RUNNER_BINDING",
        )
    required_artifacts = {
        "plan.json",
        "engine.json",
        "runner.json",
        "canonical-plan.json",
        "canonical-result.json",
        "raw-evaluation.json",
        *[row["name"] for row in expected_subjects],
        *[entry["name"] for entry in retained],
        *[entry["name"] for entry in runner["retainedArtifacts"]],
    }
    require(set(artifacts) == required_artifacts, "ARTIFACT_SET")
    return {
        "code": "VERIFIED",
        "freshChallengeRequired": policy["requireFreshChallenge"],
        "scope": "Authenticated complete record under independently supplied test policy; not independent geometry proof or hostile-host certification",
        "statuses": [row["status"] for row in inventory],
        "trustedKeyId": policy["trustedKeyId"],
    }


try:
    print(json.dumps(main(), separators=(",", ":")))
except Rejection as error:
    print(json.dumps({"code": error.code}, separators=(",", ":")))
    sys.exit(2)
except Exception as error:
    print(json.dumps({"code": "MALFORMED_RECORD", "errorType": type(error).__name__}, separators=(",", ":")))
    sys.exit(2)
