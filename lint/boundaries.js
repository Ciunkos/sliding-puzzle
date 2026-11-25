// @ts-check
/**
 * MODULE BOUNDARIES (lint-enforced). Tested in gates/boundaries.test.ts.
 *
 * `no-restricted-imports` with `regex` patterns, ported from ESLint 10.15.0
 * (lib/rules/no-restricted-imports.js, the `patterns: [{ regex, message, caseSensitive }]` form only).
 * oxlint has a native no-restricted-imports, but its regexes are Rust regexes without look-around,
 * and the boundary patterns need look-ahead (`^\.\./(?!test-support/)...`). Here they are JavaScript
 * regexes, case-insensitive unless `caseSensitive` is set, exactly as in ESLint.
 *
 * Two rule ids with the same code, as ESLint had `no-restricted-imports` and
 * `@typescript-eslint/no-restricted-imports`: a later override block replaces the options of the same
 * rule id, so the test-code ban lives under its own id and adds to the module rules.
 *
 * ESLint is licensed under the MIT license:
 *
 * Copyright OpenJS Foundation and other contributors, <www.openjsf.org>
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

const restrictedImports = {
  meta: {
    type: 'suggestion',
    schema: [
      {
        type: 'object',
        properties: {
          patterns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                regex: { type: 'string' },
                message: { type: 'string', minLength: 1 },
                caseSensitive: { type: 'boolean' },
              },
              required: ['regex'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      patterns: "'{{importSource}}' import is restricted from being used by a pattern.",
      patternWithCustomMessage:
        "'{{importSource}}' import is restricted from being used by a pattern. {{customMessage}}",
    },
  },
  /** @param {any} context */
  create(context) {
    /** @type {{ regex: string, message?: string, caseSensitive?: boolean }[]} */
    const patterns = context.options[0]?.patterns ?? [];
    const groups = patterns.map((p) => ({
      matcher: new RegExp(p.regex, p.caseSensitive ? 'u' : 'iu'),
      customMessage: p.message,
    }));

    /** @param {any} node @param {string} raw */
    const check = (node, raw) => {
      const importSource = raw.trim();
      for (const group of groups) {
        if (!group.matcher.test(importSource)) continue;
        context.report({
          node,
          messageId: group.customMessage ? 'patternWithCustomMessage' : 'patterns',
          data: { importSource, customMessage: group.customMessage ?? '' },
        });
      }
    };

    return {
      /** @param {any} node */
      ImportDeclaration: (node) => check(node, node.source.value),
      /** @param {any} node */
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      /** @param {any} node */
      ExportAllDeclaration: (node) => check(node, node.source.value),
      /** @param {any} node */
      TSImportEqualsDeclaration(node) {
        if (node.moduleReference.type === 'TSExternalModuleReference') {
          check(node, node.moduleReference.expression.value);
        }
      },
    };
  },
};

export default {
  meta: { name: 'boundaries' },
  rules: {
    'no-restricted-imports': restrictedImports,
    'production-no-restricted-imports': restrictedImports,
  },
};
