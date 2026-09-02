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
- Branch policy: every change reaches `main` through a pull request; `main` is protected by a ruleset requiring one approving review and the recorded status checks. Orchestrated executors use issue branches and pull requests under `## Agent execution`; the owner's own pull requests are approved through `skd approve`, because GitHub refuses an approval from the account that opened them.
- Commit policy: commit only when the owner explicitly requests it. Use Conventional Commits in English.
- Push policy: push only when the owner explicitly requests it and local validation has passed.
- Product versioning: no user-visible versions, automatic increments, tags, releases, or changelog. The private package version remains the internal `0.0.0` unless an explicit migration changes this policy.
- Agent automation: `enabled`
- Agent orchestration: `enabled` (Agent Orchestrator, local)
- Implementation agent: `claude`
- Review agent: `codex`
- Orchestration agent: `codex`
- Merge policy: merge commits only, every commit of the branch preserved. Never squash.
- Commit subject: a commit made for an issue ends with `(#<issue number>)`.
- Delete branches after merge: enabled.
- Default branch review policy: `main` requires one approving review, merge commits only, and the `validate` and `pr-conventions` status checks; `strict` stays off so a parallel lane does not re-run every open pull request after each merge. Enforced by ruleset `22041475` since 2026-09-01, approved by the `agent-approver` GitHub App (id `4779359`), which is installed on this repository.
- Release, signing, and secret-storage policy: validated pushes to `main` deploy the static build to GitHub Pages through GitHub Actions when the push changes a file the build reads; `validate` runs on every push and pull request regardless, and the deploy job is skipped for a change outside the build's inputs. Use only the repository-scoped `GITHUB_TOKEN`; there are no release artifacts, signing identities, or project secrets.
- Skills baseline revision: `45d40d7a35ad074249006f3c058b63299e65a074`
- Skills baseline applied: `2026-09-01`

Treat these values as stable project decisions. Change an established identifier, license, visibility, branch policy, versioning model, localization strategy, landing-page contract, agent-automation decision, or release policy only through an explicit task that describes the migration and downstream effects.

## Product contract

- The application has exactly one route and must opt out of search indexing.
- User documents stay in browser `localStorage`; do not add accounts, analytics, remote storage, or a backend.
- A printed page is A4 landscape (`297mm × 210mm`) containing three sequential `99mm × 210mm` panels.
- A list is atomic during pagination. Move the whole list to the next panel when it does not fit; never split it. Block printing when one list cannot fit an otherwise empty panel.
- Render the optional date only on the first panel. Render optional panel numbering on every panel.
- Keep print output monochrome and preserve physical dimensions. Screen-only controls must not appear in print.
- The supported browser family is Chromium. Print correctness is defined, verified, and accepted against Chromium only; no acceptance criterion, check, or contract may require Gecko or WebKit behaviour.

## Established project patterns

- `TodoDocument` in `src/domain/types.ts` is the canonical user-document model. Layout measurements and pagination are derived projections and are never persisted.
- Keep parsing, validation, pagination, and document mutations as pure functions under `src/domain/`; React components consume their results without reimplementing those rules.
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

## Long-running operations

- Use bounded yields, timeouts, or status mechanisms and wait for observable conditions instead of arbitrary sleeps.
- Keep the user informed at least once per minute when progress remains active.
- Distinguish slow progress from a stall using new output, state changes, resource activity, or a tool-reported deadline; elapsed time alone is not evidence.
- Inspect current output and state before interrupting, retrying, or changing approach.
- Interrupt only when progress has stopped, a deadline expired, or continued cost or risk is no longer justified.
- After interruption, report preserved state, diagnose the likely cause, and choose a narrower retry, different tool, smaller unit, or explicit blocker.
- Never rerun the same unchanged failure or add polling infrastructure merely to monitor one operation.

## Agent execution

Rules for any executor working from a clone of this repository, including cloud executors that read only committed files.

