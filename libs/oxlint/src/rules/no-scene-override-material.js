/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('eslint').Rule.RuleContext} RuleContext
 * @typedef {import('estree').AssignmentExpression} AssignmentExpression
 * @typedef {import('estree').MemberExpression} MemberExpression
 * @typedef {import('estree').Node} Node
 */

/**
 * Identifiers whose name signals a three.js `Scene`-like receiver. Matched
 * case-insensitively as a substring so `scene`, `Scene`, `mainScene`,
 * `someScene`, `overlayScene` etc. are all flagged. Member-access receivers
 * like `this.scene`, `state.scene`, and `useThree().scene` are matched via the
 * member-expression's terminal property name.
 */
const SCENE_NAME_PATTERN = /scene/i;

/**
 * @param {Node | null | undefined} node
 * @returns {boolean}
 */
function isSceneScope(node) {
  if (node === null || node === undefined) {
    return false;
  }
  if (node.type === 'Identifier') {
    return SCENE_NAME_PATTERN.test(node.name);
  }
  if (node.type === 'MemberExpression') {
    const { property } = node;
    if (property.type === 'Identifier') {
      return SCENE_NAME_PATTERN.test(property.name);
    }
  }
  return false;
}

/**
 * @param {Node | null | undefined} node
 * @returns {node is MemberExpression}
 */
function isOverrideMaterialMember(node) {
  if (node === null || node === undefined) {
    return false;
  }
  if (node.type !== 'MemberExpression') {
    return false;
  }
  const { property, computed } = node;
  if (computed) {
    return false;
  }
  if (property.type !== 'Identifier') {
    return false;
  }
  return property.name === 'overrideMaterial';
}

/** @type {RuleModule} */
export const noSceneOverrideMaterialRule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Disallow `scene.overrideMaterial = ...` assignments under WebGPU. Use a `scene.traverse()` per-mesh ' +
        'material swap with per-source-material cached clones (see docs/policy/webgpu-shader-and-pipeline-policy.md rule 1) ' +
        'or a composite-quad depth write for post-processing pipelines.',
    },
    messages: {
      noSceneOverrideMaterial:
        'Avoid `scene.overrideMaterial`; the assignment shares one material across diverse geometry ' +
        'attribute layouts and triggers `Vertex buffer slot N required` validation errors on WebGPU. ' +
        'See docs/policy/webgpu-shader-and-pipeline-policy.md rule 1.',
    },
    schema: [],
  },

  create(context) {
    return {
      /** @param {AssignmentExpression} node */
      AssignmentExpression(node) {
        if (node.operator !== '=') {
          return;
        }
        const { left } = node;
        if (!isOverrideMaterialMember(left)) {
          return;
        }
        if (!isSceneScope(left.object)) {
          return;
        }

        const { parent } = /** @type {{ parent?: Node }} */ (/** @type {unknown} */ (node));
        const isStatementForm = parent !== undefined && parent.type === 'ExpressionStatement';

        context.report({
          node,
          messageId: 'noSceneOverrideMaterial',
          fix: isStatementForm
            ? (fixer) =>
                fixer.replaceText(
                  /** @type {Node} */ (parent),
                  '// TODO(webgpu-shader-and-pipeline-policy): replace with traverse-and-swap or composite-quad depth write',
                )
            : undefined,
        });
      },
    };
  },
};
