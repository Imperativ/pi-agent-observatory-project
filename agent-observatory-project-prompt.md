# Project Creation Prompt: Agent Observatory

## Required project kickoff

Before creating files or making changes, establish the target folder and Git handling. Ask the user only for information that is not already explicitly established by the request or trusted project context; do not ask redundant questions.

1. **Target folder:** If it is not established, ask which folder should hold the project and wait for the answer. Use exactly that folder. If it does not exist, create it. Resolve relative paths transparently against the available workspace, and do not modify files outside the confirmed target folder unless explicitly requested. If the request or trusted project context already establishes the folder, use it and state that interpretation before proceeding.
2. **Git preparation:** Inspect the target folder's Git state before deciding whether clarification is needed. Preserve any existing repository, history, configuration, and user changes; never reinitialize an existing repository. If it is not already a repository and the request/context does not establish Git handling, ask whether to initialize one and wait. If Git handling is already established, follow it. When authorized to initialize, add appropriate repository basics such as a `.gitignore`.

Do not make silent assumptions about unresolved points. Begin implementation only after required clarifications are answered. Read-only inspection necessary to determine whether the target exists or is already a repository is permitted; do not inspect unrelated workspace contents before the target is established.

## Mission

Build, test, and deliver the actual working project and all required files. Do not stop after producing a plan, PRD, architecture proposal, or task list. Run all available tests, builds, linters, type checks, and smoke tests; fix in-scope failures, rerun validation, and report the commands and validation evidence/results honestly.

Build, test, and deliver a functional local dashboard in the confirmed target folder of the currently available workspace. The dashboard must present the state, capabilities, and work of the currently executing agent in a standardized way. Work directly in the files located there. Do not stop after a plan, specification, or architecture proposal; the result must be a usable implementation with verification evidence.

If your environment cannot create files, provide the complete contents of every file, their exact target paths, and all required start and verification commands so the project can be reconstructed without another design round.

## Product definition

- **Concept:** A portable, local “Agent Observatory” with standardized information cards for arbitrary coding or general-purpose agents.
- **User and context:** A technically experienced person frequently tests newly configured agents and wants to compare their characteristics and current work status quickly.
- **Problem:** Agents provide inconsistent, scattered, or unverifiable information about their model, runtime, tools, access rights, task, and progress.
- **Primary outcome:** After launch, a clear dashboard page is available that displays all standardized information that can be obtained and honestly identifies missing information.
- **Visual concept:** The dashboard should guide attention toward overall status, task, blockers, and freshness through a clear information hierarchy, deliberate color accents, and an appealing but uncluttered design. A user-defined agent persona should be reflected subtly in the appearance when one has explicitly been provided, without impairing readability or usability.
- **Delivery environment:** Primarily local on the same machine. The dashboard may use the internet and external APIs to add current information, status values, and badges. The local core should remain usable when the network is unavailable or disrupted, clearly marking online content as unavailable or stale.
- **v1 boundary:** A responsive read-only web interface, a clearly documented machine-readable status source, optional online enrichment, and a simple local start method. No centralized agent management and no remote control.
- **Success signals:** The dashboard starts according to the README, displays sample data, handles missing fields transparently, can be reused for another agent by updating a status file without rebuilding the interface, and presents configured online information with visible source and freshness information.

## Scope

### In scope