- Run tests with `npm test`; run lint with `npm run lint`. A change is not done while either fails on the exact current head.
- Branch as `<type>/<agent>/issue-<n>/<short-slug>`; commit with Conventional Commits, with the subject ending in `(#<n>)`.
- Never push to `main` and never merge: open a pull request and stop. Merge belongs to the owner, or to GitHub auto-merge under the predicates recorded in `.ao/worker-rules.md`.
- Start the pull request body with one `Closes #<n>` line per resolved issue, then document the problem, implementation, tests with results, and residual risk.
- Do not touch: `docs/product.md`, `LICENSE`, `.ao/**`, `.github/workflows/**`.
- `AGENTS.md` is protected by section, not as a file. `## Project identity and policy` is
  governance and never moves under an executor. Every other section, `## Patterns` above all, is
  documentation of this code — so a change that makes a recorded pattern untrue updates it in the
  same pull request, and a change that establishes a new one stops and asks first.
- When a needed decision is not written in the issue, comment exactly what is missing, apply `status: needs-decision`, and stop instead of guessing.

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
- Keep business rules out of presentation, transport, and external-adapter layers when a domain owner exists.
- Derive values instead of storing synchronized copies. Model invalid states explicitly.
- Do not add dependencies, services, layers, caches, observers, timers, polling, background jobs, or infrastructure without a current requirement and a clear owner.
- For large changes, use reviewable, executable increments small enough to diagnose without fragmenting one coherent concern mechanically.
- Implement relevant errors, states, accessibility, and tests with the behavior rather than as unrelated follow-up work.

## Data, security, and destructive operations

- Distinguish canonical user documents, reconstructible layout projections, transient editor state, and local preferences.
- Persist or synchronize only data that must survive or cross devices. Never turn a projection into an independent source of truth.
- Use stable application-owned identifiers. Validate data read from `localStorage` before using it.
- Use transactions or atomic writes when partial failure could leave inconsistent state. Preserve unrelated fields during external updates.
- Request only necessary permissions, fields, and scopes. Use structured subprocess arguments and validate destinations, redirects, and untrusted inputs.
- Keep credentials, tokens, private keys, signing material, personal data, and sensitive payloads out of the repository and logs.
- Resolve an exact target before deletion, overwrite, interruption, or another hard-to-recover action. Prefer recoverable deletion where practical. Never force-push or perform broad cleanup without explicit authorization.

## Product interface and accessibility

- Prefer native controls and established web patterns. Custom UI must provide clear product value.
- Define layout, hierarchy, controls, loading, content, empty, error, retry, disabled, cancellation, and destructive states when applicable.
- Include keyboard navigation, visible focus, screen-reader labels, scalable text, contrast, safe areas, reduced motion, and non-color status cues in the same change.
- Keep visible copy centralized and consistent with the product language strategy.
- Keep expensive work out of render paths. Prefer event-driven, on-demand, bounded, incremental, lazy, paginated, and cancelable work. Measure before claiming a performance problem.

## Code, comments, and documentation

- Write code, comments, commits, filenames, tests, configuration, and developer documentation in English.
- Follow the existing formatter, linter, naming, file layout, and architectural conventions.
- Prefer clear types, explicit ownership, and simple control flow over cleverness.
- Put comments next to non-obvious constraints. Explain intent, provenance, or subtle external rules rather than mechanics, and link official documentation when a rule must remain visible.
- Durable documentation describes responsibilities, contracts, invariants, commands, and decisions. Update the smallest canonical section when a durable contract changes.
- Keep the README easy to scan and cover benefit, behavior, requirements, setup, usage, validation, security, privacy, limitations, and deployment.
- Preserve the recorded public name and branding as the README H1. Every fenced block setup creates or materially edits must have an explicit language identifier.
- Use badges, real screenshots, statistics, and emoji only when they improve comprehension and can remain current.
- Preserve third-party licenses, copyright, attribution, and notices.
- Do not create a `CHANGELOG.md` while the product remains unversioned.

## Durable project learning

At workflow completion, assess whether the work produced a verified, project-specific, recurring learning that belongs in durable guidance, documentation, or a script.

