import lodashGet from 'lodash/get'
import type { VariableProvider } from '../types'

/**
 * The variables the received message answers: `${msg.<path>}` and `${topic}`.
 *
 * This was a separate pre-pass over the template (a regex that replaced `${msg.x}` and left the
 * rest to the variable resolver), which had three consequences: a `${msg.x}` inside a user
 * variable value was not expanded, `${msg.list[0].id * 2}` and `${msg.list[0].id}` used different
 * lookup rules, and the template was scanned twice. As a provider of the regular chain, the same
 * single pass now resolves both:
 *
 *     ${msg.msgId}   ${msg.data.list[0].id}   ${msg.sensor-1}   ${topic}   ${msg.ts - 34000}
 *
 * A path without whitespace is a field path, exactly as before: `${msg.sensor-1}` is the field
 * named `sensor-1`, not "the field sensor minus one". Arithmetic keeps its spaces
 * (`${msg.ts - 34000}`) or lives on plain variables (`${ts-34000}`).
 */
const MESSAGE_PATH = /^msg(?:\.[^\s{}]+)?$/

/**
 * A path that contains one of these is more likely an expression without spaces
 * (`${msg.list[0].id*2}`) than a field name. `-` is left out on purpose: `${msg.sensor-1}` is the
 * field named `sensor-1`.
 */
const EXPRESSION_LIKE_PATH = /[*/%+()]/

export const messageVariablesProvider: VariableProvider = {
  id: 'message',
  names: ['topic'],
  prefixes: ['msg'],
  guide: [
    { name: '${msg.<path>}', group: 'context' },
    { name: '${topic}', group: 'context' },
  ],
  resolve: (request, context) => {
    // `${msg:1}` / `${topic:1}` are inline forms (a counter named `msg`/`topic`), not message refs.
    if (request.config !== undefined) {
      return undefined
    }
    if (request.name === 'topic') {
      // No topic in this context (a plain publish): let a user variable named `topic` answer.
      return context.topic
    }
    if (!MESSAGE_PATH.test(request.name)) {
      return undefined
    }
    // Without a reply context, a user variable named `msg` may still be defined (a plain publish).
    if (!context.messageContext) {
      return undefined
    }
    // A reply whose payload was not JSON still renders every field as empty, as the old pre-pass did.
    if (context.message === undefined) {
      return ''
    }
    const path = request.name === 'msg' ? '' : request.name.slice('msg.'.length)
    const value = path ? lodashGet(context.message, path) : context.message
    if (value !== undefined && value !== null) {
      // A primitive keeps the shape the old pre-pass produced: String(number), so `"${msg.ts}"`
      // stays a JSON string. Objects/arrays are stringified as JSON by the resolver. Arithmetic
      // still works, because an expression parses the numeric text of an identifier.
      return typeof value === 'object' ? value : String(value)
    }
    if (EXPRESSION_LIKE_PATH.test(path)) {
      // Not a field: let the resolver evaluate it as arithmetic. If that fails it is reported as
      // unresolved, which is better than silently answering an empty string.
      return undefined
    }
    // A field a message does not carry renders as an empty string, like before: an optional field
    // of a device must not stop a reply.
    return ''
  },
}
