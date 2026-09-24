---
name: core
description: Shared internal protocols for Power Platform Reimagined skills.
disable-model-invocation: true
---

# Core Protocols

## 1. Evidence

Every material claim must link to evidence and use one confidence state: observed, inferred, owner-confirmed, or unknown. Never convert missing access into an inferred success.

## 2. Privacy

Do not persist credentials, source business rows, tenant identifiers, environment URLs, user identities, or customer configuration in publishable assets. Only schema and approved non-identifying aggregates may inform synthetic-data design.

## 3. Mutation gates

Local read-only processing may proceed automatically. Require explicit authorization before modifying environments, deploying, publishing, or expanding access.

## 4. Error handling

Surface tool and validation failures directly. Record unsupported or inaccessible dependencies as unknowns with a blocking flag.

## 5. Post-Run Reflection

After a multi-step run:

1. Compare generated outputs to the stage contract and approved decisions.
2. Record missing evidence, unsupported workloads, repeated manual steps, and specialist-routing failures.
3. Propose reusable improvements to the skill, schemas, adapters, tests, or documentation.
4. Do not silently modify project scope or approval decisions during reflection.

## 6. Specialist output

Treat specialist output as unverified until it passes canonical-schema, sanitization, integration, and acceptance checks.

## 7. Fictitious data policy

Use only newly generated fictitious organizations and people in examples and datasets. Do not transform or paraphrase source records.