- Qualifying learnings include rerunnable commands actually verified, accepted ownership boundaries or invariants, recurring failure shields with a verified cause, and versioned external constraints whose source must remain visible.
- Hypotheses, one-off debugging steps, raw logs, issue-specific implementation details, transient environment state, machine-specific paths, credentials, personal data, and unsupported model conclusions do not qualify.
- Compare a qualifying learning with existing canonical owners first. If absent or contradictory, propose the smallest update using `Evidence`, `Canonical owner`, `Smallest change`, `Draft`, and `Decision requested`.
- Do not create a new document when an existing owner can hold the learning. Adjacent learning outside the accepted scope remains proposal-only until approved.

## User attention cards

When the user must notice and respond to a proposed follow-up, material choice, permission boundary, or blocker, use exactly one attention card surrounded by horizontal rules. Render its headings and explanations in the user's language while preserving required code, paths, identifiers, and quoted source text.

- **Proposed issue:** use only for a distinct, evidence-backed, implementable improvement outside the accepted scope that is not already tracked. State why it matters, current evidence, proposed outcome, why it is separate, and a recommendation. End with the exact reply tokens `Approve issue`, `Reject issue`, or `Revise: ...`.
- **Decision needed:** explain why repository evidence cannot settle the choice, compare meaningful options and tradeoffs, recommend one, and end with exact response tokens.
- **Approval needed:** name the exact external, destructive, publication, cost, privacy, or permission-crossing action; include target, expected change, risk, reversibility, and recovery. Approval covers only that action.
- **Action needed:** identify the blocked work, why the agent cannot continue, the smallest user action, and the observable condition that permits resumption.
- When the client offers a structured question facility, use it in the same turn as the card so the unanswered decision remains visibly blocked. A prose card alone records context but does not hold the workflow open.

## Configuration and repository hygiene

- Ignore secrets, local environments, logs, caches, build output, and generated artifacts appropriate to the stack.
- Do not add `.env.example` while the application has no environment variables.
- Keep GitHub Actions and dependency configuration aligned with the actual deployment contract; do not add placeholder automation.
- Change GitHub's repository homepage only when the recorded URL, active Pages site, and latest successful deployment agree exactly after trailing-slash normalization.
- Keep secrets in GitHub's secure store, never in versioned files.

## Tests and validation

- Add or update focused tests for changed behavior, persistence, validation, critical accessibility, Markdown conversion, and pagination.
- Test observable contracts at stable seams; avoid tests that mirror implementation details.
- During iteration run the smallest relevant check. Before completion run `npm run check` and `npm run build`.
- Never claim a check passed unless it ran successfully. Report skips, blockers, residual risk, and manual print-validation gaps.

## Artifacts and processes

- Temporary is the default; retention is an explicit repository exception.
- Remove only temporary files created by the current task when they are no longer needed. Preserve deliverables, next-phase inputs, failure evidence, and pre-existing user artifacts.
- Never version secrets, caches, local logs, coverage, or build output without an explicit requirement.
- Stop only servers, watchers, browsers, containers, workers, and other processes started by the task.

## Agent skill paths

- Product definition: `docs/product.md`
- Performance budget and supported document scale: `docs/performance.md`
- Domain glossary: `CONTEXT.md` (create and update only when canonical domain language is useful)

## Git and releases

- Follow the recorded branch, commit, push, and version policies.
- Check status and branch before editing and before the final report. Leave unrelated changes untouched.
- Make one commit per coherent concern. End issue-related commit subjects with the issue number; omit it when there is no issue.
- Merge issue branches with `gh pr merge <number> --merge --delete-branch`; never squash.
- Inspect the exact payload before every publication: staged diff for commits, outgoing commits for pushes, final text for GitHub writing, and exact artifacts for releases.
- Stop before publication when the payload contains credentials, keys, signing material, sensitive personal data, or secret-bearing configuration. Never print the value; identify only the file, masked location, and category.
- If a sensitive value may already be published, stop further spread and require revocation or rotation before considering history repair.
- Never force-push. Do not publish a release or change a version unless an explicit task changes the recorded policy.

## Completion report

Lead with the outcome and include changed files, validation commands and actual results, warnings or manual gaps, temporary artifacts kept or removed, commit/branch/push status, deployment status, final worktree status, and unrelated dirty files left untouched.
