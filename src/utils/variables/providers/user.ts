import type { VariableProvider } from '../types'

/**
 * The variables the user defined: client variables of a connection, global variables of the preset
 * manager and the fields of the connection, already merged into one map by the caller (closest
 * scope first).
 *
 * A value may reference further placeholders (`device = PLC-${line}`), which is why this provider
 * is `nested`: the resolver expands the string with the full chain, so a value can use a built-in
 * variable, a counter, or even a field of the received message (`reply = ${msg.msgId}`).
 *
 * An empty value counts as "not defined" and falls through to the next provider / inline form, so a
 * connection can leave a variable blank to inherit the global one.
 */
export const userVariablesProvider: VariableProvider = {
  id: 'user',
  nested: true,
  resolve: (request, context) => {
    const value = context.variables[request.name]
    if (value === undefined || value.trim() === '') {
      return undefined
    }
    return value
  },
}
