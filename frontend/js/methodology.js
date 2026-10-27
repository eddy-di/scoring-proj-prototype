// Methodology tree helpers (read from the cache) and operations (sent to the API).
import * as db from './store.js';
import { languages } from './i18n.js';

const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;

export const nodesOf = (versionId) => db.all('methodology_nodes', (n) => n.version_id === versionId);
export const childrenOf = (versionId, parentId) => nodesOf(versionId).filter((n) => n.parent_id === parentId).sort(bySort);
export const rootOf = (versionId) => nodesOf(versionId).find((n) => n.parent_id == null) ?? null;
export const ruleOf = (nodeId) => db.find('scoring_rules', (r) => r.node_id === nodeId);
export const versionUrl = (versionId) => db.urlOf('methodology_versions', versionId);

export function pathOf(node) {
  const path = [];
  for (let n = node; n; n = db.get('methodology_nodes', n.parent_id)) path.unshift(n);
  return path;
}

// Validation problems mention the node code first ("STR: group has no children.").
export function problemsOf(validation, node) {
  if (!validation) return { errors: [], warnings: [] };
  const mine = (m) => m.startsWith(`${node.code}:`);
  const strip = (m) => m.slice(node.code.length + 1).trim();
  return { errors: validation.errors.filter(mine).map(strip), warnings: validation.warnings.filter(mine).map(strip) };
}

export async function createMethodology(v) {
  const m = await db.create('methodologies', v);
  return db.find('methodology_versions', (x) => x.methodology_id === m.id);
}

export function addNode(versionId, parentId, nodeType) {
  const codes = new Set(nodesOf(versionId).map((n) => n.code));
  const prefix = nodeType === 'group' ? 'G' : 'Q';
  let i = 1;
  while (codes.has(`${prefix}${i}`)) i += 1;
  // No name: the server calls it "New group" / "New question" in every language.
  return db.create('methodology_nodes', {
    version_id: versionId, parent_id: parentId, node_type: nodeType,
    code: `${prefix}${i}`, weight: 1, sort_order: childrenOf(versionId, parentId).length,
  });
}

export const deleteNode = (node) => db.remove('methodology_nodes', node.id);

// Linking a question also fills in the node's name (in every language) and code when they
// are still the defaults. The server deletes criteria that belonged to the previous question.
export function setNodeQuestion(node, questionId) {
  const q = db.get('questions', questionId);
  const patch = { question_id: questionId };
  if (q && (node.name_en === 'New question' || !node.name_en)) {
    for (const { code } of languages()) patch[`name_${code}`] = q[`text_${code}`] ?? q.text_en;
  }
  if (q && /^Q\d+$/.test(node.code) && !nodesOf(node.version_id).some((n) => n.code === q.code)) patch.code = q.code;
  return db.update('methodology_nodes', node.id, patch);
}

// Weight helpers for the children of a group.
async function setWeights(children, weights) {
  for (const [i, c] of children.entries()) {
    if (Math.abs(c.weight - weights[i]) > 1e-9) {
      // eslint-disable-next-line no-await-in-loop
      await db.update('methodology_nodes', c.id, { weight: weights[i] }, ['methodology_nodes']);
    }
  }
  await db.load();
}

const round6 = (x) => Math.round(x * 1e6) / 1e6;

export function equalizeWeights(group) {
  const kids = childrenOf(group.version_id, group.id);
  const each = round6(1 / kids.length);
  return setWeights(kids, kids.map((_, i) => (i === kids.length - 1 ? round6(1 - each * (kids.length - 1)) : each)));
}

export function scaleWeightsToOne(group) {
  const kids = childrenOf(group.version_id, group.id);
  const sum = kids.reduce((s, k) => s + k.weight, 0);
  if (!(sum > 0)) return equalizeWeights(group);
  const scaled = kids.map((k) => round6(k.weight / sum));
  scaled[scaled.length - 1] = round6(1 - scaled.slice(0, -1).reduce((s, w) => s + w, 0));
  return setWeights(kids, scaled);
}

export const publishVersion = (id) => db.action(`${versionUrl(id)}publish/`);
export const archiveVersion = (id) => db.action(`${versionUrl(id)}archive/`);
export async function newVersionFrom(id) {
  const copy = await db.action(`${versionUrl(id)}new-version/`);
  return copy.id;
}
