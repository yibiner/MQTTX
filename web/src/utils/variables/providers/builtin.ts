import { v4 as uuidv4 } from 'uuid'
import time from '@/utils/time'
import type { VariableGuideEntry, VariableProvider, VariableValue } from '../types'

/**
 * The built-in variables: time and a fresh UUID.
 *
 * Their names are the only reserved ones of the system, so a user variable can never shadow them -
 * a payload that sends `${timestamp}` must keep meaning "the time of sending", whatever somebody
 * typed into the variable editor. Every built-in is a data row: its name, its value for one
 * message, and how it is shown in the variable guide. Adding another one is a one-line addition,
 * and the name validation and the guide pick it up automatically.
 */
export interface BuiltinVariableDefinition {
  name: string
  /** the value for the moment the message is sent; the same `now` is used by every placeholder */
  value: (now: Date) => VariableValue
}

export const BUILTIN_VARIABLES: BuiltinVariableDefinition[] = [
  { name: 'timestamp', value: (now: Date): VariableValue => now.getTime() },
  { name: 'ts', value: (now: Date): VariableValue => now.getTime() },
  { name: 'timestampSec', value: (now: Date): VariableValue => Math.floor(now.getTime() / 1000) },
  { name: 'datetime', value: (now: Date): VariableValue => time.toFormat(now).slice(0, 19) },
  { name: 'date', value: (now: Date): VariableValue => time.toFormat(now).slice(0, 10) },
  { name: 'time', value: (now: Date): VariableValue => time.toFormat(now).slice(11, 19) },
  { name: 'iso', value: (now: Date): VariableValue => now.toISOString() },
  { name: 'uuid', value: (): VariableValue => uuidv4() },
]

const BUILTIN_BY_NAME = new Map(BUILTIN_VARIABLES.map((variable) => [variable.name, variable]))

export const BUILTIN_VARIABLE_NAMES: readonly string[] = BUILTIN_VARIABLES.map((variable) => variable.name)

const guide: VariableGuideEntry[] = BUILTIN_VARIABLES.map((variable) => ({
  name: '${' + variable.name + '}',
  group: 'builtin',
}))

export const builtinVariablesProvider: VariableProvider = {
  id: 'builtin',
  reserved: true,
  names: BUILTIN_VARIABLE_NAMES,
  guide,
  resolve: (request, context) => BUILTIN_BY_NAME.get(request.name)?.value(context.now),
}
