import { expect } from 'chai'
import { EventEmitter } from 'events'
import type { MqttClient } from 'mqtt'
import {
  attachAutoReply,
  detachAutoReply,
  onAutoReplyPublished,
  registerAutoReply,
  unregisterAutoReply,
} from '@/utils/autoReplyEngine'

/** The engine only needs the EventEmitter surface of the client. */
const createClient = () => new EventEmitter() as unknown as MqttClient

describe('autoReplyEngine client lifecycle', () => {
  it('keeps one message listener when the same client is attached again', () => {
    const client = createClient()
    attachAutoReply(client, 'conn-1')
    attachAutoReply(client, 'conn-1')
    expect(client.listenerCount('message')).to.equal(1)

    detachAutoReply(client)
    expect(client.listenerCount('message')).to.equal(0)
    // Detaching twice must not throw.
    detachAutoReply(client)
  })

  it('removes the listener of a deleted connection', () => {
    const client = createClient()
    attachAutoReply(client, 'conn-2')

    unregisterAutoReply('conn-2')
    expect(client.listenerCount('message')).to.equal(0)
  })

  it('removes the listener when the client ends', () => {
    const client = createClient()
    attachAutoReply(client, 'conn-3')

    client.emit('end')
    expect(client.listenerCount('message')).to.equal(0)
  })

  it('keeps the listener across a close, because mqtt.js reconnects the same client', () => {
    const client = createClient()
    attachAutoReply(client, 'conn-4')

    client.emit('close')
    expect(client.listenerCount('message')).to.equal(1)
    detachAutoReply(client)
  })
})

describe('autoReplyEngine answers through the client, not through a page', () => {
  /** A client stub: the engine only needs `connected`, `publish()` and the event surface. */
  const createPublishingClient = (published: Array<{ topic: string; payload: string }>) => {
    const client = Object.assign(new EventEmitter(), {
      connected: true,
      publish: (topic: string, payload: string, _options: unknown, callback: (error?: Error) => void) => {
        published.push({ topic, payload })
        callback()
      },
    })
    return client as unknown as MqttClient
  }

  const rule = (id: string, condition: string): AutoReplyRuleModel => ({
    id,
    name: id,
    enabled: true,
    matchTopic: 'app/+/+/device/system/post',
    matchCondition: condition,
    reply: {
      topic: 'app/device/system/reply',
      mode: 'fixed',
      payload: '{"code":0}',
      qos: 0,
      retain: false,
      delayMs: 0,
    },
  })

  afterEach(() => {
    unregisterAutoReply('conn-reply')
  })

  it('publishes the reply of a message received on the client', async () => {
    // This is the whole point of attaching the rules to the client: the message is answered with no
    // connection page mounted anywhere.
    const published: Array<{ topic: string; payload: string }> = []
    const client = createPublishingClient(published)
    registerAutoReply('conn-reply', {
      id: 'conn-reply',
      autoReplies: [rule('rule-reply', "cmd == 'PING'")],
    } as ConnectionModel)
    attachAutoReply(client, 'conn-reply')

    client.emit('message', 'app/A1/AF0201/device/system/post', Buffer.from('{"cmd":"PING"}'), { messageId: 1 })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(published).to.deep.equal([{ topic: 'app/device/system/reply', payload: '{"code":0}' }])
  })
})

describe('autoReplyEngine tells the view about the replies it published', () => {
  const rule = (id: string, delayMs: number): AutoReplyRuleModel => ({
    id,
    name: id,
    enabled: true,
    matchTopic: 'app/+/+/device/system/post',
    matchCondition: "cmd == 'PING'",
    reply: {
      topic: 'app/device/system/reply',
      mode: 'fixed',
      payload: '{"code":0}',
      qos: 0,
      retain: false,
      delayMs,
    },
  })

  const createPublishingClient = () => {
    const client = Object.assign(new EventEmitter(), {
      connected: true,
      publish: (topic: string, payload: string, _options: unknown, callback: (error?: Error) => void) => {
        published.push({ topic, payload })
        callback()
      },
    })
    return client as unknown as MqttClient
  }
  let published: Array<{ topic: string; payload: string }> = []

  beforeEach(() => {
    published = []
  })

  afterEach(() => {
    unregisterAutoReply('conn-published')
  })

  it('notifies with the connection and the outgoing message, so the conversation can render it', async () => {
    const notified: Array<{ connectionId: string; message: MessageModel }> = []
    const unsubscribe = onAutoReplyPublished((connectionId, message) => notified.push({ connectionId, message }))
    try {
      registerAutoReply('conn-published', {
        id: 'conn-published',
        autoReplies: [rule('immediate', 0)],
      } as ConnectionModel)
      const client = createPublishingClient()
      attachAutoReply(client, 'conn-published')

      client.emit('message', 'app/A1/AF0201/device/system/post', Buffer.from('{"cmd":"PING"}'), { messageId: 7 })
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(notified).to.have.lengthOf(1)
      expect(notified[0].connectionId).to.equal('conn-published')
      expect(notified[0].message.out).to.equal(true)
      expect(notified[0].message.topic).to.equal('app/device/system/reply')
      expect(notified[0].message.payload).to.equal('{"code":0}')
    } finally {
      unsubscribe()
    }
  })

  it('notifies a delayed reply only when the delay has passed', async () => {
    const notified: MessageModel[] = []
    const unsubscribe = onAutoReplyPublished((_connectionId, message) => notified.push(message))
    try {
      registerAutoReply('conn-published', {
        id: 'conn-published',
        autoReplies: [rule('delayed', 120)],
      } as ConnectionModel)
      const client = createPublishingClient()
      attachAutoReply(client, 'conn-published')

      client.emit('message', 'app/A1/AF0201/device/system/post', Buffer.from('{"cmd":"PING"}'), { messageId: 8 })
      await new Promise((resolve) => setTimeout(resolve, 40))
      expect(notified).to.have.lengthOf(0)
      expect(published).to.have.lengthOf(0)

      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(published).to.have.lengthOf(1)
      expect(notified).to.have.lengthOf(1)
    } finally {
      unsubscribe()
    }
  })
})
