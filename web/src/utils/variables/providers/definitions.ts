import type { VariableProvider } from '../types'

/**
 * The user-defined variables that carry a definition (a constant or one of the stateful kinds).
 *
 * A constant keeps the original behavior: its value may reference other placeholders and is expanded
 * by the resolver. A stateful variable asks the state sink for its current value; the sink also
 * stages the value the next send starts from, and the resolver persists it only when the message
 * was built successfully (a probe or the automation-dialog preview never advances a counter).
 *
 * The definitions come from the caller: `connectionVariables()` merges the client variables of the
 * connection with the global variables of the preset manager and attaches the state key of each
 * scope, so the same provider serves both a per-connection value and a global shared value.
 */
export const definitionsVariablesProvider: VariableProvider = {
  id: 'definitions',
  nested: true,
  resolve: (request, context) => {
    const definition = context.definitions?.[request.name]
    if (!definition) {
      return undefined
    }
    if (definition.kind === 'constant') {
      // An empty constant stays "not defined", so a global definition can win over a blank client one.
      return definition.value === undefined || definition.value === '' ? undefined : definition.value
    }
    return context.variableState?.read(definition)
  },
}
