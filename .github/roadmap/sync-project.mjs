#!/usr/bin/env node
/**
 * sync-project.mjs
 *
 * Synchronises .github/roadmap/sentirella-kanban.yaml (the single source of
 * truth) with the sentirella/sentirella GitHub Project and Issues:
 *   - creates or reuses the Project's custom fields (reconfigures the
 *     existing Status field's options; reuses Parent issue, Sub-issue
 *     progress, Start date and Target date as-is; renames Estimate to
 *     Estimated effort; leaves Priority and Size untouched and unused;
 *     creates the nine new fields)
 *   - creates or reuses the approved repository labels
 *   - creates or updates Issues, identified by a stable manifest id stored
 *     as an HTML comment marker at the top of the Issue body (an Issue is
 *     never identified by title alone when the stable id is available)
 *   - renders every Issue body deterministically from the manifest (the
 *     manifest already stores the fully rendered body text -- this script
 *     never generates prose of its own)
 *   - adds Issues to the Project and sets their field values
 *   - creates native parent/sub-issue relationships
 *   - creates only the manifest's Hard dependencies as native GitHub
 *     blocking relationships (Related work stays Issue text, never a
 *     native dependency)
 *   - never duplicates content on a re-run
 *
 * No tokens are hard-coded: everything goes through the already
 * authenticated `gh` CLI.
 *
 * Default mode: DRY-RUN. With no flags, or with --dry-run, this script only
 * issues READ calls (to compare the manifest against live state) and prints
 * the full plan of what it would create or reuse, grouped by category with
 * counts. ZERO mutating calls are made.
 *
 * A live run requires the explicit --live flag.
 *
 * Usage:
 *   node sync-project.mjs              # dry-run (default, safety net)
 *   node sync-project.mjs --dry-run    # explicit dry-run
 *   node sync-project.mjs --live       # real execution, with mutations
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, 'sentirella-kanban.yaml');
const MARKER_PREFIX = '<!-- sentirella-roadmap-key: ';
const MARKER_SUFFIX = ' -->';
// Legacy marker used before the chronological-ID migration. Kept as a
// second identification tier (more reliable than title parsing) so
// already-live Issues that have not yet been rewritten with the new
// marker are still matched correctly and never duplicated.
const LEGACY_MARKER_PREFIX = '<!-- sentirella-roadmap-id: ';
const LEGACY_MARKER_SUFFIX = ' -->';

// ---------------------------------------------------------------------
// CLI flags -- safety net: default is ALWAYS dry-run unless --live is given.
// ---------------------------------------------------------------------
const argv = process.argv.slice(2);
const LIVE = argv.includes('--live');
const explicitDryRun = argv.includes('--dry-run');
if (!LIVE && !explicitDryRun && argv.length > 0 && !argv.every((a) => a.startsWith('--'))) {
  console.error('Unrecognised argument. Usage: node sync-project.mjs [--dry-run|--live]');
  process.exit(1);
}
const MODE = LIVE ? 'LIVE (mutating the real repo/Project)' : 'DRY-RUN (read-only, no changes)';

// ---------------------------------------------------------------------
// gh CLI helpers
// ---------------------------------------------------------------------
function gh(args, { allowFail = false } = {}) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    if (allowFail) return null;
    throw new Error(`gh ${args.join(' ')} failed: ${err.message}`);
  }
}
function ghJSON(args, opts) {
  const out = gh(args, opts);
  if (out == null) return null;
  return JSON.parse(out);
}
function ghGraphQL(query, vars = {}) {
  // Send the request body as raw JSON via stdin instead of -f/-F key=value
  // pairs: gh's -f/-F flags only reliably type strings, booleans, null and
  // integers, so any variable that is an array or object (e.g. the
  // ProjectV2SingleSelectFieldOptionInput list used for field options) gets
  // mis-typed and rejected by the GraphQL server. Building and posting the
  // full {query, variables} JSON ourselves avoids that entirely.
  const body = JSON.stringify({ query, variables: vars });
  let out;
  try {
    out = execFileSync('gh', ['api', 'graphql', '--input', '-'], { input: body, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    throw new Error(`gh api graphql failed: ${err.message}`);
  }
  return JSON.parse(out);
}

// ---------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------
function loadManifest() {
  return yaml.load(readFileSync(MANIFEST_PATH, 'utf8'));
}
function extractMarkerValue(body, prefix, suffix) {
  if (!body) return null;
  const idx = body.indexOf(prefix);
  if (idx === -1) return null;
  const start = idx + prefix.length;
  const end = body.indexOf(suffix, start);
  if (end === -1) return null;
  return body.slice(start, end).trim();
}
function extractTitlePrefixKey(title) {
  // Fallback used only to locate Issues from before the chronological-ID
  // migration, whose title still starts with the old internal-key prefix,
  // e.g. "[P0-01] ..." or "[EPIC-P0] ...". Never used once an Issue has a
  // hidden marker (new or legacy).
  if (!title) return null;
  const m = title.match(/^\[([A-Z0-9-]+)\]/);
  return m ? m[1] : null;
}
function extractId(body, title) {
  return (
    extractMarkerValue(body, MARKER_PREFIX, MARKER_SUFFIX) ||
    extractMarkerValue(body, LEGACY_MARKER_PREFIX, LEGACY_MARKER_SUFFIX) ||
    extractTitlePrefixKey(title)
  );
}
function allManifestItems(manifest) {
  return [...manifest.epics.map((e) => ({ ...e, isEpic: true })), ...manifest.issues.map((i) => ({ ...i, isEpic: false }))];
}

// ---------------------------------------------------------------------
// Read current live state (READ-ONLY -- safe in both modes)
// ---------------------------------------------------------------------
function getRepoInfo(manifest) {
  const info = ghJSON(['repo', 'view', `${manifest._meta.repo_owner}/${manifest._meta.repo_name}`, '--json', 'nameWithOwner,url,id'], { allowFail: true });
  return info || { nameWithOwner: `${manifest._meta.repo_owner}/${manifest._meta.repo_name}`, url: manifest._meta.repo_url, id: null };
}
function getExistingLabels(repoFull) {
  return ghJSON(['label', 'list', '--repo', repoFull, '--json', 'name,color,description', '--limit', '200'], { allowFail: true }) || [];
}
function getProjectFields(owner, number) {
  const out = ghJSON(['project', 'field-list', String(number), '--owner', owner, '--format', 'json'], { allowFail: true });
  return out ? out.fields : [];
}
function getProjectInfo(owner, number) {
  return ghJSON(['project', 'view', String(number), '--owner', owner, '--format', 'json'], { allowFail: true });
}
function getExistingIssues(repoFull) {
  const out = ghJSON(['issue', 'list', '--repo', repoFull, '--state', 'all', '--json', 'number,title,body,url,state,labels', '--limit', '500'], { allowFail: true });
  const map = new Map();
  for (const issue of out || []) {
    const id = extractId(issue.body, issue.title);
    if (id) map.set(id, issue);
    const roadmapId = extractTitlePrefixKey(issue.title);
    if (roadmapId) map.set(roadmapId, issue);
  }
  return map;
}
function getExistingProjectItems(owner, number) {
  const out = ghJSON(['project', 'item-list', String(number), '--owner', owner, '--format', 'json', '--limit', '500'], { allowFail: true });
  return out ? out.items : [];
}

// ---------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------
function planFields(manifest, existingFields) {
  const byName = new Map(existingFields.map((f) => [f.name, f]));
  const plan = { create: [], reuseAsIs: [], rename: [], statusRedefine: null, alreadyActive: [], notUsed: manifest.fields.not_used.map((f) => f.name) };
  const sf = manifest.fields.status_field;
  plan.statusRedefine = { name: sf.name, options: sf.options, existing: byName.has(sf.name) };
  for (const f of manifest.fields.reuse) {
    if (f.action === 'none_already_active') plan.alreadyActive.push(f.name);
    else if (f.action === 'rename') plan.rename.push({ from: f.name, to: f.rename_to, existing: byName.has(f.name) });
    else plan.reuseAsIs.push(f.name);
  }
  for (const f of manifest.fields.create) {
    if (byName.has(f.name)) plan.reuseAsIs.push(f.name);
    else plan.create.push(f);
  }
  return plan;
}
function planLabels(manifest, existingLabels) {
  const existingNames = new Set(existingLabels.map((l) => l.name));
  const plan = { create: [], reuse: [] };
  for (const l of manifest.labels) {
    if (existingNames.has(l.name)) plan.reuse.push(l.name);
    else plan.create.push(l);
  }
  return plan;
}
function planIssues(manifest, existingIssuesById) {
  const items = allManifestItems(manifest);
  const plan = { create: [], update: [] };
  for (const item of items) {
    if (existingIssuesById.has(item.id)) plan.update.push(item.id);
    else plan.create.push(item.id);
  }
  return plan;
}
function planProjectItems(manifest, existingIssuesById, existingProjectItems) {
  const existingUrls = new Set(existingProjectItems.map((i) => i.content && i.content.url).filter(Boolean));
  const items = allManifestItems(manifest);
  const plan = { add: [], already: [] };
  for (const item of items) {
    const existingIssue = existingIssuesById.get(item.id);
    if (existingIssue && existingUrls.has(existingIssue.url)) plan.already.push(item.id);
    else plan.add.push(item.id);
  }
  return plan;
}

// ---------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------
function printPlan({ manifest, repoInfo, projectInfo, fieldsPlan, labelsPlan, issuesPlan, itemsPlan }) {
  const line = (s = '') => console.log(s);
  line('='.repeat(78));
  line(`  Sentirella -- roadmap synchronisation (${MODE})`);
  line('='.repeat(78));
  line(`Repository: ${repoInfo.nameWithOwner} (${repoInfo.url})`);
  line(`Project: owner=${manifest._meta.project_owner} number=${manifest._meta.project_number} ${manifest._meta.project_url}`);
  line(projectInfo ? `Project detected: "${projectInfo.title || '(untitled)'}" -- ${projectInfo.items ? projectInfo.items.totalCount : '?'} current items` : 'Project: could not be read (check gh permissions/authentication).');
  line('');

  line('--- Project fields ---');
  line(`  Status field: reuse and redefine options to [${fieldsPlan.statusRedefine.options.join(', ')}] (field ${fieldsPlan.statusRedefine.existing ? 'exists' : 'NOT FOUND'})`);
  line(`  To create (${fieldsPlan.create.length}): ${fieldsPlan.create.map((f) => f.name).join(', ') || '(none)'}`);
  line(`  To reuse as-is (${fieldsPlan.reuseAsIs.length}): ${fieldsPlan.reuseAsIs.join(', ') || '(none)'}`);
  line(`  To rename (${fieldsPlan.rename.length}): ${fieldsPlan.rename.map((r) => `${r.from} -> ${r.to}`).join(', ') || '(none)'}`);
  line(`  Already active, no action (${fieldsPlan.alreadyActive.length}): ${fieldsPlan.alreadyActive.join(', ') || '(none)'}`);
  line(`  Not used by this spec (${fieldsPlan.notUsed.length}): ${fieldsPlan.notUsed.join(', ') || '(none)'}`);
  line('');

  line('--- Labels ---');
  line(`  To create (${labelsPlan.create.length}): ${labelsPlan.create.map((l) => l.name).join(', ')}`);
  line(`  To reuse (${labelsPlan.reuse.length}): ${labelsPlan.reuse.join(', ') || '(none)'}`);
  line('');

  line('--- Issues (Epics + Issues in the manifest) ---');
  line(`  Epics in the manifest: ${manifest.epics.length}`);
  line(`  Non-Epic Issues in the manifest: ${manifest.issues.length}`);
  line(`  Total items to audit: ${manifest.epics.length + manifest.issues.length}`);
  line(`  To create (${issuesPlan.create.length})`);
  line(`  To update / reused by stable id (${issuesPlan.update.length})`);
  line(`  Merged, NOT created as an independent Issue (${manifest.merged_issues.length}): ${manifest.merged_issues.map((m) => `${m.id}->${m.mergedInto}`).join(', ')}`);
  line('');

  line('--- Project items ---');
  line(`  To add to the Project (${itemsPlan.add.length})`);
  line(`  Already present in the Project (${itemsPlan.already.length})`);
  line('');

  line('--- Native parent / sub-issue relationships ---');
  line(`  Relationships to create/verify: ${manifest.parent_relationships.length}`);
  line('');

  line('--- Native dependencies (blocked by) ---');
  line(`  Hard dependencies to create/verify: ${manifest.dependencies.length}`);
  line('');

  line('--- Project views ---');
  line(`  Views required by the spec: ${manifest.views.length}`);
  line('  createProjectV2View does not exist in the public API (confirmed by introspection) => none can be created via the API.');
  line('  Exact manual steps documented in .github/roadmap/VIEWS-MANUAL-SETUP.md');
  line('');

  line('='.repeat(78));
  if (!LIVE) {
    line('DRY-RUN: no mutating call was made. Nothing has been created, updated, or');
    line('modified in the repository, the Project, the Issues, or the labels.');
    line('To execute for real: node sync-project.mjs --live');
  } else {
    line('LIVE mode: see the execution report below.');
  }
  line('='.repeat(78));
}

// ---------------------------------------------------------------------
// LIVE mutations (never called in dry-run mode)
// ---------------------------------------------------------------------
function liveCreateLabels(repoFull, toCreate, report) {
  for (const l of toCreate) {
    try {
      gh(['label', 'create', l.name, '--repo', repoFull, '--color', l.color, '--force']);
      report.labelsCreated.push(l.name);
    } catch (err) {
      report.errors.push(`label ${l.name}: ${err.message}`);
    }
  }
}
function liveEnsureFields(projectNodeId, manifest, existingFields, report) {
  const byName = new Map(existingFields.map((f) => [f.name, f]));
  for (const f of manifest.fields.create) {
    if (byName.has(f.name)) { report.fieldsReused.push(f.name); continue; }
    try {
      const dataType = f.type === 'single_select' ? 'SINGLE_SELECT' : f.type === 'text' ? 'TEXT' : f.type === 'number' ? 'NUMBER' : 'TEXT';
      const query = `mutation($projectId:ID!,$name:String!,$dataType:ProjectV2CustomFieldType!,$options:[ProjectV2SingleSelectFieldOptionInput!]) {
        createProjectV2Field(input:{projectId:$projectId,name:$name,dataType:$dataType,singleSelectOptions:$options}) {
          projectV2Field { ... on ProjectV2SingleSelectField { id name } ... on ProjectV2Field { id name } }
        }
      }`;
      const vars = { projectId: projectNodeId, name: f.name, dataType };
      if (f.options) vars.options = f.options.map((o) => ({ name: o, color: 'GRAY', description: '' }));
      ghGraphQL(query, vars);
      report.fieldsCreated.push(f.name);
    } catch (err) {
      report.errors.push(`field ${f.name}: ${err.message}`);
    }
  }
  const statusField = byName.get(manifest.fields.status_field.name);
  if (statusField) {
    const currentOptions = (statusField.options || []).map((o) => o.name);
    const expectedOptions = manifest.fields.status_field.options;
    if (JSON.stringify(currentOptions) === JSON.stringify(expectedOptions)) {
      report.fieldsReused.push('Status');
    } else {
    try {
      const query = `mutation($fieldId:ID!,$options:[ProjectV2SingleSelectFieldOptionInput!]) {
        updateProjectV2Field(input:{fieldId:$fieldId,singleSelectOptions:$options}) {
          projectV2Field { ... on ProjectV2SingleSelectField { id name } }
        }
      }`;
      ghGraphQL(query, { fieldId: statusField.id, options: manifest.fields.status_field.options.map((o) => ({ name: o, color: 'GRAY', description: '' })) });
      report.fieldsRedefined.push('Status');
    } catch (err) {
      report.errors.push(`redefine Status options: ${err.message}`);
    }
    }
  } else {
    report.errors.push('Status field not found -- cannot redefine its options.');
  }
  for (const f of manifest.fields.reuse) {
    if (f.action === 'none_already_active') { report.fieldsUnchanged.push(f.name); continue; }
    if (f.action === 'reuse_as_is') { report.fieldsReused.push(f.name); continue; }
    if (f.action === 'rename') {
      const existing = byName.get(f.name);
      if (!existing && byName.has(f.rename_to)) {
        report.fieldsReused.push(f.rename_to);
        continue;
      }
      if (!existing) { report.errors.push(`rename field ${f.name}: not found`); continue; }
      try {
        ghGraphQL(`mutation($fieldId:ID!,$name:String!){ updateProjectV2Field(input:{fieldId:$fieldId,name:$name}){ projectV2Field { ... on ProjectV2Field { id name } } } }`,
          { fieldId: existing.id, name: f.rename_to });
        report.fieldsRenamed.push(`${f.name} -> ${f.rename_to}`);
      } catch (err) {
        report.errors.push(`rename field ${f.name}: ${err.message}`);
      }
    }
  }
}
function liveCreateOrUpdateIssue(repoFull, item, existingIssuesById, managedLabelNames, report) {
  const bodyText = item.body; // already deterministically rendered in the manifest
  const labels = item.labels || [];
  const existing = existingIssuesById.get(item.id);
  if (existing) {
    const currentLabels = new Set((existing.labels || []).map((label) => typeof label === 'string' ? label : label.name));
    const desiredLabels = new Set(labels);
    const labelsToAdd = labels.filter((label) => !currentLabels.has(label));
    const labelsToRemove = [...currentLabels].filter((label) => managedLabelNames.has(label) && !desiredLabels.has(label));
    const contentChanged = existing.title !== item.title || existing.body !== bodyText;
    if (!contentChanged && labelsToAdd.length === 0 && labelsToRemove.length === 0) {
      report.issuesUpdated.push(`${item.id} (unchanged)`);
      return existing;
    }
    try {
      const args = ['issue', 'edit', String(existing.number), '--repo', repoFull];
      if (contentChanged) args.push('--body', bodyText, '--title', item.title);
      for (const label of labelsToAdd) args.push('--add-label', label);
      for (const label of labelsToRemove) args.push('--remove-label', label);
      gh(args);
      report.issuesUpdated.push(item.id);
      return { ...existing, title: item.title, body: bodyText, labels: labels.map((name) => ({ name })) };
    } catch (err) {
      report.errors.push(`update issue ${item.id}: ${err.message}`);
      return existing;
    }
  }
  try {
    const args = ['issue', 'create', '--repo', repoFull, '--title', item.title, '--body', bodyText];
    for (const l of labels) args.push('--label', l);
    const out = gh(args).trim();
    report.issuesCreated.push(item.id);
    const number = out.split('/').pop();
    return { number, url: out, title: item.title, body: bodyText };
  } catch (err) {
    report.errors.push(`create issue ${item.id}: ${err.message}`);
    return null;
  }
}
function liveAddToProject(owner, number, issueUrl, report, id) {
  try {
    gh(['project', 'item-add', String(number), '--owner', owner, '--url', issueUrl]);
    report.projectItemsAdded.push(id);
  } catch (err) {
    report.errors.push(`add to project ${id}: ${err.message}`);
  }
}
function existingProjectFieldValue(projectItem, fieldName) {
  const target = fieldName.toLowerCase();
  for (const [key, value] of Object.entries(projectItem || {})) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}
function liveAddSubIssue(parentIssueNodeId, childIssueNodeId, report, label) {
  try {
    ghGraphQL(`mutation($issueId:ID!,$subIssueId:ID!){ addSubIssue(input:{issueId:$issueId,subIssueId:$subIssueId}){ issue { id } } }`,
      { issueId: parentIssueNodeId, subIssueId: childIssueNodeId });
    report.subIssuesLinked.push(label);
  } catch (err) {
    report.errors.push(`sub-issue ${label}: ${err.message}`);
  }
}
function liveAddBlockedBy(blockedIssueNodeId, blockingIssueNodeId, report, label) {
  try {
    ghGraphQL(`mutation($issueId:ID!,$blockingIssueId:ID!){ addBlockedBy(input:{issueId:$issueId,blockingIssueId:$blockingIssueId}){ issue { id } } }`,
      { issueId: blockedIssueNodeId, blockingIssueId: blockingIssueNodeId });
    report.dependenciesLinked.push(label);
  } catch (err) {
    report.errors.push(`dependency ${label}: ${err.message}`);
  }
}
function liveRemoveSubIssue(parentIssueNodeId, childIssueNodeId, report, label) {
  try {
    ghGraphQL(`mutation($issueId:ID!,$subIssueId:ID!){ removeSubIssue(input:{issueId:$issueId,subIssueId:$subIssueId}){ issue { id } } }`,
      { issueId: parentIssueNodeId, subIssueId: childIssueNodeId });
    report.subIssuesRemoved.push(label);
  } catch (err) {
    report.errors.push(`remove sub-issue ${label}: ${err.message}`);
  }
}
function liveRemoveBlockedBy(blockedIssueNodeId, blockingIssueNodeId, report, label) {
  try {
    ghGraphQL(`mutation($issueId:ID!,$blockingIssueId:ID!){ removeBlockedBy(input:{issueId:$issueId,blockingIssueId:$blockingIssueId}){ issue { id } } }`,
      { issueId: blockedIssueNodeId, blockingIssueId: blockingIssueNodeId });
    report.dependenciesRemoved.push(label);
  } catch (err) {
    report.errors.push(`remove dependency ${label}: ${err.message}`);
  }
}
const SINGLE_SELECT_FIELD_MAP = [
  ['status', 'Status'],
  ['roadmap', 'Roadmap'],
  ['type', 'Type'],
  ['area', 'Area'],
  ['phase', 'Phase'],
  ['open_source_milestone', 'Open Source milestone'],
  ['priority_level', 'Priority level'],
  ['risk', 'Risk'],
];
const TEXT_FIELD_MAP = [['roadmap_id', 'Roadmap ID']];
const NUMBER_FIELD_MAP = [['chronological_order', 'Chronological order']];
function liveSetFieldValue(projectId, itemId, fieldId, valueKind, value, report, label) {
  // valueKind selects which ProjectV2FieldValue sub-field is populated:
  // 'singleSelectOptionId' | 'text' | 'number'.
  try {
    ghGraphQL(
      `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$value:ProjectV2FieldValue!){
        updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:$value}){
          projectV2Item { id }
        }
      }`,
      { projectId, itemId, fieldId, value: { [valueKind]: value } },
    );
    report.fieldValuesSet.push(label);
  } catch (err) {
    report.errors.push(`field value ${label}: ${err.message}`);
  }
}
function getIssueNodeId(repoFull, number) {
  // Do not use --jq here: for a scalar result gh prints the raw unquoted
  // string (not valid JSON), which broke JSON.parse in ghJSON. Fetch the
  // full JSON object instead and read .node_id from the parsed result.
  const out = ghJSON(['api', `repos/${repoFull}/issues/${number}`], { allowFail: true });
  return out ? out.node_id : null;
}
function getIssueState(repoFull, number) {
  const out = ghJSON(['api', `repos/${repoFull}/issues/${number}`], { allowFail: true });
  return out ? out.state : null;
}
// Reads every existing sub-issue and blocked-by pair (by native Issue
// number) in one paginated pass, so an already-idempotent re-run can skip
// relationships/dependencies that were already wired up on a previous run
// instead of re-attempting (and paying GraphQL quota for) all of them.
function getExistingRelationshipSets(repoOwner, repoName) {
  const subIssuePairs = new Set(); // `${parentNumber}->${childNumber}`
  const blockedByPairs = new Set(); // `${blockingNumber}->${blockedNumber}`
  let cursor = null;
  let hasNext = true;
  while (hasNext) {
    const res = ghGraphQL(
      `query($owner:String!,$repo:String!,$cursor:String){
        repository(owner:$owner,name:$repo){
          issues(first:50, after:$cursor){
            nodes { number subIssues(first:50){ nodes { number } } blockedBy(first:50){ nodes { number } } }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { owner: repoOwner, repo: repoName, cursor },
    );
    const conn = res.data.repository.issues;
    for (const n of conn.nodes) {
      for (const s of (n.subIssues && n.subIssues.nodes) || []) subIssuePairs.add(`${n.number}->${s.number}`);
      for (const b of (n.blockedBy && n.blockedBy.nodes) || []) blockedByPairs.add(`${b.number}->${n.number}`);
    }
    hasNext = conn.pageInfo.hasNextPage;
    cursor = conn.pageInfo.endCursor;
  }
  return { subIssuePairs, blockedByPairs };
}
function liveEnsureProject(projectInfo, manifest, report) {
  try {
    ghGraphQL(
      `mutation($projectId:ID!,$title:String!,$description:String!){
        updateProjectV2(input:{projectId:$projectId,title:$title,shortDescription:$description}){
          projectV2 { id title shortDescription }
        }
      }`,
      { projectId: projectInfo.id, title: manifest._meta.project_name, description: manifest._meta.project_description },
    );
    report.projectRenamed = true;
  } catch (err) {
    report.errors.push(`rename/describe project: ${err.message}`);
  }
}
function liveCloseIssue(repoFull, number, report, label) {
  try {
    gh(['issue', 'close', String(number), '--repo', repoFull]);
    report.issuesClosed.push(label);
  } catch (err) {
    report.errors.push(`close issue ${label}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------
function main() {
  const manifest = loadManifest();
  const repoFull = `${manifest._meta.repo_owner}/${manifest._meta.repo_name}`;

  console.log(`Loading manifest: ${MANIFEST_PATH}`);
  console.log(`Mode: ${MODE}`);
  console.log('');

  const repoInfo = getRepoInfo(manifest);
  const projectInfo = getProjectInfo(manifest._meta.project_owner, manifest._meta.project_number);
  const existingLabels = getExistingLabels(repoFull);
  const existingFields = getProjectFields(manifest._meta.project_owner, manifest._meta.project_number);
  const existingIssuesById = getExistingIssues(repoFull);
  for (const item of allManifestItems(manifest)) {
    const issueByRoadmapId = existingIssuesById.get(item.roadmap_id);
    if (issueByRoadmapId) existingIssuesById.set(item.id, issueByRoadmapId);
  }
  const existingProjectItems = getExistingProjectItems(manifest._meta.project_owner, manifest._meta.project_number);

  const fieldsPlan = planFields(manifest, existingFields);
  const labelsPlan = planLabels(manifest, existingLabels);
  const issuesPlan = planIssues(manifest, existingIssuesById);
  const itemsPlan = planProjectItems(manifest, existingIssuesById, existingProjectItems);

  printPlan({ manifest, repoInfo, projectInfo, fieldsPlan, labelsPlan, issuesPlan, itemsPlan });

  if (!LIVE) process.exit(0);

  // ---------------- LIVE EXECUTION ----------------
  console.log('\nStarting LIVE execution...\n');
  const report = {
    labelsCreated: [], fieldsCreated: [], fieldsRenamed: [], fieldsRedefined: [], fieldsReused: [], fieldsUnchanged: [],
    issuesCreated: [], issuesUpdated: [], projectItemsAdded: [], fieldValuesSet: [],
    subIssuesLinked: [], subIssuesRemoved: [], dependenciesLinked: [], dependenciesRemoved: [],
    issuesClosed: [], projectRenamed: false,
    errors: [],
  };

  if (!projectInfo || !projectInfo.id) {
    console.error('Could not obtain the Project node id; aborting LIVE execution.');
    process.exit(1);
  }

  function printReport() {
    console.log('\n' + '='.repeat(78));
    console.log('  LIVE EXECUTION REPORT');
    console.log('='.repeat(78));
    console.log(`Labels created: ${report.labelsCreated.length}`);
    console.log(`Fields created: ${report.fieldsCreated.length}`);
    console.log(`Fields renamed: ${report.fieldsRenamed.length}`);
    console.log(`Status options redefined: ${report.fieldsRedefined.length}`);
    console.log(`Issues created: ${report.issuesCreated.length}`);
    console.log(`Issues updated (reused by stable id): ${report.issuesUpdated.length}`);
    console.log(`Project items added: ${report.projectItemsAdded.length}`);
    console.log(`Item field values set: ${report.fieldValuesSet.length}`);
    console.log(`Sub-issue relationships created/verified: ${report.subIssuesLinked.length}`);
    console.log(`Obsolete sub-issue relationships removed: ${report.subIssuesRemoved.length}`);
    console.log(`Native dependencies created/verified: ${report.dependenciesLinked.length}`);
    console.log(`Obsolete native dependencies removed: ${report.dependenciesRemoved.length}`);
    console.log(`Project renamed/described: ${report.projectRenamed}`);
    console.log(`Issues closed: ${report.issuesClosed.length}`);
    console.log(`Errors / limitations: ${report.errors.length}`);
    for (const e of report.errors) console.log(`  - ${e}`);
    console.log('='.repeat(78));
    console.log('Remember: this report must be verified with real read calls (gh issue');
    console.log('list / gh project item-list / gh label list) before it is trusted.');
  }

  try {
    liveEnsureProject(projectInfo, manifest, report);
    console.log(`Project rename/description done (renamed=${report.projectRenamed}).`);

    liveCreateLabels(repoFull, labelsPlan.create, report);
    console.log(`Labels done (${report.labelsCreated.length} created).`);

    liveEnsureFields(projectInfo.id, manifest, existingFields, report);
    console.log(`Fields done (${report.fieldsCreated.length} created, ${report.fieldsRenamed.length} renamed, ${report.fieldsRedefined.length} redefined).`);

    const items = allManifestItems(manifest);
    const resultByIssueId = new Map();
    for (const item of items) {
      const result = liveCreateOrUpdateIssue(
        repoFull,
        item,
        existingIssuesById,
        new Set(manifest.labels.map((label) => label.name)),
        report,
      );
      if (result) resultByIssueId.set(item.id, result);
    }
    console.log(`Issues done (${report.issuesCreated.length} created, ${report.issuesUpdated.length} updated).`);

    const existingProjectUrls = new Set(existingProjectItems.map((it) => it.content && it.content.url).filter(Boolean));
    for (const [id, issue] of resultByIssueId) {
      if (issue.url && !existingProjectUrls.has(issue.url)) {
        liveAddToProject(manifest._meta.project_owner, manifest._meta.project_number, issue.url, report, id);
      }
    }
    console.log(`Project items done (${report.projectItemsAdded.length} added).`);

    // Re-read fields (now that they exist/are redefined) and project items
    // (now that all 154 have been added) so we have real field ids, real
    // single-select option ids, and real project-item ids to write against.
    const freshFields = getProjectFields(manifest._meta.project_owner, manifest._meta.project_number);
    const fieldsByName = new Map();
    for (const f of freshFields) {
      const optionsByName = new Map((f.options || []).map((o) => [o.name, o.id]));
      fieldsByName.set(f.name, { id: f.id, optionsByName });
    }
    const freshProjectItems = getExistingProjectItems(manifest._meta.project_owner, manifest._meta.project_number);
    const itemIdByUrl = new Map(freshProjectItems.map((it) => [it.content && it.content.url, it.id]));

    for (const item of items) {
      const issue = resultByIssueId.get(item.id);
      if (!issue || !issue.url) { report.errors.push(`field values ${item.id}: no created/updated issue on record`); continue; }
      const projectItemId = itemIdByUrl.get(issue.url);
      if (!projectItemId) { report.errors.push(`field values ${item.id}: project item id not found`); continue; }
      for (const [manifestKey, fieldName] of SINGLE_SELECT_FIELD_MAP) {
        const value = item[manifestKey];
        if (value === null || value === undefined) continue;
        if (String(existingProjectFieldValue(freshProjectItems.find((it) => it.id === projectItemId), fieldName) || '') === String(value)) continue;
        const field = fieldsByName.get(fieldName);
        if (!field) { report.errors.push(`field values ${item.id}.${fieldName}: field not found`); continue; }
        const optionId = field.optionsByName.get(value);
        if (!optionId) { report.errors.push(`field values ${item.id}.${fieldName}: option "${value}" not found`); continue; }
        liveSetFieldValue(projectInfo.id, projectItemId, field.id, 'singleSelectOptionId', optionId, report, `${item.id}.${fieldName}=${value}`);
      }
      for (const [manifestKey, fieldName] of TEXT_FIELD_MAP) {
        const value = item[manifestKey];
        if (value === null || value === undefined) continue;
        if (String(existingProjectFieldValue(freshProjectItems.find((it) => it.id === projectItemId), fieldName) || '') === String(value)) continue;
        const field = fieldsByName.get(fieldName);
        if (!field) { report.errors.push(`field values ${item.id}.${fieldName}: field not found`); continue; }
        liveSetFieldValue(projectInfo.id, projectItemId, field.id, 'text', String(value), report, `${item.id}.${fieldName}=${value}`);
      }
      for (const [manifestKey, fieldName] of NUMBER_FIELD_MAP) {
        const value = item[manifestKey];
        if (value === null || value === undefined) continue;
        if (Number(existingProjectFieldValue(freshProjectItems.find((it) => it.id === projectItemId), fieldName)) === Number(value)) continue;
        const field = fieldsByName.get(fieldName);
        if (!field) { report.errors.push(`field values ${item.id}.${fieldName}: field not found`); continue; }
        liveSetFieldValue(projectInfo.id, projectItemId, field.id, 'number', Number(value), report, `${item.id}.${fieldName}=${value}`);
      }
    }
    console.log(`Item field values done (${report.fieldValuesSet.length} set).`);

    // Reconcile native relationships among managed roadmap Issues. This
    // removes obsolete managed edges before adding missing desired edges,
    // while leaving relationships to unmanaged Issues untouched.
    const existingRel = getExistingRelationshipSets(manifest._meta.repo_owner, manifest._meta.repo_name);
    const managedByNumber = new Map(
      [...resultByIssueId.entries()].map(([id, issue]) => [issue.number, { id, issue }]),
    );
    const desiredSubIssuePairs = new Set(manifest.parent_relationships.map((rel) => {
      const parent = resultByIssueId.get(rel.parent);
      const child = resultByIssueId.get(rel.child);
      return parent && child ? `${parent.number}->${child.number}` : null;
    }).filter(Boolean));
    const desiredBlockedByPairs = new Set(manifest.dependencies.map((dep) => {
      const blocking = resultByIssueId.get(dep.blocking);
      const blocked = resultByIssueId.get(dep.blocked);
      return blocking && blocked ? `${blocking.number}->${blocked.number}` : null;
    }).filter(Boolean));

    for (const pair of existingRel.subIssuePairs) {
      const [parentNumber, childNumber] = pair.split('->').map(Number);
      if (!managedByNumber.has(parentNumber) || !managedByNumber.has(childNumber) || desiredSubIssuePairs.has(pair)) continue;
      liveRemoveSubIssue(
        getIssueNodeId(repoFull, parentNumber),
        getIssueNodeId(repoFull, childNumber),
        report,
        `${managedByNumber.get(parentNumber).id}->${managedByNumber.get(childNumber).id}`,
      );
      existingRel.subIssuePairs.delete(pair);
    }
    for (const pair of existingRel.blockedByPairs) {
      const [blockingNumber, blockedNumber] = pair.split('->').map(Number);
      if (!managedByNumber.has(blockingNumber) || !managedByNumber.has(blockedNumber) || desiredBlockedByPairs.has(pair)) continue;
      liveRemoveBlockedBy(
        getIssueNodeId(repoFull, blockedNumber),
        getIssueNodeId(repoFull, blockingNumber),
        report,
        `${managedByNumber.get(blockingNumber).id} blocks ${managedByNumber.get(blockedNumber).id}`,
      );
      existingRel.blockedByPairs.delete(pair);
    }

    for (const rel of manifest.parent_relationships) {
      const parent = resultByIssueId.get(rel.parent);
      const child = resultByIssueId.get(rel.child);
      if (!parent || !child) { report.errors.push(`sub-issue ${rel.parent}->${rel.child}: created issue missing`); continue; }
      if (existingRel.subIssuePairs.has(`${parent.number}->${child.number}`)) {
        report.subIssuesLinked.push(`${rel.parent}->${rel.child} (already linked)`);
        continue;
      }
      const parentNodeId = getIssueNodeId(repoFull, parent.number);
      const childNodeId = getIssueNodeId(repoFull, child.number);
      if (parentNodeId && childNodeId) liveAddSubIssue(parentNodeId, childNodeId, report, `${rel.parent}->${rel.child}`);
    }
    console.log(`Parent/sub-issue relationships done (${report.subIssuesLinked.length} created/verified).`);

    for (const d of manifest.dependencies) {
      const blocking = resultByIssueId.get(d.blocking);
      const blocked = resultByIssueId.get(d.blocked);
      if (!blocking || !blocked) { report.errors.push(`dependency ${d.blocking}->${d.blocked}: created issue missing`); continue; }
      if (existingRel.blockedByPairs.has(`${blocking.number}->${blocked.number}`)) {
        report.dependenciesLinked.push(`${d.blocking} blocks ${d.blocked} (already linked)`);
        continue;
      }
      const blockingNodeId = getIssueNodeId(repoFull, blocking.number);
      const blockedNodeId = getIssueNodeId(repoFull, blocked.number);
      if (blockingNodeId && blockedNodeId) liveAddBlockedBy(blockedNodeId, blockingNodeId, report, `${d.blocking} blocks ${d.blocked}`);
    }
    console.log(`Native dependencies done (${report.dependenciesLinked.length} created/verified).`);

    // Close the 31 Current-Prototype (P0) task Issues and, once all 31 are
    // confirmed closed, close their parent Epic. Nothing outside P0/EPIC-P0
    // is touched here.
    const p0Items = manifest.issues.filter((i) => i.id.startsWith('P0-'));
    for (const item of p0Items) {
      const issue = resultByIssueId.get(item.id);
      if (!issue) { report.errors.push(`close ${item.id}: issue record missing`); continue; }
      const state = getIssueState(repoFull, issue.number);
      if (state === 'closed') { report.issuesClosed.push(`${item.id} (already closed)`); continue; }
      liveCloseIssue(repoFull, issue.number, report, item.id);
    }
    console.log(`P0 task closure done (${report.issuesClosed.length} closed/verified).`);

    const epicP0Issue = resultByIssueId.get('EPIC-P0');
    if (!epicP0Issue) {
      report.errors.push('close EPIC-P0: issue record missing');
    } else {
      const summaryRes = ghGraphQL(
        `query($owner:String!,$repo:String!,$num:Int!){ repository(owner:$owner,name:$repo){ issue(number:$num){ subIssuesSummary { total completed } } } }`,
        { owner: manifest._meta.repo_owner, repo: manifest._meta.repo_name, num: Number(epicP0Issue.number) },
      );
      const summary = summaryRes && summaryRes.data && summaryRes.data.repository.issue.subIssuesSummary;
      if (summary && summary.total === 31 && summary.completed === 31) {
        const state = getIssueState(repoFull, epicP0Issue.number);
        if (state === 'closed') report.issuesClosed.push('EPIC-P0 (already closed)');
        else liveCloseIssue(repoFull, epicP0Issue.number, report, 'EPIC-P0');
      } else {
        report.errors.push(`EPIC-P0 not closed: sub-issue progress ${summary ? `${summary.completed}/${summary.total}` : 'unknown'} (expected 31/31)`);
      }
    }
    console.log(`EPIC-P0 closure check done.`);
  } finally {
    // Always print whatever was accumulated, even if an unexpected error
    // aborts the loop above -- losing the report on a crash made the
    // previous run much harder to diagnose and safely resume.
    printReport();
  }
}

main();
