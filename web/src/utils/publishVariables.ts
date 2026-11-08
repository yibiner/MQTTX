import {
  collectUnresolvedVariables,
  connectionVariableOptions,
  createPayloadVariableResolver,
  payloadTypeSupportsVariables,
} from '@/utils/payloadVariables'

/**
 * Variable resolution for a manual publish, browser side.
 *
 * Same rules as the desktop build:
 *
 * - the topic is always checked, the payload only for payload types that support variables
 *   (a hex or base64 payload is not a template);
 * - the check does not advance counters, so a counter that appears in the message advances once -
 *   when the message is actually resolved for sending;
 * - one resolver handles the topic and the payload, so both see the same value and a counter used
 *   in both still advances once per message.
 *
 * What the browser build does differently is the surroundings, not the resolution: there is no
 * script/schema pipeline to run the resolved text through.
 */

export interface PublishVariableTexts {
  topic: string
  payload: string | Buffer | undefined
  type: PayloadType
}

/** Placeholders that cannot be resolved for this connection, in order of appearance. */
export const findUnresolvedForPublish = (
  connection: ConnectionModel | null | undefined,
  texts: PublishVariableTexts,
): string[] => {
  const options = connectionVariableOptions(connection)
  const sources = payloadTypeSupportsVariables(texts.type)
    ? [texts.topic, texts.payload as string]
    : [texts.topic]
  return collectUnresolvedVariables({}, sources, options)
}

export interface ResolvedPublishTexts {
  topic: string
  payload: string | undefined
  /** Persists counters. The publish path calls this after the broker accepts the message. */
  commit: () => void
}

/**
 * Resolves the topic and the payload of one outgoing message.
 *
 * Returns the texts unchanged when the payload type does not support variables: resolving a hex
 * payload would corrupt it (`${` inside a hex string is not a template).
 */
export const resolveForPublish = (
  connection: ConnectionModel | null | undefined,
  texts: PublishVariableTexts,
  options: { commit?: boolean } = {},
): ResolvedPublishTexts => {
  const variableOptions = connectionVariableOptions(connection)
  const payloadText = typeof texts.payload === 'string' ? texts.payload : undefined
  if (!texts.topic.includes('${') && (payloadText === undefined || !payloadText.includes('${'))) {
    return { topic: texts.topic, payload: payloadText, commit: () => undefined }
  }

  const resolver = createPayloadVariableResolver(variableOptions)
  const topic = resolver.resolve(texts.topic)
  let payload: string | undefined
  if (typeof texts.payload === 'string' && payloadTypeSupportsVariables(texts.type)) {
    payload = resolver.resolve(texts.payload)
  } else if (typeof texts.payload === 'string') {
    payload = texts.payload
  }
  // One commit for both, so a counter that appears in topic and payload advances once.
  // Callers that publish can pass `commit: false` and run it only after the broker accepts.
  const commit = () => resolver.commit()
  if (options.commit !== false) {
    commit()
  }

  return { topic, payload, commit }
}
