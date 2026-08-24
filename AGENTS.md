# Todo Print Editor Working Agreements

## Project identity and policy

- Project name: `todo-print-editor`
- Public name: `Todo Print Editor`
- Benefit-first description: Design and print structured todo lists as exact-size A4 layouts from a visual or Markdown editor.
- Repository: `martonpaulo/todo-print-editor` (public)
- Public identifiers: private npm package `todo-print-editor`; GitHub Pages path `/todo-print-editor/`.
- Landing page: the application at `https://martonpaulo.github.io/todo-print-editor/` is the only public page; there is no separate marketing site.
- License: `MIT`
- Copyright: 2026 martonpaulo
- Development language: English.
- Product copy: English (`en-US`) only, with `en-US` as the fallback. Keep visible strings centralized; do not add a localization framework until another locale is requested.
- Branch policy: work directly on `main`. An explicitly approved exceptional branch follows the global agent branch convention.
- Commit policy: commit only when the owner explicitly requests it. Use Conventional Commits in English.
- Push policy: push only when the owner explicitly requests it and local validation has passed.
- Product versioning: no user-visible versions, automatic increments, tags, releases, or changelog. The private package version remains the internal `0.0.0` unless an explicit migration changes this policy.
- Merge policy: merge commits only, every commit of the branch preserved. Never squash.
- Commit subject: a commit made for an issue ends with `(#<issue number>)`.
- Delete branches after merge: enabled.
- Release, signing, and secret-storage policy: validated pushes to `main` deploy the static build to GitHub Pages through GitHub Actions. Use only the repository-scoped `GITHUB_TOKEN`; there are no release artifacts, signing identities, or project secrets.

Treat these values as stable project decisions. Change an established identifier, license, visibility, branch policy, versioning model, localization strategy, landing-page contract, or release policy only through an explicit task that describes the migration and downstream effects.

## Product contract

- The application has exactly one route and must opt out of search indexing.
- User documents stay in browser `localStorage`; do not add accounts, analytics, remote storage, or a backend.
- A printed page is A4 landscape (`297mm × 210mm`) containing three sequential `99mm × 210mm` panels.
- A list is atomic during pagination. Move the whole list to the next panel when it does not fit; never split it. Block printing when one list cannot fit an otherwise empty panel.
- Render the optional date only on the first panel. Render optional panel numbering on every panel.
- Keep print output monochrome and preserve physical dimensions. Screen-only controls must not appear in print.

## Established project patterns

- `TodoDocument` in `src/domain/types.ts` is the canonical user-document model. Layout measurements and pagination are derived projections and are never persisted.
- Keep parsing, validation, and pagination as pure functions under `src/domain/`; React components consume their results without reimplementing those rules.
- Keep reusable visible product copy in `src/copy.ts` and reusable design values in `src/styles/tokens.css`.
- Keep physical paper dimensions in the print token group and make screen preview and `@media print` consume the same tokens.
- Keep screen editing components under `src/components/`; `App.tsx` owns mode synchronization and document-level settings.
- Attach tests to the public domain seams beside their modules as `*.test.ts` files.

## Instruction hierarchy and sources of truth

- Follow the direct task, the most specific applicable scoped instructions, this root file, and then general working agreements, in that order.
- Read applicable instructions before changing files.
- Code is evidence of current behavior. `AGENTS.md` is normative for process. An approved specification is normative for desired behavior. Expose divergence among them; do not silently resolve every conflict in favor of one source.
- Keep one canonical source for each rule. Secondary documents should summarize or link to it instead of restating it.
- Do not turn analysis, research, or a read-only audit into implementation without authorization.
- Be direct and evidence-based. State assumptions, uncertainty, risks, tradeoffs, and blockers.
- Ask only when a material decision cannot be discovered safely. Prefer explicit, reversible assumptions when enough context exists.
- Give concise progress updates during long-running work.

## Before editing

1. Check applicable instructions, Git status, and the current branch.
2. Search for the behavior, callers, tests, contracts, and nearby patterns before adding anything.
3. Read only the files and chunks required to understand the affected behavior.
4. Distinguish verified facts, reasonable inferences, and unknowns.
5. Define the source of truth and ownership before changing data or state.
6. Make a short plan only for complex, risky, ambiguous, or multi-file work.

## Scope, reuse, and implementation

