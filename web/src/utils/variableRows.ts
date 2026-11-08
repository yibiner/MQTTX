import { validateVariableName, VariableNameIssue } from '@/utils/variables/registry'

/**
 * Conversion between the flat variable map stored on a connection and the rows the editor shows.
 *
 * Kept out of the component so the rules can be tested directly: which rows are saved, which are
 * still being typed (no name yet), which are rejected, and how a stateful definition is written
 * back without losing the fields the editor does not show.
 */

export interface VariableEditorRow {
  name: string
  kind: 'constant' | 'sequence'
  value: string
  initial: number
  step: number
  min: number
  max: number
  /**
   * Set for a definition this editor does not create (captured, random, choice, ...).
   * The kind stays whatever was stored. A captured row may still edit its fallback value.
   */
  locked?: boolean
  /** kind to show, and the kind written back, while `locked` is set */
  lockedKind?: VariableKind
  /** name this row had when it was loaded, so a rename still finds the stored definition */
  originName?: string
  /** filled by `rowsToVariables` so the editor can mark the row */
  issue?: VariableNameIssue
}

/** A stored value the editor does not offer to edit (random, choice, session, ...) is left as is. */
const isEditorSupported = (stored: StoredVariable): boolean =>
  typeof stored === 'string' || stored?.kind === undefined || stored?.kind === 'constant' || stored?.kind === 'sequence'

const rowFrom = (
  name: string,
  stored: StoredVariable,
  extra: Partial<VariableEditorRow> = {},
): VariableEditorRow => {
  const definition = typeof stored === 'string' ? undefined : stored
  return {
    name,
    kind: definition?.kind === 'sequence' ? 'sequence' : 'constant',
    value: typeof stored === 'string' ? stored : definition?.value ?? '',
    initial: definition?.initial ?? 0,
    step: definition?.step ?? 1,
    min: definition?.min ?? 0,
    max: definition?.max ?? 0,
    ...extra,
  }
}

export const variablesToRows = (variables: { [name: string]: StoredVariable } | null | undefined): VariableEditorRow[] => {
  const rows: VariableEditorRow[] = []
  Object.entries(variables ?? {}).forEach(([name, stored]) => {
    const definition = typeof stored === 'string' ? undefined : stored
    if (definition?.kind && !isEditorSupported(stored)) {
      rows.push(rowFrom(name, stored, { locked: true, lockedKind: definition.kind, originName: name }))
      return
    }
    rows.push(rowFrom(name, stored))
  })
  return rows
}

export interface RowsToVariablesResult {
  variables: { [name: string]: StoredVariable }
  /** rows whose name is taken or not usable as `${name}` */
  issues: Array<{ name: string; issue: VariableNameIssue }>
}

export const rowsToVariables = (
  rows: VariableEditorRow[],
  previous: { [name: string]: StoredVariable } | null | undefined = {},
): RowsToVariablesResult => {
  const variables: { [name: string]: StoredVariable } = {}
  const issues: RowsToVariablesResult['issues'] = []
  const taken: string[] = []

  rows.forEach((row) => {
    row.issue = undefined
    const name = (row.name ?? '').trim()
    if (!name) {
      // Still being typed: shown, not saved.
      return
    }
    const issue = validateVariableName(name, taken)
    if (issue) {
      row.issue = issue
      issues.push({ name, issue })
      return
    }
    taken.push(name)

    if (row.locked) {
      const source = (row.originName || name).trim()
      const existing = previous?.[source]
      if (existing !== undefined && !isEditorSupported(existing) && typeof existing === 'object') {
        // The fallback of a captured variable is the only field this editor writes.
        // Switching the row to a counter must not replace the stored kind.
        variables[name] = row.lockedKind === 'captured' ? { ...existing, value: row.value ?? '' } : existing
        return
      }
      if (existing !== undefined) {
        variables[name] = existing
      }
      return
    }

    if (row.kind === 'sequence') {
      const definition: VariableDefinitionConfig = {
        kind: 'sequence',
        initial: Number.isFinite(row.initial) ? row.initial : 0,
        step: Number.isFinite(row.step) ? row.step : 1,
      }
      if (Number.isFinite(row.min) && row.min !== 0) {
        definition.min = row.min
      }
      if (Number.isFinite(row.max) && row.max !== 0) {
        definition.max = row.max
      }
      variables[name] = definition as StoredVariable
      return
    }

    // A constant keeps whatever richer definition it already had (a value template, bounds, ...):
    // the editor only offers the plain string, so it must not drop the rest.
    const existing = previous?.[name]
    if (existing !== undefined && !isEditorSupported(existing)) {
      variables[name] = existing
      return
    }
    if (typeof existing === 'object' && existing !== null && existing.kind !== undefined && existing.kind !== 'constant') {
      variables[name] = existing
      return
    }
    variables[name] = row.value ?? ''
  })

  return { variables, issues }
}
