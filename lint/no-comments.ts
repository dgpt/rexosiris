const DIRECTIVES = ['@ts-expect-error', 'oxlint-', 'eslint-']

type Comment = { readonly type: string; readonly value: string }
type Context = {
  readonly sourceCode?: { getAllComments?: () => readonly Comment[] }
  report: (problem: { node: Comment; messageId: string }) => void
}

export const isDirective = (comment: Comment) =>
  comment.type === 'Shebang' || DIRECTIVES.some((marker) => comment.value.trimStart().startsWith(marker))

const noComments = {
  meta: {
    type: 'problem',
    messages: {
      comment:
        'Comment: delete it. Prose is the one thing no gate here reads, so it rots into a lie while everything stays green. Make the fact a name, a type, a constant or a test name instead.',
    },
  },
  create(context: Context) {
    return {
      Program() {
        for (const comment of context.sourceCode?.getAllComments?.() ?? []) {
          if (!isDirective(comment)) context.report({ node: comment, messageId: 'comment' })
        }
      },
    }
  },
}

export default { meta: { name: 'rhythm' }, rules: { 'no-comments': noComments } }