- Keep changes scoped to the requested result. Do not mix unrelated cleanup, dependency updates, broad refactors, or future work.
- Preserve behavior outside the task and preserve unrelated or uncommitted user changes.
- Search for existing components, services, types, helpers, tokens, configuration, tests, and platform capabilities before creating new ones.
- Follow the patterns this project already repeats. A change that would break a recorded pattern or establish a new one must stop and ask the owner first, naming the existing pattern, the proposal, and why the existing pattern does not fit.
- Prefer the smallest correct, readable, reversible, and low-operational-cost solution.
- Maintain one owner and one source of truth for each business rule, state, mapping, default, and copy value.
- Derive values instead of storing synchronized copies. Model invalid states explicitly.
- Do not add dependencies, services, layers, caches, observers, timers, polling, background jobs, or infrastructure without a current requirement and a clear owner.
- Implement relevant errors, states, accessibility, and tests with the behavior rather than as unrelated follow-up work.

## Data, security, and destructive operations

- Distinguish canonical user documents, reconstructible layout projections, transient editor state, and local preferences.
- Persist or synchronize only data that must survive or cross devices. Never turn a projection into an independent source of truth.
- Use stable application-owned identifiers. Validate data read from `localStorage` before using it.
- Keep credentials, tokens, private keys, signing material, personal data, and sensitive payloads out of the repository and logs.
- Resolve an exact target before deletion, overwrite, interruption, or another hard-to-recover action. Never force-push or perform broad cleanup without explicit authorization.

## Product interface and accessibility

- Prefer native controls and established web patterns. Custom UI must provide clear product value.
- Define layout, hierarchy, controls, empty, error, disabled, and destructive states when applicable.
- Include keyboard navigation, visible focus, screen-reader labels, scalable text, contrast, reduced motion, and non-color status cues in the same change.
- Keep visible copy centralized and consistent with the product language strategy.
- Keep expensive work out of render paths. Measurement work must be bounded and triggered by content or viewport changes.

## Code, comments, and documentation

- Write code, comments, commits, filenames, tests, configuration, and developer documentation in English.
- Follow the existing formatter, linter, naming, file layout, and architectural conventions.
- Prefer clear types, explicit ownership, and simple control flow over cleverness.
- Put comments next to non-obvious constraints and link official documentation when an external rule must remain visible.
- Keep the README easy to scan and cover benefit, behavior, requirements, setup, usage, validation, security, privacy, limitations, and deployment.
- Do not create a `CHANGELOG.md` while the product remains unversioned.

## Configuration and repository hygiene

- Ignore secrets, local environments, logs, caches, build output, and generated artifacts appropriate to the stack.
- Do not add `.env.example` while the application has no environment variables.
- Keep GitHub Actions and dependency configuration aligned with the actual deployment contract; do not add placeholder automation.
- Keep secrets in GitHub's secure store, never in versioned files.

## Tests and validation

- Add or update focused tests for changed behavior, persistence, validation, critical accessibility, Markdown conversion, and pagination.
- Test observable contracts at stable seams; avoid tests that mirror implementation details.
- During iteration run the smallest relevant check. Before completion run `npm run check` and `npm run build`.
- Never claim a check passed unless it ran successfully. Report skips, blockers, residual risk, and manual print-validation gaps.

## Artifacts and processes

- Temporary is the default; retention is an explicit repository exception.
- Remove only temporary files created by the current task. Preserve deliverables and user artifacts.
- Never version secrets, caches, local logs, coverage, or build output.
- Stop servers, watchers, browsers, and other processes started by the task.

## Agent skill paths

- Product definition: `docs/product.md`
- Domain glossary: `CONTEXT.md` (create and update only when canonical domain language is useful)

## Git and releases

- Follow the recorded branch, commit, push, and version policies.
- Check status and branch before editing and before the final report. Leave unrelated changes untouched.
- Make one commit per coherent concern. End issue-related commit subjects with the issue number; omit it when there is no issue.
- Inspect the diff before committing. Never commit secrets, caches, logs, generated build output, or temporary artifacts.
- Never force-push. Do not publish a release or change a version unless an explicit task changes the recorded policy.

## Completion report

Lead with the outcome and include changed files, validation commands and results, warnings or manual gaps, temporary artifacts removed, commit/push status, deployment status, and final worktree status.