- After the required kickoff questions, inspect the repository, operating system, available runtime, package management, and existing project conventions inside the confirmed target folder.
- Preserve an existing project and integrate the dashboard appropriately instead of needlessly starting over.
- Implement a local web interface with the following standardized sections:
  1. **Identity:** Agent name, provider/product, reported model, model version or alias, instance/session ID, start time, and uptime.
  2. **Current assignment:** Goal, current step, status, progress with a traceable basis, start time, and last update time.
  3. **Capabilities:** Available tools, skills/plugins/connectors, subagent capability, and browser, shell, file, network, and image capabilities.
  4. **Environment:** Working directory, repository/branch when available, operating system, runtime versions, and relevant execution mode such as local, container, or cloud.
  5. **Permissions and limits:** Read/write areas, network status or allowlist, sandbox/approval mode, known access restrictions, and missing credentials—without exposing secrets.
  6. **Context and usage:** Context window, consumed context, token counts, cost, and rate limits only when they come reliably from the environment or an authoritative API; otherwise explicitly show “unavailable” or “unverified.”
  7. **Activity:** A compact chronological list of important steps, tool calls, and results; sensitive arguments, tokens, keys, and personal data must be redacted.
  8. **Artifacts and checks:** Created/modified files, builds, tests, lints, and their latest evidenced status; online badges or status values for repositories, CI, releases, dependencies, or services may also be shown.
  9. **Issues:** Blockers, errors, warnings, open assumptions, and the next sensible action.
- Fetch current information from the internet or authoritative APIs when it adds clear value. Prefer official or primary sources and, where practical, render badges from normalized data locally. Externally loaded badge images or widgets are permitted only through a documented, configurable allowlist and must not transmit local information to third parties without control.
- Show a clear overall status, a last-updated timestamp, and a stale-data indicator. Define the timestamp source explicitly: distinguish the snapshot's `observedAt`/agent-reported update time from the dashboard's local successful-fetch time. Calculate staleness from the configured authoritative timestamp; if it is missing or invalid, show freshness as unknown rather than silently substituting another clock. Define uptime as agent-reported, or calculate it from a validated start time and the dashboard's current clock; label the source and do not invent a start time.
- Provide useful filters for activity and status plus a compact detail view; search is required only if justified by the amount of data.
- Support dark and light modes, clearly readable states, keyboard operation, and reduced motion.
- Give the dashboard intentional visual and color design rather than limiting it to a purely neutral default interface. Use color, contrast, surfaces, typography, and spacing deliberately to guide attention; status and meaning must never be communicated through color alone.
- If a persona created by the user has explicitly been provided for the executing agent, derive a restrained, coherent theme from it. Examples: a stoner rock persona may use earthy, pastel, and sandy colors; an Adeptus Mechanicus persona may use a silver or metallic appearance, subtle metal textures, and distinctive color accents. Do not invent a persona or copy these examples mechanically; translate only the characteristics that were actually provided into palette, surfaces, typography, and accents.
- Include sample data so the interface can be demonstrated immediately.
- Document in the README how any agent can initialize and update the status source during its work. Also describe every online source, its configuration, update interval, required permissions or credentials, privacy impact, and failure behavior.

### Explicitly out of scope

- No authentication, user management, cloud database, public deployment, or multi-agent fleet management in v1.
- No control commands to start, stop, or manipulate the agent.
- No silent collection of system or user data outside the approved workspace.
- No transmission of telemetry to third parties.
- No unsolicited transmission of local status data, working directories, repository content, or identifiers to external badge, analytics, or API services.
- No fabricated model, token, cost, progress, permission, or test results.
- No requirement to use Docker, React, a database, or a build system when a smaller solution satisfies the requirements reliably.

### Future-ready seams

- Version the status format so adapters for different agents or a live event source can be added later.
- Separate the data source, normalization, and presentation so polling can later be replaced with Server-Sent Events or WebSocket.
- Keep the interface modular enough to support comparative display of multiple sessions later without implementing that capability in v1.

## Requirements

### Delivery priorities

- **Must ship in v1:** offline-capable local dashboard; versioned sample status source; all nine information sections with honest unavailable states; polling/update without rebuild; stale and recoverable error handling; responsive accessible UI; README and reproducible local start; core automated checks for data handling, privacy, and safe rendering.
- **Should ship when proportionate:** activity/status filters, detailed view, a schema file, visual persona theming when explicitly provided, and further browser automation.
- **Optional and non-blocking:** online enrichment, badges, API adapters, and any credential-dependent integration. These must not delay or weaken the offline core, and may be explicitly deferred with the reason documented.
- If time or environment constraints prevent a “should” item, deliver all “must” items first and list the deferred item and reason. Do not silently omit a must-have; report the exact blocker.

