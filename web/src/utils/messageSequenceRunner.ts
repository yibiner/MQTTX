import { matchesAutoReplyRule } from '@/utils/autoReply'
import { connectionVariableOptions } from '@/utils/connectionVariables'
import { parseJsonKeepingBigIntegers } from '@/utils/jmesPathCondition'
import { applyAutoReplyVariableActions, createPayloadVariableResolver } from '@/utils/payloadVariables'
import { peekDefinitionValue } from '@/utils/variables/state'

/**
 * Message sequences for the browser build ("消息序列").
 *
 * A sequence is an ordered list of steps sent after each other, with a delay between them; a device
 * can be replayed with it (boot -> ready -> heartbeat). The parts that are shared with the desktop
 * build stay shared: the step model, the variable resolution, and the topic/condition matching that
 * decides a message-triggered start (`matchesAutoReplyRule`).
 *
 * The guards below are the desktop ones, kept because the reasons are not desktop specific:
 *
 * - more than 20 steps in one second means a delay-0 loop is spinning, so the run stops;
 * - a sequence must not be retriggered by the echo of its own publish, so what a run just sent is
 *   ignored as an incoming message for a moment (per sequence, not per connection: a sibling
 *   sequence still gets to match);
 * - a step delay above 2^31-1 ms would be treated as 1 ms by `setTimeout`, so it is clamped.
 *
 * Browser-specific: a run only lives while the page is open. Nothing is resumed after a reload.
 */

/** More than this many steps in one second means a delay-0 loop is spinning. Stop it. */
export const MAX_STEPS_PER_SECOND = 20
/** setTimeout treats a delay above this as 1ms, which would fire a long step immediately. */
export const MAX_DELAY_MS = 2147483647
/** How long the echo of a sequence's own publish is ignored, so it cannot retrigger itself. */
export const OWN_PUBLISH_TTL_MS = 5000

export interface SequencePublish {
  sequenceId: string
  stepId: string
  topic: string
  payload: string
  qos: QoS
  retain: boolean
}

const isPromise = <T>(value: T | Promise<T>): value is Promise<T> =>
  typeof (value as Promise<T> | undefined)?.then === 'function'

export interface MessageSequenceRunnerOptions {
  connection: ConnectionModel
  /**
   * A promise is waited on. Counters and step assignments are written only after the broker
   * accepts the step, and the next step starts only then. A synchronous publish is treated as
   * already accepted, which is what the unit tests use.
   */
  publish: (message: SequencePublish) => void | Promise<void>
  /** a sequence stopped because it cannot run (bad template, non-numeric stop variable, spin) */
  onStopped?: (sequenceId: string, reason: string) => void
  /** a run started or ended, so the UI can show it */
  onRunChanged?: (sequenceId: string, running: boolean) => void
  now?: () => number
}

export interface MessageSequenceRunner {
  /** starts every enabled `connect`-triggered sequence, from its first step */
  startOnConnect: () => void
  /** starts one sequence by id; returns false when the sequence cannot run */
  start: (sequenceId: string) => boolean
  stop: (sequenceId: string) => void
  /** stops everything and returns how many runs were stopped */
  stopAll: () => number
  /** call for every incoming message; starts the `message`-triggered sequences that match */
  handleIncoming: (topic: string, payload: string) => void
  /** ids of the sequences currently running */
  runningIds: () => string[]
  dispose: () => void
}

/** A sequence is matched as if it were a reply rule: same topic filter, same JMESPath condition. */
const asRule = (sequence: MessageSequenceModel): AutoReplyRuleModel => ({
  id: sequence.id,
  name: sequence.name ?? '',
  enabled: sequence.enabled !== false,
  matchTopic: sequence.matchTopic ?? '',
  matchCondition: sequence.matchCondition ?? '',
  reply: { topic: '', mode: 'fixed', payload: '', qos: 0, retain: false, delayMs: 0 },
})

const compareStop = (op: MessageSequenceCompare, current: number, target: number): boolean => {
  switch (op) {
    case 'lt':
      return current < target
    case 'lte':
      return current <= target
    case 'gt':
      return current > target
    case 'gte':
      return current >= target
    case 'eq':
      return current === target
    default:
      return false
  }
}

interface RunState {
  timer: ReturnType<typeof setTimeout> | null
  stepIndex: number
  /** timestamps of recent steps, for the spin guard */
  fires: number[]
  /** the message that started a message-triggered run; later steps still read this one */
  message?: { topic: string; payload: unknown }
  generation: number
}

