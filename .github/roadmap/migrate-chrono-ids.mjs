#!/usr/bin/env node
// One-off migration helper: adds chronological public roadmap IDs
// (E01-E16 / T001-T138) to the Sentirella roadmap manifest, exactly per
// the approved roadmap identifier mapping.
//
// Deliberately does NOT parse-then-yaml.dump() the whole 12k-line file --
// that would reformat every line (quoting style, block-scalar handling,
// key order) and produce a huge, unreviewable diff with a real risk of
// silently altering unrelated content. Instead this performs targeted,
// unique string replacements directly on the raw text, so every line that
// isn't part of this specific change is byte-for-byte untouched.
import { readFileSync, writeFileSync } from 'node:fs';
import * as yaml from 'js-yaml';

const MANIFEST_PATH = process.argv[2];
if (!MANIFEST_PATH) { console.error('usage: node migrate-chrono-ids.mjs <path-to-yaml>'); process.exit(1); }

const EPIC_MAP = [
  ['EPIC-P0', 'E01'], ['EPIC-S0', 'E02'], ['EPIC-H1', 'E03'], ['EPIC-H2', 'E04'],
  ['EPIC-H3', 'E05'], ['EPIC-H4', 'E06'], ['EPIC-H5', 'E07'], ['EPIC-H6', 'E08'],
  ['EPIC-PR1', 'E09'], ['EPIC-PR2', 'E10'], ['EPIC-PR3', 'E11'], ['EPIC-PR4', 'E12'],
  ['EPIC-PR5', 'E13'], ['EPIC-PR6', 'E14'], ['EPIC-PR7', 'E15'], ['EPIC-PR8', 'E16'],
];

function range(prefix, from, to, startNum) {
  const out = [];
  for (let i = from; i <= to; i++) out.push([`${prefix}-${String(i).padStart(2, '0')}`, `T${String(startNum + (i - from)).padStart(3, '0')}`]);
  return out;
}

const TASK_MAP = [
  ...range('P0', 1, 31, 1), ...range('S0', 1, 4, 32), ...range('H1', 1, 7, 36),
  ...range('H2', 1, 10, 43), ...range('H3', 1, 8, 53), ...range('H4', 1, 8, 61),
  ...range('H5', 1, 11, 69), ...range('H6', 1, 13, 80),
  ['PR1-01', 'T093'],
  ...range('PR2', 1, 6, 94),
  ['PR3-02', 'T100'],
  ...range('PR4', 1, 7, 101), ...range('PR5', 1, 5, 108), ...range('PR6', 1, 7, 113),
  ...range('PR7', 1, 13, 120), ...range('PR8', 1, 6, 133),
];

const epicRoadmapId = new Map(EPIC_MAP);
const taskRoadmapId = new Map(TASK_MAP);
if (epicRoadmapId.size !== 16) throw new Error(`expected 16 epics, got ${epicRoadmapId.size}`);
if (taskRoadmapId.size !== 138) throw new Error(`expected 138 tasks, got ${taskRoadmapId.size}`);
const allIds = [...epicRoadmapId.values(), ...taskRoadmapId.values()];
if (new Set(allIds).size !== 154) throw new Error('duplicate roadmap ids in mapping tables');

const EPIC_CHILD_RANGES = {
  'EPIC-P0': ['P0-01', 'P0-31'], 'EPIC-S0': ['S0-01', 'S0-04'], 'EPIC-H1': ['H1-01', 'H1-07'],
  'EPIC-H2': ['H2-01', 'H2-10'], 'EPIC-H3': ['H3-01', 'H3-08'], 'EPIC-H4': ['H4-01', 'H4-08'],
  'EPIC-H5': ['H5-01', 'H5-11'], 'EPIC-H6': ['H6-01', 'H6-13'], 'EPIC-PR1': ['PR1-01', 'PR1-01'],
  'EPIC-PR2': ['PR2-01', 'PR2-06'], 'EPIC-PR3': ['PR3-02', 'PR3-02'], 'EPIC-PR4': ['PR4-01', 'PR4-07'],
  'EPIC-PR5': ['PR5-01', 'PR5-05'], 'EPIC-PR6': ['PR6-01', 'PR6-07'], 'EPIC-PR7': ['PR7-01', 'PR7-13'],
  'EPIC-PR8': ['PR8-01', 'PR8-06'],
};

const chronOrder = new Map();
let seq = 0;
for (const [epicKey] of EPIC_MAP) {
  seq += 1;
  chronOrder.set(epicKey, seq);
  const [fromKey, toKey] = EPIC_CHILD_RANGES[epicKey];
  const fromIdx = TASK_MAP.findIndex(([k]) => k === fromKey);
  const toIdx = TASK_MAP.findIndex(([k]) => k === toKey);
  for (let i = fromIdx; i <= toIdx; i++) { seq += 1; chronOrder.set(TASK_MAP[i][0], seq); }
}
if (seq !== 154) throw new Error(`expected final chronological value 154, got ${seq}`);
if (new Set(chronOrder.values()).size !== 154) throw new Error('duplicate chronological order values');

// ---------------------------------------------------------------------
let text = readFileSync(MANIFEST_PATH, 'utf8');
const usesCRLF = text.includes('\r\n');
if (usesCRLF) text = text.replace(/\r\n/g, '\n'); // normalize to LF for processing; restored before writing
const doc = yaml.load(text); // read-only, for original title/body lookups