1. **Portable data source:** Define a clear, versioned JSON schema or equivalent local format. Provide a sample file and a concise field reference. Unknown optional values must be `null` or omitted; they must not be estimated.
2. **Normalization and provenance:** Every dynamic measurement should support `value`, `source`, `observedAt`, and `verification` (`verified`, `self_reported`, `unverified`, `unavailable`) where appropriate. The UI must communicate verification status clearly.
3. **Updates and freshness:** The display must accept new status data without a rebuild. Use robust polling or an equally simple local method for v1. The polling interval and stale threshold must be centrally configurable. Distinguish the source snapshot's observation/update timestamp from the dashboard's local successful-fetch timestamp; calculate staleness from the source timestamp, not from fetch time. If the source timestamp is absent, invalid, or in the future beyond an explicitly defined clock-skew tolerance, show freshness as unknown/invalid and explain why. Uptime must either be explicitly reported by the agent with provenance or calculated from a valid reported start time and the local clock; identify which method is used and never estimate a missing start time.
4. **Fallback behavior:** Missing or invalid status data must not make the page unusable. Show a clear error, retain the most recent valid snapshot where possible, and explain how to resolve the issue.
5. **Privacy:** Never display API keys, access tokens, cookies, complete environment variables, or other secrets. Implement a small redaction function for typical secret field names, and document that data should already be minimized at the source.
6. **Honest telemetry:** Use only runtime information that is actually discoverable and permitted. If no authoritative source exists, show the value as unavailable. Do not infer model identity or usage from assumptions.
7. **Status semantics:** Use a small, stable set of states such as `idle`, `working`, `waiting`, `blocked`, `failed`, and `completed`, and document their meaning. Show a percentage only when a defined calculation basis exists; otherwise use a qualitative status.
8. **Activity log:** Entries require a time, category, short description, result status, and optional duration. Do not display long payloads without filtering.
9. **Artifacts and checks:** Check status must distinguish between `not_run`, `running`, `passed`, `failed`, and `unknown`. “Passed” is allowed only after an actual successful run.
10. **Local operation:** The project must start locally with a short documented command. If browser security rules prevent a JSON file from loading over `file://`, provide a minimal local server or an equally simple solution.
11. **Responsive UI:** The most important information—overall status, assignment, blockers, and last update—must be visible on a typical laptop without scrolling; the layout may wrap appropriately on small displays.
12. **Accessible states:** Status must not be communicated through color alone. Use text/icons, sufficient contrast, visible focus, and semantic HTML.
13. **Online sources and badges (optional v1 enhancement):** Keep online enrichment disabled by default and individually configurable by source. The core v1 dashboard must work fully without any network access, API, credential, or online badge. If an online source is implemented/enabled, show at least its source name or link, retrieval time, and verification status; use timeouts, handle rate limits, and validate responses before normalization. Never expose secret tokens in the browser.
14. **Caching and network fallback (only for implemented online sources):** Limit request frequency and data volume. Where appropriate, retain the latest valid value with a clear stale marker. A source failure, CORS block, or invalid response must not break local status display or other sources. Do not let optional online work block delivery or verification of the offline core. Defer a local API proxy/server adapter, credential handling, and integrations requiring one to a separately scoped follow-up unless explicitly authorized as part of v1.

## Technical direction

