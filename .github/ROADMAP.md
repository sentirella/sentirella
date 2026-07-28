# Sentirella Roadmap

This document explains how Sentirella's future work is organised across the Current Prototype record, the Stabilisation workstream, the Open Source & Self-Hosting roadmap, the Product roadmap, and the Shared work that serves both roadmaps at once.

Structured source of truth (fields, labels, Epics, Issues, parent relationships, dependencies, initial Status of every card): **[`.github/roadmap/sentirella-kanban.yaml`](./roadmap/sentirella-kanban.yaml)**. That file is synchronised against the GitHub Project and Issues by **[`.github/roadmap/sync-project.mjs`](./roadmap/sync-project.mjs)** (see "How the board is synchronised" below).

GitHub Project: <https://github.com/users/sentirella/projects/2> ("Sentirella — Integrated Roadmap", owner `sentirella`, project number 2)
Repository: <https://github.com/sentirella/sentirella>

## Purpose of the workstreams

- **Current Prototype** (`EPIC-P0`) — records what already exists and is running in production today. Nothing here is presented as pending; every card is `Done`. Where a finished capability currently depends on a specific provider, that dependency is stated explicitly and linked to the future Issue that will adapt or replace it.
- **Stabilisation** (`EPIC-S0`) — validates the current production deployment, automatic updates, and connection recovery under realistic use, before further work builds on top of it.
- **Open Source & Self-Hosting** (`EPIC-H1`–`EPIC-H6`) — makes Sentirella deployable and operable by a third party without Sentirella-owned secrets, accounts, or mandatory external providers. Organised into six milestones, H1 through H6.
- **Product** (`EPIC-PR1`–`EPIC-PR8`) — improves Sentirella as an application: identity and profile, robust transfers, real-time channel security, multiple devices per account, sleep control, a macOS client, documentation, and an external audit.
- **Shared** — used whenever a single task is required by both the Open Source and Product roadmaps. A Shared Issue has exactly one native parent Epic; its relationship with the other roadmap's Epic is recorded as Related work, never duplicated as a second Issue. See "Avoiding duplicate work" below.

## Current Prototype vs. future transformation

Two different things must never be conflated:

- **What already exists**: everything under `EPIC-P0` — the local gatekeeper and coordination server architecture, identity, folder permissions, transfers, the desktop application, documentation, and publication. Every Issue under `EPIC-P0` is `Done`: built and in production use. It is never presented as pending.
- **What currently depends on a specific provider**: some finished capabilities depend today on Google (sign-in), a specific email provider (registration verification), or Cloudflare (remote access). This is never hidden — those Issues carry the `current-dependency` and/or `requires-adaptation` labels and explicitly link, under Related work, to the future Issue (inside `EPIC-H2`, `EPIC-H3`, or `EPIC-H4`) that will adapt or replace the dependency. A current capability and its future replacement are always **two different, linked Issues** — never the same Issue rewritten.
- **What still needs to be built**: everything under `EPIC-S0` (stabilisation), `EPIC-H1`–`EPIC-H6` (Open Source scope), and `EPIC-PR1`–`EPIC-PR8` (product).

## Status meanings

The Project's built-in `Status` field is reused, with its options fully redefined (the board was empty, so this was safe) in this exact order:

| # | Status | Meaning |
|---|--------|---------|
| 1 | Needs definition | A technical or product decision is required before implementation can start. |
| 2 | Backlog | Accepted work that is not yet prepared to start. |
| 3 | Ready | Scope and acceptance criteria are complete and work may start. |
| 4 | In progress | Active implementation or evidence-based validation is taking place. |
| 5 | Blocked | Work cannot continue because of a specific hard dependency. |
| 6 | In review | Implementation is complete and is awaiting verification. |
| 7 | Done | All acceptance criteria are met and completion evidence is attached or, for historical prototype records, explicitly marked as pending historical evidence. |

`In progress` is never used for work that is only planned or discussed.

## Field and label model

