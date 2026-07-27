# Project views — exact manual steps

**Why this document exists**: GitHub's public GraphQL API (v4, the same one `gh api graphql` uses) does not expose, as of 25 July 2026, any mutation to create or modify a Projects v2 view (`createProjectV2View` or an equivalent does not exist in the schema — confirmed by introspection: `gh api graphql -f query='{ __type(name: "Mutation") { fields { name } } }'` returns nothing view-related). `sync-project.mjs` therefore **cannot create these views**; it only guarantees that the fields they filter or group by exist and are correctly configured. All ten views below must be created once, by hand.

Prerequisite: `sync-project.mjs --live` (or equivalent manual setup) has already run at least once, so that `Status`, `Roadmap`, `Type`, `Area`, `Phase`, `Open Source milestone`, `Priority level`, `Risk`, `Roadmap ID`, and `Chronological order` exist on the Project. GitHub's built-in `Priority` field is intentionally **not** shown in any of these views.

Every view below displays `Roadmap ID` and sorts by `Chronological order` ascending — as the primary sort where the view has no other required grouping, or as the sort applied inside each group where the view groups by `Status` or `Open Source milestone`. `Chronological order` reflects the approved roadmap sequence (Current Prototype, then Stabilisation, then Open Source H1–H6, then Product PR1–PR8) — it is not a priority, status, or completion signal, and grouping/filtering by `Status` or any other field is never replaced by it.

General steps to create any new Projects v2 view:

1. Open <https://github.com/users/sentirella/projects/2>.
2. Click the **+** button next to the last view tab (above the board).
3. Choose the view type (**Board**, **Table**, or **Roadmap**).
4. Rename the view (double-click the tab name, or **···** menu → **Rename view**).
5. Set grouping: **···** menu → **Group by** → choose the field.
6. Set the filter: use the filter/search box at the top of the view; enter the filter expression given below (Projects v2 filter syntax, e.g. `roadmap:"Product"`).
7. Set sorting: **···** menu → **Sort by**.
8. Set visible columns (Table views only): **···** menu → **Fields** → check/uncheck.
9. Save: Projects v2 views save automatically as they are configured.

Below is the exact configuration for each of the ten required views, in the order given by the specification.

## 1. General Kanban

- Type: **Board**
- Group by: `Status`
- Sort within each Status column by: `Chronological order` ascending
- Filter: none
- Show on cards: `Roadmap ID`, `Priority level`, `Roadmap`, `Area`, `Open Source milestone` (**···** → **Fields** → check these five in addition to whatever is already visible).

## 2. Open Source & Self-Hosting

- Type: **Board**
- Filter: `roadmap:"Open Source & Self-Hosting", roadmap:"Shared"` (Projects v2 treats several values of the same field, comma-separated inside the filter, as OR; if the exact syntax differs at the time of setup, replicate manually with whatever OR operator the interface offers).
- Group by: `Status`
- Sort within each Status column by: `Chronological order` ascending
- Show on cards: `Roadmap ID`

## 3. Product

- Type: **Board**
- Filter: `roadmap:"Product", roadmap:"Shared"`
- Group by: `Status`
- Sort within each Status column by: `Chronological order` ascending
- Show on cards: `Roadmap ID`

## 4. Current Prototype

- Type: **Table**
- Filter: `phase:"Existing Prototype"`
- Sort by: `Chronological order` ascending
- Columns to show: `Roadmap ID`, `Status`, the `current-dependency` label, the `requires-adaptation` label, and `Evidence`. The linked future adaptation work (the Issue's Related work section) is not a Project column — Projects v2 cannot surface a value from inside an Issue body as a column — so it is checked by opening the Issue.

## 5. Open Source Scope

- Type: **Board**
- Filter: `phase:"Open Source Scope"`
- Group by: `Open Source milestone`
- Sort by: `Chronological order` ascending first, then `Status`, then `Priority level` (**···** → **Sort by** supports a primary sort; for secondary criteria, use whatever secondary-sort control the interface offers at setup time, or sort manually within each group). `Chronological order` ascending naturally preserves the approved milestone grouping (H1 before H2 before H3, and so on), so it never conflicts with the milestone grouping.
- Show on cards: `Roadmap ID`

## 6. Decisions & Research

- Type: **Board**
- Filter: `type:"Decision", type:"Research"`
- Group by: `Status`
- Sort within each Status column by: `Chronological order` ascending
- Show on cards: `Roadmap ID`

## 7. Blocked

- Type: **Table**
- Filter: `status:"Blocked"`
- Sort by: `Chronological order` ascending
- Columns to show: `Roadmap ID`. To see exactly which dependency is preventing progress on a given Issue: open the Issue and check the **Blocked by** section in the right-hand sidebar (populated automatically by the native dependencies that `sync-project.mjs` creates via the API).

## 8. Security

- Type: **Board**
- Filter: `area:"Cryptography", area:"Security", label:"security-critical"`
- Group by: `Status`
- Sort within each Status column by: `Chronological order` ascending
- Show on cards: `Roadmap ID`

## 9. Active Work

- Type: **Board**
- Filter: `status:"In progress", status:"In review"`
- Group by: `Status`
- Sort within each Status column by: `Chronological order` ascending
- Show on cards: `Roadmap ID`

## 10. Timeline Roadmap

- Type: **Roadmap** (timeline layout)
- Filter: none
- Dates: **leave unconfigured**. Do not assign `Start date` / `Target date` to any Issue until real dates exist. The specification explicitly prohibits inventing dates; this view is prepared but left empty until the project owner approves real dates.
- Until real dates exist, use `Chronological order` (visible as `Roadmap ID` on cards/rows) as a reference-only stand-in for reading the approved sequence — it is not a substitute for real Start/Target dates and must not be treated as one.

---

If GitHub later adds a GraphQL mutation for Projects v2 views, `sync-project.mjs` should be updated to create them automatically, and this document would become a historical reference only.
