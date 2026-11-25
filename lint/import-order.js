// @ts-check
/**
 * import-order: the part of eslint-plugin-import-x's `order` rule that this project uses, ported to
 * the oxlint JS plugin API (import-x cannot parse TypeScript under oxlint). Options: `groups` and
 * `alphabetize` ({ order, caseInsensitive, orderImportKind }); `newlines-between`, `pathGroups`,
 * `named` and the other options of the original are not supported and refused by the schema.
 *
 * Ranking, alphabetizing, the out-of-order search and the messages follow import-x 4.18.1
 * (lib/rules/order.js, lib/utils/import-type.js). One difference: import-x asks a resolver whether a
 * package name lives in node_modules (external) or in the project (internal). This project has no
 * path aliases, so every bare name is external, as import-x classifies it here too. The fix sorts the
 * import block when it is one run of import statements with no comments in between; otherwise the
 * import has to be moved by hand.
 *
 * eslint-plugin-import-x is licensed under the MIT license:
 *
 * Copyright (c) 2015 Ben Mosher
 * Copyright (c) 2020 modern-webdev
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute,
 * sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
 * NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
 * OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { isBuiltin } from 'node:module';
import path from 'node:path';

// ---------------------------------------------------------------------------------------------
// Import types (lib/utils/import-type.js, without a resolver)
// ---------------------------------------------------------------------------------------------

const scopedRegExp = /^@[^/]+\/?[^/]+/;
const moduleRegExp = /^\w/;
const indexFiles = new Set(['.', './', './index', './index.js']);

/** @param {string} name */
function baseModule(name) {
  if (scopedRegExp.test(name)) {
    const [scope, pkg] = name.split('/');
    return `${scope}/${pkg}`;
  }
  return name.split('/')[0];
}

/** @param {unknown} name @returns {string} */
export function importType(name) {
  if (typeof name !== 'string') return 'unknown';
  if (path.isAbsolute(name)) return 'absolute';
  if (name && isBuiltin(baseModule(name))) return 'builtin';
  if (/^\.\.$|^\.\.[/\\]/.test(name)) return 'parent';
  if (indexFiles.has(name)) return 'index';
  if (/^\.[/\\]/.test(name)) return 'sibling';
  if (moduleRegExp.test(name) || scopedRegExp.test(name)) return 'external';
  return 'unknown';
}

const TYPES = [
  'builtin',
  'external',
  'internal',
  'unknown',
  'parent',
  'sibling',
  'index',
  'object',
  'type',
];

/** @param {(string | string[])[]} groups */
function convertGroupsToRanks(groups) {
  /** @type {Record<string, number>} */
  const ranks = {};
  groups.forEach((group, index) => {
    for (const item of [group].flat()) {
      if (!TYPES.includes(item)) {
        throw new Error(
          `Incorrect configuration of the rule: Unknown type \`${JSON.stringify(item)}\``,
        );
      }
      if (ranks[item] !== undefined) {
        throw new Error(`Incorrect configuration of the rule: \`${item}\` is duplicated`);
      }
      ranks[item] = index * 2;
    }
  });
  const omittedTypes = TYPES.filter((type) => ranks[type] === undefined);
  for (const type of omittedTypes) ranks[type] = groups.length * 2;
  return { groups: ranks, omittedTypes };
}

// ---------------------------------------------------------------------------------------------
// Ordering (lib/rules/order.js)
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {{ node: any, value: string, displayName: string, type: string, rank: number, index: number }} Entry
 */

/** @param {Entry[]} imported */
function findOutOfOrder(imported) {
  if (imported.length === 0) return [];
  let maxSeenRankNode = imported[0];
  return imported.filter((entry) => {
    const res = entry.rank < maxSeenRankNode.rank;
    if (maxSeenRankNode.rank < entry.rank) maxSeenRankNode = entry;
    return res;
  });
}

/** @param {Entry[]} array */
const reverse = (array) => array.map((v) => ({ ...v, rank: -v.rank })).reverse();

/** @param {Entry} entry */
function makeImportDescription(entry) {
  if (entry.node.importKind === 'type') return 'type import';
  if (entry.node.importKind === 'typeof') return 'typeof import';
  return 'import';
}

/** @param {string} a @param {string} b */
const compareString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const RELATIVE_DOTS = new Set(['.', '..']);

