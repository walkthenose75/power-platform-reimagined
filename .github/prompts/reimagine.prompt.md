---
mode: agent
description: Start or resume the guided reimagination of a Power Platform solution.
---

Follow [the reimagination skill](../../skills/reimagine-power-platform/SKILL.md).

If no assessment workspace is active:

1. Look for exactly one ZIP in `inbox/`.
2. If found, ask only for the pilot name, then run the documented `start --inbox` command.
3. Otherwise, accept a solution ZIP path or GitHub repository URL and a pilot name.

If an assessment workspace exists, read its `KICKOFF.md` and `solution-model.json`, validate it, identify the current gate, and resume from that stage.

Use workload specialists, preserve evidence and confidence, and stop at required gates. Never build a target canvas app.