Custom Project fields: `Roadmap` (Open Source & Self-Hosting / Product / Shared / Current Prototype), `Type` (Epic / Feature / Technical task / Research / Decision / Documentation / Test / Security / Bug), `Area` (18 options, from Core and Identity through Documentation and Operations), `Phase` (Existing Prototype / Stabilisation / Open Source Scope / Product Evolution / Later Phase), `Open Source milestone` (H1–H6 / Cross-cutting / Not applicable), `Priority level` (Critical / High / Medium / Low), `Risk` (High / Medium / Low), `Target version` (text), `Estimated effort` (number, reused from the built-in `Estimate` field), `Start date` / `Target date` (reused as-is), `Evidence` (text or link). GitHub's built-in `Priority` (P0/P1/P2) field is kept unchanged and unused, and is never shown in a documented view — it is a different scale from `Priority level` and is not repurposed. `Parent issue` and `Sub-issue progress` are GitHub's native Projects v2 capabilities and are used directly. No assignee, owner, responsibility, or person field is ever created. Values for `Target version`, `Estimated effort`, `Start date`, `Target date`, and `Evidence` are never invented — they stay empty until a real value exists.

Repository labels fall into four groups: `type:*` (nine, matching the `Type` field), roadmap labels (including the searchable `open-source` label), architectural-state labels (`current-dependency`, `requires-adaptation`, `provider-neutral`, `self-hosting`, `community-infrastructure`, `security-critical`), and `area:*` (ten, covering the Areas that most benefit from cross-board search: identity, email, infrastructure, connectivity, relays, crypto, security, transfers, desktop, docs). The exact colours are defined in `sentirella-kanban.yaml`. Labels are not used to duplicate every Project field — they exist for search outside the board and to flag properties that matter on their own.

## H1–H6 open-source objectives

| Milestone | Name | Objective |
|-----------|------|-----------|
| **H1** | Open, reproducible and autonomous foundation | Allow a third party to deploy Sentirella without Sentirella-owned secrets, accounts, or mandatory external providers. |
| **H2** | Configurable identity and registration | Allow Sentirella to operate without Google and let each installation choose how accounts are created, verified, and recovered. |
| **H3** | Configurable email and domain | Allow each installation to use its own SMTP infrastructure or operate with email completely disabled. |
| **H4** | Provider-independent connectivity and an operable relay | Decouple public access from any mandatory provider, validate an independently operable publication path, and establish the minimum relay capabilities needed for resilient connectivity. |
| **H5** | Blind relay and end-to-end protection | Define and validate a security model in which relays can transport protected content without reading or undetectably altering it. |
| **H6** | Distributed direct connectivity | Evaluate and validate direct-first connectivity, automatic fallback, and independently operated relay options without committing prematurely to one implementation. |


## Why provider-dependent capabilities stay recorded separately

Some capabilities that already work in production — Google sign-in, email verification through the current provider, remote access through Cloudflare — are not hidden and are not rewritten as if they were still pending. Each is recorded as `Done` under `EPIC-P0`, carries the `current-dependency` and/or `requires-adaptation` labels, and links to the specific future Issue that gives Sentirella a provider-neutral path (for example `P0-06` links to `H2-06`; `P0-05` links to `H2-05` and `EPIC-H3`; `P0-02` links to `H4-01`, `H4-02`, and `H4-08`). This keeps the record honest: nothing finished is presented as pending, and no current dependency is hidden.

## Optional email and accounts without email

Sentirella must be able to create and use accounts without collecting an email address at all (`H2-03`), and every installation must be able to choose its account-creation and recovery policy from an explicit matrix (`H2-01`): identifier-and-password accounts without email, email without verification, email with verification, open registration, restricted or invitation-only registration, and administrator-created accounts. Recovery is defined separately for accounts that have a usable email address (`H2-07`, which also carries the recovery user-experience requirements) and for accounts that have none (`H2-08`).

## Provider-neutral SMTP, domain, and public URL configuration

Email delivery is built behind a provider-neutral abstraction (`H3-01`) so the current provider is never required by the core. Each installation configures its own SMTP service (`H3-02`), its own domain and public URL (`H3-03`), and stores its credentials securely (`H3-04`). Sentirella must also be able to run with email completely disabled (`H3-08`) — this is validated explicitly, not assumed.

## Provider-independent connectivity and an operable relay