function stripOldTitlePrefix(title) {
  const m = title.match(/^\[[^\]]+\]\s*(.*)$/);
  return m ? m[1] : title;
}
function replaceOnce(haystack, oldStr, newStr, label) {
  const count = haystack.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`expected exactly 1 occurrence of ${label}, found ${count}`);
  return haystack.replace(oldStr, newStr);
}

let epicSeq = 0;
for (const e of doc.epics) {
  epicSeq += 1;
  const roadmapId = epicRoadmapId.get(e.id);
  if (!roadmapId) throw new Error(`no roadmap id mapping for epic ${e.id}`);
  const bareTitle = stripOldTitlePrefix(e.title);
  const newTitle = `[${roadmapId}] ${bareTitle}`;

  // 1) id: line -> insert internal_key/roadmap_id/epic_sequence/chronological_order right after it
  const idLine = `  - id: ${e.id}\n`;
  const idLineReplacement = `  - id: ${e.id}\n    internal_key: ${e.id}\n    roadmap_id: ${roadmapId}\n    epic_sequence: ${epicSeq}\n    chronological_order: ${chronOrder.get(e.id)}\n`;
  text = replaceOnce(text, idLine, idLineReplacement, `id line for ${e.id}`);

  // 2) title: line
  const titleLine = `    title: '${e.title.replace(/'/g, "''")}'\n`;
  const titleLineReplacement = `    title: '${newTitle.replace(/'/g, "''")}'\n`;
  text = replaceOnce(text, titleLine, titleLineReplacement, `title line for ${e.id}`);

  // 3) body marker -> metadata block. The marker line is a line inside a
  // YAML "body: |" literal block scalar indented 6 spaces; every extra
  // line inserted here must carry the SAME 6-space indent or the block
  // scalar ends early and breaks the document.
  const oldMarkerLine = `<!-- sentirella-roadmap-id: ${e.id} -->`;
  const newBlock = `<!-- sentirella-roadmap-key: ${e.id} -->\n      **Roadmap ID:** \`${roadmapId}\`  \n      **Internal key:** \`${e.id}\``;
  text = replaceOnce(text, oldMarkerLine, newBlock, `body marker for ${e.id}`);
}

let taskSeq = 0;
for (const i of doc.issues) {
  taskSeq += 1;
  const roadmapId = taskRoadmapId.get(i.id);
  if (!roadmapId) throw new Error(`no roadmap id mapping for task ${i.id}`);
  const bareTitle = stripOldTitlePrefix(i.title);
  const newTitle = `[${roadmapId}] ${bareTitle}`;

  const idLine = `  - id: ${i.id}\n`;
  const idLineReplacement = `  - id: ${i.id}\n    internal_key: ${i.id}\n    roadmap_id: ${roadmapId}\n    sequence: ${taskSeq}\n    chronological_order: ${chronOrder.get(i.id)}\n`;
  text = replaceOnce(text, idLine, idLineReplacement, `id line for ${i.id}`);

  const titleLine = `    title: '${i.title.replace(/'/g, "''")}'\n`;
  const titleLineReplacement = `    title: '${newTitle.replace(/'/g, "''")}'\n`;
  text = replaceOnce(text, titleLine, titleLineReplacement, `title line for ${i.id}`);

  const oldMarkerLine = `<!-- sentirella-roadmap-id: ${i.id} -->`;
  const newBlock = `<!-- sentirella-roadmap-key: ${i.id} -->\n      **Roadmap ID:** \`${roadmapId}\`  \n      **Internal key:** \`${i.id}\``;
  text = replaceOnce(text, oldMarkerLine, newBlock, `body marker for ${i.id}`);
}

// New Project fields (Roadmap ID: text, Chronological order: number) -- insert
// right before `  not_created:`, matching the existing text-field style.
const anchor = '  not_created:';
const newFieldsBlock =
  '    - name: Roadmap ID\n' +
  '      type: text\n' +
  '      note: Public chronological identifier (E01-E16 for Epics, T001-T138 for tasks).\n' +
  '    - name: Chronological order\n' +
  '      type: number\n' +
  '      note: Unique integer 1-154 giving the approved roadmap sequence; not a priority or status signal.\n' +
  anchor;
text = replaceOnce(text, anchor, newFieldsBlock, 'fields.create anchor (not_created:)');

// Future-numbering policy + next-available ids, appended to _meta.
const metaAnchor = '  approved_merges: 3\n';
const metaInsertion =
  '  next_task_id: T139\n' +
  '  next_epic_id: E17\n' +
  '  chronological_numbering_policy: >-\n' +
  '    Public roadmap identifiers are assigned chronologically when work is\n' +
  '    formally accepted into the roadmap. Task identifiers are never reused,\n' +
  '    even when a task is cancelled, merged, or removed from active planning.\n' +
  '    Existing identifiers are never renumbered merely because priorities or\n' +
  '    implementation dates change.\n';
text = replaceOnce(text, metaAnchor, metaAnchor + metaInsertion, 'meta anchor (approved_merges: 3)');

if (usesCRLF) text = text.replace(/\n/g, '\r\n');
writeFileSync(MANIFEST_PATH, text, 'utf8');
console.log('OK. Epics mapped:', epicRoadmapId.size, 'Tasks mapped:', taskRoadmapId.size, 'Final chronological value:', seq);
