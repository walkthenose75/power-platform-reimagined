# Power Platform Reimagined repository instructions

When the user asks to reimagine, assess, document, modernize, migrate, or package a Power Platform solution:

1. Read `skills/reimagine-power-platform/SKILL.md` and follow it as the controlling workflow.
2. Use `solution-model.json` in the active assessment workspace as the source of truth.
3. Route bounded workload tasks to the closest available specialist agent or skill.
4. Treat source canvas apps as read-only evidence and build custom target experiences as code apps.
5. Never persist source business rows, credentials, tenant-specific identifiers, or customer configuration in publishable assets.
6. Require the workflow's gates before environment mutation, deployment, or publication.

If the user provides a solution ZIP or repository but has not initialized a workspace, use the `start` command documented in the root README.