The public access point is represented through provider-neutral configuration (`H4-02`), with support for custom domains and certificates (`H4-03`). Publication topologies are evaluated before support is committed (`H4-04`), and at least one independently operable path must be validated end to end (`H4-08`). The same milestone defines the minimum operable relay, including session handling, recovery, observability, and abuse boundaries. Remote access, perimeter protection, and DDoS protection remain separate concerns: Sentirella does not claim that application rate limits, a tunnel, or a relay resolve every attack on their own.

## Blind relay and end-to-end protection

This milestone begins with an explicit threat model and security requirements. Maintained, publicly reviewed standards and libraries are compared and prototyped before any production choice is approved. The resulting design must protect confidentiality and integrity across relay-assisted transfers, define an auditable key lifecycle, minimise exposed metadata, and validate that a relay can transport protected content without reading or undetectably altering it. Public tasks describe required properties, evidence, and trust boundaries without publishing operational secrets or fixing an architecture before the research is complete.

## Distributed direct connectivity

Devices should prefer a direct connection where the validated environment permits it and use an alternative route when direct connectivity is unavailable. This milestone evaluates maintained connectivity approaches, defines failure detection and fallback behaviour, prototypes discovery and relay-selection policies, and validates a minimum matrix of supported scenarios. Compatible relay infrastructure may be privately or independently operated, but the roadmap does not promise a universal directory, a fixed selection algorithm, or support for every possible topology before those models have been evaluated.

## Avoiding duplicate work

When a task is required by both the Product and Open Source roadmaps, a single Issue is created with `Roadmap: Shared`, its two related Epics are noted under that Issue's Related work, and only its documented hard dependencies become native GitHub blocking relationships. It is never duplicated into a Product copy and an Open Source copy. Three cases in this roadmap are explicitly merged rather than duplicated: the product password-recovery interface is folded into `H2-07`, not created as a separate `PR1-02`; product real-time per-user/per-connection/per-folder limits are folded into `H4-06`, not created as a separate `PR3-01`; and product temporary abuse blocking is folded into `H4-07`, not created as a separate `PR3-03`. These three declarations live in `merged_issues` inside `sentirella-kanban.yaml`.

## Public chronological roadmap identifiers

Every Epic and task also carries a public, chronological identifier — `E01`–`E16` for Epics, `T001`–`T138` for tasks — shown as the Issue title prefix (for example `[T061] Inventory and remove Cloudflare coupling`) and as a `Roadmap ID` Project field, alongside a numeric `Chronological order` field (1–154) that reflects the approved roadmap sequence: Current Prototype first, then Stabilisation, then Open Source (H1–H6 in order), then Product (PR1–PR8 in order). These are presentation identifiers only. The internal keys already used throughout this document (`P0-01`, `H1-01`, `EPIC-H4`, and so on) remain the permanent, canonical identifiers: dependencies, parent relationships, and the manifest's `id` field always use them, never the public `T`/`E` numbers. A card's chronological position is unrelated to its Status — a low `Chronological order` value does not mean a task is complete, and a high one does not mean it is unstarted.

> Public roadmap identifiers are assigned chronologically when work is formally accepted into the roadmap. Task identifiers are never reused, even when a task is cancelled, merged, or removed from active planning. Existing identifiers are never renumbered merely because priorities or implementation dates change.

The next available identifiers are **`T139`** (next task) and **`E17`** (next Epic).

## How an Issue is proposed, started, reviewed, and closed

1. **Propose**: check `sentirella-kanban.yaml` and the Project first to confirm the same scope is not already covered by an existing or merged Issue. If the task serves both roadmaps, propose one Shared Issue, not two. Every Issue follows the same eleven-section template — Context, Objective, Scope, Out of scope, Planned work, Acceptance criteria, Dependencies, Related work, Tests, Documentation, Completion evidence — and no section is left empty. Assign `Roadmap`, `Type`, `Area`, `Phase`, `Open Source milestone`, `Priority level`, and `Risk` only where they are actually known; `Target version`, `Estimated effort`, `Start date`, `Target date`, and dates in general are never invented.
2. **Start**: an Issue only moves to `Ready` once its scope and acceptance criteria are complete, and only moves to `In progress` once work is actively happening — never while it is still only being discussed.
3. **Review**: once implementation is complete, the Issue moves to `In review`, pending verification against every acceptance criterion.
4. **Close**: an Issue is **not** closed merely because code was written. It moves to `Done` only when every acceptance criterion is met and completion evidence is attached — a linked Pull Request or commit, test results, and updated documentation, plus deployment or runtime evidence where the acceptance criteria require it. For a Current Prototype record, the evidence may be a link to existing code, deployment, documentation, or a screenshot; if that historical evidence has not yet been attached, the Issue says so explicitly instead of implying it has already been verified.

