// @ts-check
/**
 * Four ESLint core rules, ported to the oxlint JS plugin API so the gates keep their rule ids and
 * fix hints after the move from ESLint to oxlint: complexity, max-depth, max-nested-callbacks and
 * max-lines-per-function. oxlint has native versions, but their messages are fixed, and the gates
 * append a hint that says how to fix the problem (see `withHint` in ./test-standard.js).
 *
 * The rule bodies are copied from ESLint 10.15.0 (lib/rules/*.js and the helpers they use from
 * lib/rules/utils/ast-utils.js and lib/shared/string-utils.js), with only the module syntax changed.
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

// ---------------------------------------------------------------------------------------------
// Helpers (ast-utils.js, string-utils.js)
// ---------------------------------------------------------------------------------------------

const LOGICAL_ASSIGNMENT_OPERATORS = new Set(['&&=', '||=', '??=']);

/** @param {string} operator */
const isLogicalAssignmentOperator = (operator) => LOGICAL_ASSIGNMENT_OPERATORS.has(operator);

/** @param {string} string */
function upperCaseFirst(string) {
  if (string.length <= 1) return string.toUpperCase();
  return string[0].toUpperCase() + string.slice(1);
}

/** @param {any} left @param {any} right */
const isTokenOnSameLine = (left, right) => left.loc.end.line === right.loc.start.line;

/** @param {any} token */
const isArrowToken = (token) => token.value === '=>' && token.type === 'Punctuator';

/** @param {any} token */
const isOpeningParenToken = (token) => token.value === '(' && token.type === 'Punctuator';

/** @param {any} node */
function isNullLiteral(node) {
  return node.type === 'Literal' && node.value === null && !node.regex && !node.bigint;
}

/** @param {any} node @returns {string | null} */
function getStaticStringValue(node) {
  switch (node.type) {
    case 'Literal':
      if (node.value === null) {
        if (isNullLiteral(node)) return String(node.value);
        if (node.regex) return `/${node.regex.pattern}/${node.regex.flags}`;
        if (node.bigint) return node.bigint;
      } else {
        return String(node.value);
      }
      break;
    case 'TemplateLiteral':
      if (node.expressions.length === 0 && node.quasis.length === 1) {
        return node.quasis[0].value.cooked;
      }
      break;
    // no default
  }
  return null;
}

/** @param {any} node @returns {string | null} */
function getStaticPropertyName(node) {
  let prop;
  switch (node && node.type) {
    case 'ChainExpression':
      return getStaticPropertyName(node.expression);
    case 'Property':
    case 'PropertyDefinition':
    case 'MethodDefinition':
    case 'TSPropertySignature':
    case 'TSMethodSignature':
      prop = node.key;
      break;
    case 'MemberExpression':
      prop = node.property;
      break;
    // no default
  }
  if (prop) {
    if (prop.type === 'Identifier' && !node.computed) return prop.name;
    return getStaticStringValue(prop);
  }
  return null;
}

/** @param {any} node @param {any} sourceCode */
function getOpeningParenOfParams(node, sourceCode) {
  if (node.type === 'ArrowFunctionExpression' && node.params.length === 1) {
    const argToken = sourceCode.getFirstToken(node.params[0]);
    const maybeParenToken = sourceCode.getTokenBefore(argToken);
    return isOpeningParenToken(maybeParenToken) ? maybeParenToken : argToken;
  }
  return node.id
    ? sourceCode.getTokenAfter(node.id, isOpeningParenToken)
    : sourceCode.getFirstToken(node, isOpeningParenToken);
}

/** @param {any} node @returns {string} */
function getFunctionNameWithKind(node) {
  const parent = node.parent;
  const tokens = [];
  if (
    parent.type === 'MethodDefinition' ||
    parent.type === 'PropertyDefinition' ||
    node.type === 'TSPropertySignature' ||
    node.type === 'TSMethodSignature'
  ) {
    if (parent.static) tokens.push('static');
    if (!parent.computed && parent.key?.type === 'PrivateIdentifier') tokens.push('private');
  }
  if (node.async) tokens.push('async');
  if (node.generator) tokens.push('generator');

  if (parent.type === 'Property' || parent.type === 'MethodDefinition') {
    if (parent.kind === 'constructor') return 'constructor';
    if (parent.kind === 'get') tokens.push('getter');
    else if (parent.kind === 'set') tokens.push('setter');
    else tokens.push('method');
  } else if (node.type === 'TSMethodSignature') {
    if (node.kind === 'get') tokens.push('getter');
    else if (node.kind === 'set') tokens.push('setter');
    else tokens.push('method');
  } else if (parent.type === 'PropertyDefinition') {
    tokens.push('method');
  } else {
    if (node.type === 'ArrowFunctionExpression') tokens.push('arrow');
    tokens.push('function');
  }

  if (
    parent.type === 'Property' ||
    parent.type === 'MethodDefinition' ||
    parent.type === 'PropertyDefinition'
  ) {
    if (!parent.computed && parent.key.type === 'PrivateIdentifier') {
      tokens.push(`#${parent.key.name}`);
    } else {
      const name = getStaticPropertyName(parent);
      if (name !== null) tokens.push(`'${name}'`);
      else if (node.id) tokens.push(`'${node.id.name}'`);
    }
  } else if (node.type === 'TSMethodSignature') {
    tokens.push(`'${getStaticPropertyName(node)}'`);
  } else if (node.id) {
    tokens.push(`'${node.id.name}'`);
  }
  return tokens.join(' ');
}