- **Recommended architecture:** A small frontend application reads a local status snapshot, validates/normalizes it, and renders cards, an activity list, badges, and error states. An optional lightweight local adapter may serve static files and call online APIs when browser CORS or credential protection requires it. No backend persistence in v1; an ephemeral cache for online data is permitted.
- **Default stack:** Prefer maintainable HTML, CSS, and JavaScript without mandatory external CDN runtime dependencies or an unnecessary build step. Online data sources and APIs are explicitly permitted. If the existing repository already uses a suitable web stack, integrate with it and briefly explain the decision. Do not add a large dependency merely for styling, icons, or individual API calls.
- **Visual system and persona theming:** Define colors and surfaces as centralized design tokens so visual guidance, dark/light mode, and any persona theme remain consistent. Decorative textures must be local, restrained, and contrast-safe; information hierarchy takes priority over atmosphere. When no persona is explicitly known, use a distinctive, professional default theme.
- **Suggested files:** `index.html`, `styles.css`, `app.js`, `agent-status.example.json`, optionally `agent-status.schema.json`, a minimal start script, and `README.md`. Adapt paths to existing conventions.
- **Interface contract:** The status format is the contract between the agent and the dashboard. Include a top-level `schemaVersion` field and tolerate unknown additional fields without blindly inserting them into HTML.
- **Security:** Treat online responses as untrusted input, validate and constrain them, escape all external text before rendering, and do not use unsafe HTML injection. Keep API keys exclusively server-side or in the local adapter, restrict target hosts through configuration, and do not include third-party telemetry.
- **Assumptions:** One local user, read-only display, small data volumes, modern browsers. These defaults are reversible.
- **Unverified dependencies:** Check early which runtimes are actually available. If Node/Python is unavailable, the static page must still be delivered as files; document an available alternative start method without claiming a successful launch.

## Minimum test strategy

Implement and run the following core checks using the lightest suitable test setup for the chosen stack; do not add a large framework solely for these tests:

1. **Contract and normalization:** valid sample, missing optional values, malformed JSON, and unsupported `schemaVersion` produce the documented outcomes without uncaught errors.
2. **Freshness:** fresh, stale, absent/invalid timestamp, and future timestamp beyond the documented clock-skew tolerance are handled as specified; fetching a snapshot does not reset its observation age.
3. **Privacy and rendering:** representative secret field names/values are redacted or excluded, and a harmless HTML-injection string is rendered as inert text.
4. **Checks and status semantics:** `passed` is emitted/displayed only for an evidenced successful run; unknown and not-run states remain distinct.
5. **Local smoke check:** invoke the documented start command and verify the local page and status endpoint/source respond. If a real browser test cannot run, state that limitation and perform the strongest available HTTP/runtime checks instead.

Use automated tests for deterministic logic and security-sensitive cases; supplement them with a concise manual checklist for keyboard navigation, focus visibility, color-independent status, dark/light modes, and responsive layout. Report each command and its actual result. If a test category cannot be run in the available environment, identify it explicitly rather than implying coverage.

## Implementation workflow

1. Establish the target folder and Git handling using the Required project kickoff rules: rely on already-established context, perform only the read-only checks needed to identify the target and repository state, and ask only for unresolved decisions.
2. Create the target folder if necessary, then inspect that folder's workspace, conventions, and user changes before implementation; do not inspect unrelated folders.
3. Preserve any existing repository and history. Initialize Git only when the folder is not already in a repository and initialization is authorized by the user or established project context.
4. Check early which local start method and test options are actually available.
5. Define the status schema, sample data, states, provenance, redaction rules, and optional online-source configuration.
6. Build a thin end-to-end path first: start the application, load the status file, display overall status and assignment, and handle loading/error states.
7. Add online enrichment and badges through clearly separated adapters with timeouts, validation, retrieval timestamps, and independent failure fallbacks.
8. Add the remaining standardized sections, responsive design, dark/light modes, visual guidance, an optional existing persona theme, filters, and stale detection.
9. Add schema/data validation, redaction and security checks, and documentation.
10. Run available tests, lints, builds, and a browser/HTTP smoke test. Fix in-scope failures and rerun the affected checks.

The workflow is only an execution aid. Implement and deliver the complete project within the same task.

## Verification and acceptance

Use the traceability matrix below to connect the main requirement groups to evidence. The scenarios that follow define expected behavior; do not treat a criterion as passed unless the corresponding check was actually run. Combine overlapping checks where one test provides evidence for multiple criteria, and report that mapping.

