<!--
Title: `<task id>: <summary>` for a plan task (e.g. `A-02: keep menu sections when saving a menu`), in English.
Commits follow Conventional Commits (`fix:`, `feat:`, `chore(deps):`, `docs:`...).
Label the PR for the release notes: breaking, feature, fix, dependencies, ci or docs (see .github/release.yml).
-->

Task: <!-- e.g. A-02, docs/plan/tasks/A-02-menu-sections-save.md; "none" outside the plan -->

## Summary

<!-- What changes and why. Link the review findings or issues it addresses. -->

## Required actions

<!-- Only if users must act on upgrade (new variable, port, manual migration) or the change is breaking:
before / after upgrade, `breaking: true`, recommended pinning, and a matching "Notes de version" line in the task's Journal
(docs/plan/README.md, rule 9). Delete this section otherwise. -->

## Checklist

- [ ] Tests added or updated for the new or changed behavior
- [ ] `npm test` passes in every changed package (`backend/`, `frontend/`)
- [ ] `npm run lint` passes in every changed package that has a lint script
- [ ] `npx tsc --noEmit` passes in every changed package
- [ ] Coverage: global >= 60% on every metric, changed lines >= 80% (delta)
- [ ] Task file: acceptance criteria checked, `status: done`, `branch` and `pr` filled in, Journal line added
- [ ] Out-of-scope findings recorded as new tasks in `docs/plan/tasks/`, not fixed here
