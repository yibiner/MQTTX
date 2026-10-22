import type { VariableProvider, VariableValue } from '../types'

/**
 * The inline forms: `${count:3}` (a counter) and `${rssi:-30..-60}` (a random integer from a range).
 *
 * They are the last provider of the chain, so a name that is defined anywhere else keeps its value:
 * defining `count` as a client variable turns every `${count:1}` of that connection into that value
 * and leaves the counter untouched.
 *
 * The two forms are syntax, not a variable source - the name is free (`${seq:1000}` works just as
 * well), which is why they live in one provider that only reads the `config` part of a placeholder.
 */

const parseCounterInitialValue = (config: string): number | undefined => {
  const trimmed = config.trim()
  return /^-?\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : undefined
}

const parseRandomRange = (config: string): [number, number] | undefined => {
  const parts = config.split('..')
  if (parts.length !== 2) {
    return undefined
  }
  const a = Number.parseInt(parts[0].trim(), 10)
  const b = Number.parseInt(parts[1].trim(), 10)
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return undefined
  }
  return [Math.min(a, b), Math.max(a, b)]
}

const randomIntInRange = (min: number, max: number, rand: () => number): number =>
  min + Math.floor(rand() * (max - min + 1))

export const inlineVariablesProvider: VariableProvider = {
  id: 'inline',
  guide: [
    { name: '${count:1}', group: 'inline' },
    { name: '${rssi:-30..-60}', group: 'inline' },
  ],
  resolve: (request, context): VariableValue => {
    const config = request.config
    if (config === undefined) {
      return undefined
    }
    const range = parseRandomRange(config)
    if (range) {
      return randomIntInRange(range[0], range[1], context.rand)
    }
    const initial = parseCounterInitialValue(config)
    if (initial !== undefined) {
      // The stored value wins over the inline initial value, so a counter continues after a restart.
      const value = context.counters.read(request.name) ?? initial
      context.counters.stage(request.name, value + 1)
      return value
    }
    return undefined
  },
}