| Requirement group | Minimum verification evidence |
| --- | --- |
| Status contract, provenance, missing/unsupported data | Valid sample loads; missing optional values remain unavailable; malformed JSON and unsupported schema versions show a recoverable error. |
| Updates, freshness, recovery | Change the status file and observe refresh without rebuild; fresh, stale, missing/invalid, and excessive-future-skew timestamps are exercised; fetch time does not reset snapshot age; last valid snapshot remains identifiable after a later load failure. |
| Privacy and safe rendering | Secret-field test data is not rendered; harmless HTML-injection text is displayed as text, not executed. |
| Local operation and documentation | Documented start command serves the page; README instructions, sample format, and implementation agree. |
| Accessibility and visual modes | Keyboard-only pass, visible focus, status meaning without color, and dark/light mode checks. |
| Online enrichment, when implemented/enabled | Per-source success and controlled failure (timeout, invalid response, or unavailable network) checks; source, retrieval time, verification, and independent fallback are visible. |

The implementation is accepted when the following scenarios demonstrably work:

1. The documented start command serves the dashboard locally and the main page responds successfully.
2. The sample data produces a fully readable view of all nine information sections.
3. A change to the status file appears after the update interval without a rebuild.
4. Missing optional fields appear as unavailable and cause neither fabricated values nor JavaScript errors.
5. Invalid JSON or an unsupported schema produces a clear error state; an existing latest valid snapshot remains identifiable.
6. Stale data is visibly marked after the configured threshold is exceeded.
7. Typical secret fields in test data are not rendered in plaintext.
8. Status remains understandable with keyboard use and without color perception; dark and light modes work.
9. External text is not interpreted as executable HTML; verify this with a harmless injection test string.
10. The README, status format, and implemented start steps agree.
11. The visual hierarchy clearly guides attention to overall status, assignment, blockers, and freshness. If a user persona was explicitly provided, it is implemented as a restrained theme without degrading contrast, focus indication, or comprehension.
12. For every enabled online source, the interface shows the source, retrieval time, and verification status. A successful retrieval updates the associated value or badge transparently.
13. Timeouts, rate limits, CORS problems, offline operation, and invalid external responses are handled without breaking the rest of the display; where applicable, a clearly stale-marked latest valid value remains visible.
14. A test confirms that external content is not executed as HTML and secret credentials are exposed neither in the frontend nor in rendered data. If a real online retrieval is impossible, failure handling may be tested with a controlled mock, but it must be reported explicitly as such.

Run all relevant tests, lints, builds, and smoke checks available in the project. Repair in-scope failures and rerun the affected checks. Do not claim success for checks that were not run.

## Autonomy and decision policy

- Inspect files and the environment before making technical commitments.
- Preserve explicit requirements and existing project conventions.
- Resolve ordinary gaps independently with safe, reversible decisions, and document only consequential choices.
- Do not ask about purely cosmetic preferences, stack choices, or filenames when they can be resolved reversibly.
- Stop only for missing authority, unavailable mandatory credentials, a security/legal boundary, or a decision that would materially change product identity, data ownership, cost class, or v1 scope.
- If blocked, complete all independent work and state the exact blocker and the next required step.
- Verify time-sensitive external claims against authoritative sources when tools are available; otherwise mark them as unverified and protect the implementation with a test/fallback.
- Use subagents only when the environment supports them and the complexity provides a real benefit; you remain responsible for integration and verification.

## Delivery contract

Deliver the real, functional project rather than another planning document. Before finishing:

1. Create or modify all required source, configuration, test, sample, and documentation files.
2. Remove placeholders, fake telemetry, and simulated integrations; sample data must be clearly labeled as such.
3. Run the available build, test, lint, security, and smoke commands.
4. Fix in-scope failures and rerun the checks.
5. Briefly document setup, startup, the status format, agent-driven updates, and common troubleshooting.
6. In the final report, list created/modified files, executed commands with actual results, remaining unverified points, intentional scope exclusions, and exact blockers.