/** @param {{ order: string, orderImportKind: string, caseInsensitive: boolean }} options */
function getSorter(options) {
  const multiplier = options.order === 'asc' ? 1 : -1;
  const kindMultiplier =
    options.orderImportKind !== 'ignore' && (options.orderImportKind === 'asc' ? 1 : -1);
  /** @param {Entry} nodeA @param {Entry} nodeB */
  return function importsSorter(nodeA, nodeB) {
    const importA = options.caseInsensitive
      ? String(nodeA.value).toLowerCase()
      : String(nodeA.value);
    const importB = options.caseInsensitive
      ? String(nodeB.value).toLowerCase()
      : String(nodeB.value);
    let result = 0;
    if (!importA.includes('/') && !importB.includes('/')) {
      result = compareString(importA, importB);
    } else {
      const A = importA.split('/');
      const B = importB.split('/');
      for (let i = 0; i < Math.min(A.length, B.length); i += 1) {
        const x = A[i];
        const y = B[i];
        if (i === 0 && RELATIVE_DOTS.has(x) && RELATIVE_DOTS.has(y)) {
          if (x !== y) {
            result = compareString(importA, importB);
            break;
          }
          continue;
        }
        result = compareString(x, y);
        if (result) break;
      }
      if (!result && A.length !== B.length) result = A.length < B.length ? -1 : 1;
    }
    result *= multiplier;
    if (!result && kindMultiplier) {
      result =
        kindMultiplier *
        compareString(nodeA.node.importKind || 'value', nodeB.node.importKind || 'value');
    }
    return result;
  };
}

/** @param {Entry[]} imported @param {{ order: string, orderImportKind: string, caseInsensitive: boolean }} options */
function mutateRanksToAlphabetize(imported, options) {
  /** @type {Record<string, Entry[]>} */
  const byRank = {};
  for (const entry of imported) (byRank[entry.rank] ??= []).push(entry);
  const sorter = getSorter(options);
  const groupRanks = Object.keys(byRank).sort((a, b) => Number(a) - Number(b));
  for (const rank of groupRanks) byRank[rank].sort(sorter);
  let newRank = 0;
  /** @type {Record<string, number>} */
  const ranks = {};
  for (const rank of groupRanks) {
    for (const entry of byRank[rank]) {
      ranks[`${entry.value}|${entry.node.importKind}`] = Number.parseInt(rank, 10) + newRank;
      newRank += 1;
    }
  }
  for (const entry of imported) entry.rank = ranks[`${entry.value}|${entry.node.importKind}`];
}

/** The statement that holds an import: the declaration, or the declaration around a require. */
function rootOf(/** @type {any} */ node) {
  let parent = node;
  while (parent.parent != null && (!('body' in parent.parent) || parent.parent.body == null)) {
    parent = parent.parent;
  }
  return parent;
}

/**
 * A fix that sorts the whole block, offered only when the imports are one run of statements with
 * nothing but whitespace between them.
 * @param {any} sourceCode @param {Entry[]} imported
 */
function sortBlockFix(sourceCode, imported) {
  const roots = imported.map((entry) => rootOf(entry.node));
  const body = roots[0]?.parent?.body;
  if (!Array.isArray(body)) return undefined;
  const indexes = roots.map((root) => body.indexOf(root));
  const first = Math.min(...indexes);
  const last = Math.max(...indexes);
  if (last - first + 1 !== roots.length || new Set(indexes).size !== roots.length) return undefined;
  const start = body[first].range[0];
  const end = body[last].range[1];
  if (
    sourceCode
      .getAllComments()
      .some((/** @type {any} */ c) => c.range[0] < end && c.range[1] > start)
  ) {
    return undefined;
  }
  const ordered = [...imported].sort((a, b) => a.rank - b.rank || a.index - b.index);
  const inSource = [...imported].sort((a, b) => a.index - b.index);
  let text = '';
  inSource.forEach((entry, i) => {
    const slot = rootOf(entry.node);
    const replacement = rootOf(ordered[i].node);
    text += sourceCode.text.slice(replacement.range[0], replacement.range[1]);
    const next = inSource[i + 1];
    if (next) text += sourceCode.text.slice(slot.range[1], rootOf(next.node).range[0]);
  });
  return (/** @type {any} */ fixer) => fixer.replaceTextRange([start, end], text);
}