## Native relationships

Every non-Epic Issue has exactly the parent Epic recorded in the manifest — including the three Shared Issues that absorbed a merged product task, whose only native parent is their Open Source Epic. A native GitHub blocking relationship (`blocked by` / `blocking`) is created **only** for entries listed under an Issue's Hard dependencies; Related work is always a text-only reference and never becomes a native dependency. No dependency is inferred from similar wording, a shared Area, a shared Epic, or intuition, and no transitive dependency is added automatically — if A blocks B and B blocks C, A does not also block C unless the manifest says so explicitly.

## How the board is synchronised

`sentirella-kanban.yaml` is the single source of truth. `.github/roadmap/sync-project.mjs` reads it and, using the already-authenticated `gh` CLI (no tokens in the script), detects the repository and Project owner, creates or reuses the Project fields (reconfiguring the existing `Status` field's options; reusing `Parent issue`, `Sub-issue progress`, `Start date`, and `Target date` as-is; renaming `Estimate` to `Estimated effort`; leaving `Priority` and `Size` untouched; creating the nine new fields), creates or reuses the approved labels, creates or updates Issues keyed by their stable manifest id (stored as an HTML comment marker at the top of the Issue body, so a re-run finds and updates the same Issue instead of duplicating it — an Issue is never identified by title alone when the stable id is available), renders every Issue body deterministically from the manifest, adds Issues to the Project, sets their field values, creates the native parent/sub-issue relationships, and creates only the catalogue's Hard dependencies as native blocking relationships (Related work stays Issue text). It detects and reports duplicates, and never duplicates content on a re-run.

```bash
cd .github/roadmap
npm install
node sync-project.mjs              # no flags => dry-run by default (safety net)
node sync-project.mjs --dry-run    # explicit: prints the plan only, zero mutating calls
node sync-project.mjs --live       # real execution (requires the explicit --live flag)
```

The dry-run makes zero write requests: it does not create, update, close, reopen, label, assign, relate, or add any real GitHub object — it only reads current state and prints a full plan grouped by category with counts.

### Manual Project views

GitHub's public GraphQL API does not expose any mutation to create or modify a Projects v2 view (confirmed by schema introspection on 25 July 2026: no `createProjectV2View` or equivalent exists). The ten views this roadmap requires — General Kanban, Open Source & Self-Hosting, Product, Current Prototype, Open Source Scope, Decisions & Research, Blocked, Security, Active Work, and Timeline Roadmap — are therefore documented with exact manual steps in **[`.github/roadmap/VIEWS-MANUAL-SETUP.md`](./roadmap/VIEWS-MANUAL-SETUP.md)**, not silently omitted. `sync-project.mjs` does guarantee that every field and label those views filter or group by actually exists and is correctly configured.

### Native sub-issue and dependency relationships

Unlike views, native sub-issue hierarchy (`addSubIssue` / `removeSubIssue` / `reprioritizeSubIssue`, and the `Issue.parent` / `Issue.subIssues` fields) and native Issue dependencies (`addBlockedBy` / `removeBlockedBy`, and `Issue.blockedBy` / `Issue.blocking`) **are** available in this account's GraphQL API (confirmed by introspection on 25 July 2026). `sync-project.mjs` uses them directly; no manual process is needed for either.

### Current public roadmap state

The Project contains the 154-item roadmap (16 Epics and 138 tasks), with its fields, field values, labels, parent/sub-issue relationships, hard dependencies, and public chronological identifiers (`E01`–`E16` / `T001`–`T138`) in place. `sync-project.mjs` remains idempotent and defaults to `--dry-run`; re-running it updates existing Issues by their stable internal key and never creates a duplicate.
