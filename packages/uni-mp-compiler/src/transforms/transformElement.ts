import {
  NodeTypes,
  ElementTypes,
  createCompilerError,
  ErrorCodes,
  ElementNode,
  isBindKey,
  TemplateLiteral,
  Property,
  ExpressionNode,
} from '@vue/compiler-core'

import { NodeTransform, TransformContext } from '../transform'

export interface DirectiveTransformResult {
  props: Property[]
  needRuntime?: boolean | symbol
  ssrTagParts?: TemplateLiteral['elements']
}

export const transformElement: NodeTransform = (node, context) => {
  return function postTransformElement() {
    node = context.currentNode!
    if (
      !(
        node.type === NodeTypes.ELEMENT &&
        (node.tagType === ElementTypes.ELEMENT ||
          node.tagType === ElementTypes.COMPONENT)
      )
    ) {
      return
    }

    const { props } = node
    if (props.length > 0) {
      processProps(node, context)
    }
  }
}

function processProps(node: ElementNode, context: TransformContext) {
  const { tag, props } = node
  const isComponent = node.tagType === ElementTypes.COMPONENT

  for (let i = 0; i < props.length; i++) {
    const prop = props[i]
    if (prop.type === NodeTypes.DIRECTIVE) {
      // directives
      const { name, arg, exp, loc } = prop
      const isVBind = name === 'bind'
      const isVOn = name === 'on'
      // skip v-slot - it is handled by its dedicated transform.
      if (name === 'slot') {
        if (!isComponent) {
          context.onError(
            createCompilerError(ErrorCodes.X_V_SLOT_MISPLACED, loc)
          )
        }
        continue
      }
      // skip v-once/v-memo - they are handled by dedicated transforms.
      if (name === 'once' || name === 'memo') {
        continue
      }
      // skip v-is and :is on <component>
      if (
        name === 'is' ||
        (isVBind && isBindKey(arg, 'is') && isComponentTag(tag))
      ) {
        continue
      }

      // special case for v-bind and v-on with no argument
      if (!arg && (isVBind || isVOn)) {
        if (exp) {
          if (isVOn) {
            context.onError(
              createCompilerError(ErrorCodes.X_V_ON_NO_EXPRESSION, loc)
            )
          }
        } else {
          context.onError(
            createCompilerError(
              isVBind
                ? ErrorCodes.X_V_BIND_NO_EXPRESSION
                : ErrorCodes.X_V_ON_NO_EXPRESSION,
              loc
            )
          )
        }
        continue
      }

      const directiveTransform = context.directiveTransforms[name]
      if (directiveTransform) {
        const { props } = directiveTransform(prop, node, context)
        prop.exp = props[0].value as ExpressionNode
      }
    }
  }
}

function isComponentTag(tag: string) {
  return tag[0].toLowerCase() + tag.slice(1) === 'component'
}