export const importOrder = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          groups: { type: 'array' },
          alphabetize: {
            type: 'object',
            properties: {
              order: { enum: ['ignore', 'asc', 'desc'] },
              orderImportKind: { enum: ['ignore', 'asc', 'desc'] },
              caseInsensitive: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      error: '{{error}}',
      order: '{{secondImport}} should occur {{order}} {{firstImport}}',
    },
  },
  /** @param {any} context */
  create(context) {
    const options = context.options[0] ?? {};
    const alphabetize = {
      order: options.alphabetize?.order ?? 'ignore',
      orderImportKind: options.alphabetize?.orderImportKind ?? 'ignore',
      caseInsensitive: options.alphabetize?.caseInsensitive ?? false,
    };
    /** @type {ReturnType<typeof convertGroupsToRanks>} */
    let ranks;
    try {
      ranks = convertGroupsToRanks(
        options.groups ?? ['builtin', 'external', 'parent', 'sibling', 'index'],
      );
    } catch (error) {
      return {
        /** @param {any} node */
        Program(node) {
          context.report({
            node,
            messageId: 'error',
            data: { error: String(/** @type {Error} */ (error).message) },
          });
        },
      };
    }
    const typeInGroups = !ranks.omittedTypes.includes('type');
    /** @type {Map<any, Entry[]>} */
    const blocks = new Map();
    let index = 0;

    /** @param {any} node @param {string} value @param {string} type @param {any} block */
    const register = (node, value, type, block) => {
      let impType;
      if (type === 'import:object') impType = 'object';
      else if (node.importKind === 'type' && typeInGroups) impType = 'type';
      else impType = importType(value);
      let rank = ranks.groups[impType];
      if (rank === undefined) return;
      if (type !== 'import' && !type.startsWith('import:')) rank += 100;
      const displayName =
        type === 'import:object' ? context.sourceCode.getText(node.moduleReference) : value;
      const list = blocks.get(block) ?? [];
      list.push({ node, value, displayName, type, rank, index });
      index += 1;
      blocks.set(block, list);
    };

    /**
     * @param {Entry[]} imported @param {Entry[]} outOfOrder @param {string} order
     * @param {((fixer: any) => any) | undefined} fix
     */
    const reportOutOfOrder = (imported, outOfOrder, order, fix) => {
      for (const imp of outOfOrder) {
        const target = imported.find((entry) => entry.rank > imp.rank);
        if (!target) continue;
        if (
          target.displayName === imp.displayName &&
          makeImportDescription(target) === makeImportDescription(imp)
        ) {
          continue;
        }
        context.report({
          node: imp.node,
          messageId: 'order',
          data: {
            firstImport: `${makeImportDescription(target)} of \`${target.displayName}\``,
            secondImport: `\`${imp.displayName}\` ${makeImportDescription(imp)}`,
            order,
          },
          ...(fix ? { fix } : {}),
        });
      }
    };

    return {
      /** @param {any} node */
      ImportDeclaration(node) {
        if (node.specifiers.length > 0) register(node, node.source.value, 'import', node.parent);
      },
      /** @param {any} node */
      TSImportEqualsDeclaration(node) {
        if (node.isExport) return;
        if (node.moduleReference.type === 'TSExternalModuleReference') {
          register(node, node.moduleReference.expression.value, 'import', node.parent);
        } else {
          register(node, '', 'import:object', node.parent);
        }
      },
      /** @param {any} node */
      CallExpression(node) {
        const isStaticRequire =
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'Literal' &&
          typeof node.arguments[0].value === 'string';
        if (!isStaticRequire) return;
        let n = node;
        while (
          (n.parent?.type === 'MemberExpression' && n.parent.object === n) ||
          (n.parent?.type === 'CallExpression' && n.parent.callee === n)
        ) {
          n = n.parent;
        }
        if (
          n.parent?.type === 'VariableDeclarator' &&
          n.parent.parent.type === 'VariableDeclaration' &&
          n.parent.parent.parent.type === 'Program'
        ) {
          register(node, node.arguments[0].value, 'require', n.parent.parent.parent);
        }
      },
      'Program:exit'() {
        for (const imported of blocks.values()) {
          if (alphabetize.order !== 'ignore') mutateRanksToAlphabetize(imported, alphabetize);
          const outOfOrder = findOutOfOrder(imported);
          if (outOfOrder.length === 0) continue;
          const fix = sortBlockFix(context.sourceCode, imported);
          const reversed = reverse(imported);
          const reversedOrder = findOutOfOrder(reversed);
          if (reversedOrder.length < outOfOrder.length) {
            reportOutOfOrder(reversed, reversedOrder, 'after', fix);
          } else {
            reportOutOfOrder(imported, outOfOrder, 'before', fix);
          }
        }
        blocks.clear();
      },
    };
  },
};