/** @param {any} node @param {any} sourceCode */
function getFunctionHeadLoc(node, sourceCode) {
  const parent = node.parent;
  let start;
  let end;
  if (
    parent.type === 'Property' ||
    parent.type === 'MethodDefinition' ||
    parent.type === 'PropertyDefinition' ||
    parent.type === 'TSPropertySignature' ||
    parent.type === 'TSMethodSignature'
  ) {
    start = parent.loc.start;
    end = getOpeningParenOfParams(node, sourceCode).loc.start;
  } else if (node.type === 'ArrowFunctionExpression') {
    const arrowToken = sourceCode.getTokenBefore(node.body, isArrowToken);
    start = arrowToken.loc.start;
    end = arrowToken.loc.end;
  } else if (node.type === 'TSFunctionType') {
    const arrowToken = sourceCode.getTokenBefore(node.returnType.typeAnnotation, isArrowToken);
    start = arrowToken.loc.start;
    end = arrowToken.loc.end;
  } else {
    start = node.loc.start;
    end = getOpeningParenOfParams(node, sourceCode).loc.start;
  }
  return { start: { ...start }, end: { ...end } };
}

/** @param {unknown} option @param {number} fallback */
function threshold(option, fallback) {
  if (typeof option === 'number') return option;
  if (typeof option === 'object' && option !== null) {
    const o = /** @type {{ maximum?: number, max?: number }} */ (option);
    if (Object.hasOwn(o, 'maximum') || Object.hasOwn(o, 'max')) return o.maximum || o.max || 0;
  }
  return fallback;
}