export const createMessageSequenceRunner = (options: MessageSequenceRunnerOptions): MessageSequenceRunner => {
  const { connection, publish, onStopped, onRunChanged } = options
  const now = options.now ?? (() => Date.now())

  const runs = new Map<string, RunState>()
  /** "sequenceId|topic|payload" of what a run just published, so its echo is ignored */
  const ownPublishes = new Map<string, number>()
  let generationSeed = 0
  let disposed = false

  const sequences = (): MessageSequenceModel[] => (Array.isArray(connection.messageSequences) ? connection.messageSequences : [])

  const findSequence = (sequenceId: string): MessageSequenceModel | undefined =>
    sequences().find((sequence) => sequence.id === sequenceId)

  const stopRun = (sequenceId: string) => {
    const run = runs.get(sequenceId)
    if (!run) {
      return false
    }
    if (run.timer) {
      clearTimeout(run.timer)
    }
    runs.delete(sequenceId)
    if (onRunChanged) {
      onRunChanged(sequenceId, false)
    }
    return true
  }

  const stop = (sequenceId: string) => {
    stopRun(sequenceId)
  }

  const stopAll = (): number => {
    const ids = [...runs.keys()]
    ids.forEach((id) => stopRun(id))
    return ids.length
  }

  /** Whether the loop of this sequence should stop before the next round. */
  const shouldStopLoop = (sequence: MessageSequenceModel): boolean => {
    const stopWhen = sequence.stopWhen
    const name = (stopWhen?.variable ?? '').trim()
    if (!stopWhen || !name) {
      return false
    }
    const definition = connectionVariableOptions(connection).definitions[name]
    const current = definition ? peekDefinitionValue(definition) : undefined
    const numeric = typeof current === 'number' ? current : Number(String(current ?? '').trim())
    if (!Number.isFinite(numeric)) {
      if (onStopped) {
        onStopped(sequence.id, `"${name}" is not a number`)
      }
      return true
    }
    const target = Number(stopWhen.value)
    return Number.isFinite(target) ? compareStop(stopWhen.op, numeric, target) : false
  }

  /**
   * Resolves one step and publishes it.
   *
   * `false` (with `reason`) means the run has to stop before anything is sent. On success the
   * counters and the step's variable assignments are applied, then the following step is
   * scheduled. A publish promise delays that until the broker accepts the message, so a rejected
   * publish does not consume a counter or move a captured variable.
   */
  const publishStep = (
    sequence: MessageSequenceModel,
    run: RunState,
    step: MessageSequenceStepModel,
    stamp: number,
  ): { ok: true } | { ok: false; reason: string } => {
    const variableOptions = connectionVariableOptions(connection)
    const resolver = createPayloadVariableResolver({
      ...variableOptions,
      ...(run.message ? { message: run.message.payload, topic: run.message.topic } : {}),
    })
    const topic = resolver.resolve(step.topic ?? '').trim()
    const payload = resolver.resolve(step.payload ?? '')
    const setVariables = (step.actions?.setVariables ?? [])
      .map((item) => ({ name: String(item?.name ?? '').trim(), value: resolver.resolve(item?.value ?? '') }))
      .filter((item) => item.name !== '')

    if (!topic) {
      return { ok: false, reason: 'a step has no topic' }
    }
    if (resolver.unresolved.length) {
      return { ok: false, reason: `unresolved variables ${resolver.unresolved.join(', ')}` }
    }
    const missing = setVariables.find((item) => !variableOptions.definitions[item.name]?.stateKey)
    if (missing) {
      return { ok: false, reason: `"${missing.name}" cannot be assigned` }
    }

    const finish = () => {
      const current = runs.get(sequence.id)
      if (disposed || !current || current.generation !== run.generation) {
        return
      }
      resolver.commit()
      applyAutoReplyVariableActions(connection, {
        resetVariables: step.actions?.resetVariables,
        setVariables,
      })
      current.fires.push(stamp)
      current.stepIndex += 1
      scheduleNext(sequence, current, step.delayMs ?? 0, current.generation)
    }

    const fail = (reason: string) => {
      const current = runs.get(sequence.id)
      if (disposed || !current || current.generation !== run.generation) {
        return
      }
      if (onStopped) {
        onStopped(sequence.id, reason)
      }
      stopRun(sequence.id)
    }

    // Mark before the publish leaves. A local broker can deliver the echo inside the callback,
    // which is before this function hears about success.
    ownPublishes.set(`${sequence.id}|${topic}|${payload}`, stamp)
    let result: void | Promise<void>
    try {
      result = publish({
        sequenceId: sequence.id,
        stepId: step.id,
        topic,
        payload,
        qos: (step.qos ?? 0) as QoS,
        retain: Boolean(step.retain),
      })
    } catch (error) {
      return { ok: false, reason: 'the step could not be published' }
    }
    if (isPromise(result)) {
      result.then(finish, () => fail('the step could not be published'))
      return { ok: true }
    }
    finish()
    return { ok: true }
  }

  const scheduleNext = (sequence: MessageSequenceModel, run: RunState, delayMs: number, generation: number) => {
    const wait = Math.min(Math.max(0, delayMs), MAX_DELAY_MS)
    run.timer = setTimeout(() => {
      // A newer run of the same sequence (or a stop) wins over this timer.
      const current = runs.get(sequence.id)
      if (disposed || !current || current.generation !== generation) {
        return
      }
      current.timer = null
      advance(sequence, current)
    }, wait)
  }

  const advance = (sequence: MessageSequenceModel, run: RunState) => {
    const steps = Array.isArray(sequence.steps) ? sequence.steps : []
    if (!steps.length) {
      stopRun(sequence.id)
      return
    }
    if (run.stepIndex >= steps.length) {
      // One round finished: loop or stop.
      if (!sequence.loop) {
        stopRun(sequence.id)
        return
      }
      if (shouldStopLoop(sequence)) {
        stopRun(sequence.id)
        return
      }
      run.stepIndex = 0
    }

    const stamp = now()
    run.fires = run.fires.filter((item) => stamp - item < 1000)
    if (run.fires.length >= MAX_STEPS_PER_SECOND) {
      if (onStopped) {
        onStopped(sequence.id, 'more than 20 steps in one second')
      }
      stopRun(sequence.id)
      return
    }

    const step = steps[run.stepIndex]
    if (!step) {
      stopRun(sequence.id)
      return
    }

    const sent = publishStep(sequence, run, step, stamp)
    if (!sent.ok) {
      if (onStopped) {
        onStopped(sequence.id, sent.reason)
      }
      stopRun(sequence.id)
    }
  }

  const start = (sequenceId: string, message?: { topic: string; payload: unknown }): boolean => {
    if (disposed) {
      return false
    }
    const sequence = findSequence(sequenceId)
    if (!sequence || sequence.enabled === false) {
      return false
    }
    stopRun(sequenceId)
    const run: RunState = {
      timer: null,
      stepIndex: 0,
      fires: [],
      generation: ++generationSeed,
      message,
    }
    runs.set(sequenceId, run)
    if (onRunChanged) {
      onRunChanged(sequenceId, true)
    }
    advance(sequence, run)
    return true
  }

  return {
    startOnConnect: () => {
      sequences()
        .filter((sequence) => sequence && sequence.enabled !== false && sequence.trigger === 'connect')
        .forEach((sequence) => start(sequence.id))
    },
    start: (sequenceId) => start(sequenceId),
    stop,
    stopAll,
    handleIncoming: (topic, payload) => {
      if (disposed || !topic) {
        return
      }
      const current = now()
      ownPublishes.forEach((stamp, key) => {
        if (current - stamp >= OWN_PUBLISH_TTL_MS) {
          ownPublishes.delete(key)
        }
      })
      const candidates = sequences().filter(
        (sequence) => sequence && sequence.enabled !== false && sequence.trigger === 'message',
      )
      if (!candidates.length) {
        return
      }
      // The echo of what this very sequence just sent must not retrigger it.
      const incoming = candidates.filter((sequence) => {
        const stamp = ownPublishes.get(`${sequence.id}|${topic}|${payload}`)
        if (stamp === undefined) {
          return true
        }
        return now() - stamp >= OWN_PUBLISH_TTL_MS
      })
      if (!incoming.length) {
        return
      }

      let parsed: unknown
      try {
        // Keep integers JSON.parse cannot represent, so a step that echoes `${msg.msgId}` sends
        // the digits the device sent.
        parsed = parseJsonKeepingBigIntegers(payload)
      } catch (error) {
        parsed = undefined
      }

      const variableOptions = connectionVariableOptions(connection)
      incoming.forEach((sequence) => {
        const result = matchesAutoReplyRule(asRule(sequence), {
          topic,
          payload,
          definitions: variableOptions.definitions,
          connectionId: variableOptions.connectionId,
        })
        if (result.matched) {
          start(sequence.id, { topic, payload: parsed })
        }
      })
    },
    runningIds: () => [...runs.keys()],
    dispose: () => {
      disposed = true
      stopAll()
      ownPublishes.clear()
    },
  }
}