const LIMIT_SCHEMA = [
  {
    oneOf: [
      { type: 'integer', minimum: 0 },
      {
        type: 'object',
        properties: {
          maximum: { type: 'integer', minimum: 0 },
          max: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// complexity (lib/rules/complexity.js)
// ---------------------------------------------------------------------------------------------

export const complexity = {
  meta: {
    type: 'suggestion',
    schema: [
      {
        oneOf: [
          { type: 'integer', minimum: 0 },
          {
            type: 'object',
            properties: {
              maximum: { type: 'integer', minimum: 0 },
              max: { type: 'integer', minimum: 0 },
              variant: { enum: ['classic', 'modified'] },
            },
            additionalProperties: false,
          },
        ],
      },
    ],
    messages: {
      complex: '{{name}} has a complexity of {{complexity}}. Maximum allowed is {{max}}.',
    },
  },
  /** @param {any} context */
  create(context) {
    const sourceCode = context.sourceCode;
    const option = context.options[0];
    const max = threshold(option, 20);
    const modified = typeof option === 'object' && option?.variant === 'modified';
    /** @type {number[]} */
    const complexities = [];
    const increase = () => {
      complexities[complexities.length - 1] += 1;
    };
    return {
      onCodePathStart() {
        complexities.push(1);
      },
      CatchClause: increase,
      ConditionalExpression: increase,
      LogicalExpression: increase,
      ForStatement: increase,
      ForInStatement: increase,
      ForOfStatement: increase,
      IfStatement: increase,
      WhileStatement: increase,
      DoWhileStatement: increase,
      AssignmentPattern: increase,
      'SwitchCase[test]': () => modified || increase(),
      SwitchStatement: () => modified && increase(),
      /** @param {any} node */
      AssignmentExpression(node) {
        if (isLogicalAssignmentOperator(node.operator)) increase();
      },
      /** @param {any} node */
      MemberExpression(node) {
        if (node.optional === true) increase();
      },
      /** @param {any} node */
      CallExpression(node) {
        if (node.optional === true) increase();
      },
      /** @param {any} codePath @param {any} node */
      onCodePathEnd(codePath, node) {
        const value = complexities.pop() ?? 0;
        if (
          codePath.origin !== 'function' &&
          codePath.origin !== 'class-field-initializer' &&
          codePath.origin !== 'class-static-block'
        ) {
          return;
        }
        if (value <= max) return;
        let name;
        let loc = node.loc;
        if (codePath.origin === 'class-field-initializer') {
          name = 'class field initializer';
        } else if (codePath.origin === 'class-static-block') {
          name = 'class static block';
          loc = sourceCode.getFirstToken(node).loc;
        } else {
          name = getFunctionNameWithKind(node);
          loc = getFunctionHeadLoc(node, sourceCode);
        }
        context.report({
          node,
          loc,
          messageId: 'complex',
          data: { name: upperCaseFirst(name), complexity: String(value), max: String(max) },
        });
      },
    };
  },
};

// ---------------------------------------------------------------------------------------------
// max-depth (lib/rules/max-depth.js)
// ---------------------------------------------------------------------------------------------

export const maxDepth = {
  meta: {
    type: 'suggestion',
    schema: LIMIT_SCHEMA,
    messages: {
      tooDeeply: 'Blocks are nested too deeply ({{depth}}). Maximum allowed is {{maxDepth}}.',
    },
  },
  /** @param {any} context */
  create(context) {
    const sourceCode = context.sourceCode;
    const max = threshold(context.options[0], 4);
    /** @type {number[]} */
    const functionStack = [];
    const startFunction = () => {
      functionStack.push(0);
    };
    const endFunction = () => {
      functionStack.pop();
    };
    /** @param {any} node */
    const pushBlock = (node) => {
      functionStack[functionStack.length - 1] += 1;
      const len = functionStack[functionStack.length - 1];
      if (len > max) {
        context.report({
          node,
          loc: sourceCode.getFirstToken(node).loc,
          messageId: 'tooDeeply',
          data: { depth: String(len), maxDepth: String(max) },
        });
      }
    };
    const popBlock = () => {
      functionStack[functionStack.length - 1] -= 1;
    };
    /** @param {any} node */
    const isElseIf = (node) => node.parent.type === 'IfStatement' && node.parent.alternate === node;
    return {
      Program: startFunction,
      FunctionDeclaration: startFunction,
      FunctionExpression: startFunction,
      ArrowFunctionExpression: startFunction,
      StaticBlock: startFunction,
      /** @param {any} node */
      IfStatement(node) {
        if (!isElseIf(node)) pushBlock(node);
      },
      SwitchStatement: pushBlock,
      TryStatement: pushBlock,
      DoWhileStatement: pushBlock,
      WhileStatement: pushBlock,
      WithStatement: pushBlock,
      ForStatement: pushBlock,
      ForInStatement: pushBlock,
      ForOfStatement: pushBlock,
      /** @param {any} node */
      'IfStatement:exit'(node) {
        if (!isElseIf(node)) popBlock();
      },
      'SwitchStatement:exit': popBlock,
      'TryStatement:exit': popBlock,
      'DoWhileStatement:exit': popBlock,
      'WhileStatement:exit': popBlock,
      'WithStatement:exit': popBlock,
      'ForStatement:exit': popBlock,
      'ForInStatement:exit': popBlock,
      'ForOfStatement:exit': popBlock,
      'FunctionDeclaration:exit': endFunction,
      'FunctionExpression:exit': endFunction,
      'ArrowFunctionExpression:exit': endFunction,
      'StaticBlock:exit': endFunction,
      'Program:exit': endFunction,
    };
  },
};

// ---------------------------------------------------------------------------------------------
// max-nested-callbacks (lib/rules/max-nested-callbacks.js)
// ---------------------------------------------------------------------------------------------

export const maxNestedCallbacks = {
  meta: {
    type: 'suggestion',
    schema: [
      {
        oneOf: [
          { type: 'integer', minimum: 0 },
          {
            type: 'object',
            properties: {
              maximum: { type: 'integer', minimum: 0 },
              max: { type: 'integer', minimum: 0 },
              checkConstructorCallCallbacks: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        ],
      },
    ],
    messages: { exceed: 'Too many nested callbacks ({{num}}). Maximum allowed is {{max}}.' },
  },
  /** @param {any} context */
  create(context) {
    const sourceCode = context.sourceCode;
    const option = context.options[0];
    const max = threshold(option, 10);
    const constructorCalls = typeof option === 'object' && option?.checkConstructorCallCallbacks;
    /** @type {any[]} */
    const callbackStack = [];
    /** @param {any} node */
    const checkFunction = (node) => {
      const parent = node.parent;
      if (
        (parent.type !== 'CallExpression' &&
          !(constructorCalls && parent.type === 'NewExpression')) ||
        parent.callee === node
      ) {
        return;
      }
      callbackStack.push(node);
      if (callbackStack.length > max) {
        context.report({
          node,
          loc: getFunctionHeadLoc(node, sourceCode),
          messageId: 'exceed',
          data: { num: String(callbackStack.length), max: String(max) },
        });
      }
    };
    /** @param {any} node */
    const popStack = (node) => {
      if (callbackStack.at(-1) === node) callbackStack.pop();
    };
    return {
      ArrowFunctionExpression: checkFunction,
      'ArrowFunctionExpression:exit': popStack,
      FunctionExpression: checkFunction,
      'FunctionExpression:exit': popStack,
    };
  },
};

// ---------------------------------------------------------------------------------------------
// max-lines-per-function (lib/rules/max-lines-per-function.js)
// ---------------------------------------------------------------------------------------------

/** @param {any} sourceCode @returns {Set<number>} the lines holding nothing but comments */
function getCommentOnlyLines(sourceCode) {
  const commentOnlyLines = new Set();
  for (const comment of sourceCode.getAllComments()) {
    const tokenBefore = sourceCode.getTokenBefore(comment);
    const tokenAfter = sourceCode.getTokenAfter(comment);
    let start = comment.loc.start.line;
    let end = comment.loc.end.line;
    if (tokenBefore && isTokenOnSameLine(tokenBefore, comment)) start += 1;
    if (tokenAfter && isTokenOnSameLine(comment, tokenAfter)) end -= 1;
    for (let line = start; line <= end; line += 1) commentOnlyLines.add(line);
  }
  return commentOnlyLines;
}

export const maxLinesPerFunction = {
  meta: {
    type: 'suggestion',
    schema: [
      {
        oneOf: [
          {
            type: 'object',
            properties: {
              max: { type: 'integer', minimum: 0 },
              skipComments: { type: 'boolean' },
              skipBlankLines: { type: 'boolean' },
              IIFEs: { type: 'boolean' },
            },
            additionalProperties: false,
          },
          { type: 'integer', minimum: 1 },
        ],
      },
    ],
    messages: {
      exceed: '{{name}} has too many lines ({{lineCount}}). Maximum allowed is {{maxLines}}.',
    },
  },
  /** @param {any} context */
  create(context) {
    const sourceCode = context.sourceCode;
    const lines = sourceCode.lines;
    const option = context.options[0];
    let maxLines = 50;
    let skipComments = false;
    let skipBlankLines = false;
    let IIFEs = false;
    if (typeof option === 'object' && option !== null) {
      maxLines = typeof option.max === 'number' ? option.max : 50;
      skipComments = !!option.skipComments;
      skipBlankLines = !!option.skipBlankLines;
      IIFEs = !!option.IIFEs;
    } else if (typeof option === 'number') {
      maxLines = option;
    }
    const commentOnlyLines = skipComments ? getCommentOnlyLines(sourceCode) : new Set();

    /** @param {any} node */
    const isIIFE = (node) =>
      (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') &&
      node.parent &&
      node.parent.type === 'CallExpression' &&
      node.parent.callee === node;

    /** @param {any} node */
    const isEmbedded = (node) => {
      if (!node.parent || node !== node.parent.value) return false;
      if (node.parent.type === 'MethodDefinition') return true;
      if (node.parent.type === 'Property') {
        return (
          node.parent.method === true || node.parent.kind === 'get' || node.parent.kind === 'set'
        );
      }
      return false;
    };

    /** @param {any} funcNode */
    const processFunction = (funcNode) => {
      const node = isEmbedded(funcNode) ? funcNode.parent : funcNode;
      if (!IIFEs && isIIFE(node)) return;
      let lineCount = 0;
      for (let i = node.loc.start.line - 1; i < node.loc.end.line; i += 1) {
        if (skipComments && commentOnlyLines.has(i + 1)) continue;
        if (skipBlankLines && /^\s*$/u.test(lines[i])) continue;
        lineCount += 1;
      }
      if (lineCount > maxLines) {
        context.report({
          node,
          loc: getFunctionHeadLoc(funcNode, sourceCode),
          messageId: 'exceed',
          data: {
            name: upperCaseFirst(getFunctionNameWithKind(funcNode)),
            lineCount: String(lineCount),
            maxLines: String(maxLines),
          },
        });
      }
    };
    return {
      FunctionDeclaration: processFunction,
      FunctionExpression: processFunction,
      ArrowFunctionExpression: processFunction,
    };
  },
};
