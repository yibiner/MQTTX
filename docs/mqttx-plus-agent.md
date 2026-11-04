# MQTTX Plus — notes for an AI agent

You are reading this because a human wants you to operate the MQTT connection that is currently
open in the MQTTX Plus desktop app, instead of opening your own MQTT client.

This file states what you may do, what the app keeps, and where the sharp edges are. It is the
machine-facing companion to [`mqttx-plus-features.md`](./mqttx-plus-features.md), which is written
for people.

## The one rule

The running app owns the device. You are a remote control for it, not a second copy of it.

- Do **not** open your own MQTT connection to the broker.
- Do **not** re-create its subscriptions, variables, automatic replies or message sequences in your
  own process. The app already applies them, and a second copy makes every published message appear
  twice or with the wrong counter.
- Do **not** keep a local model of the device state. Read it with `get_connection` instead; it is
  cheap and always current.

If the app is not running or the bridge is off, say so and stop. Do not fall back to your own MQTT
client, because the human's verification then proves nothing.

## Getting the connection

The human turns on "暴露给本机 Agent" in the connection header. That panel gives you a config block:

```json
{
  "mcpServers": {
    "mqttx-plus": {
      "type": "http",
      "url": "http://127.0.0.1:21883/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

Add it to your local MCP client and connect. The port is between 21883 and 21892 depending on what
was free; always use the URL the human gave you rather than assuming a port. If your client only
speaks the older transport, use `type: "sse"` with the `/sse` URL from the same panel.

Then call `get_connection` and report back before doing anything else. You can only use a connection
the app has already connected. You cannot open one.

With one connection connected, `get_connection` returns that connection: name, broker, client id,
subscriptions, variables with current values, the rules it answers by itself, and its message
sequences. With several, it returns `{ connections: [...] }`. Pass `connectionId` on later calls.

## Tools

| tool | what it does | notes |
| --- | --- | --- |
| `get_connection` | connected connections | no id lists them; with one connected connection the result is that snapshot. Pass `connectionId` to read one of several. Does not connect |
| `publish` | send one message through a connected client | variables are filled from that connection. The connection on screen also runs its publish script and schema. Appears in that connection's message list marked Agent |
| `list_messages` | read recent messages | stored history plus what just arrived; filters: `topic`, `direction`, `contains`, `afterId`, `limit` |
| `wait_for_message` | wait for the next matching message | use instead of polling; `timeoutMs` default 10000, max 60000 |
| `start_sequence` | run a saved message sequence | by id or name; steps and delays stay in the app |
| `stop_sequence` | stop a running sequence | unsent steps are dropped |

`publish` replaces `${name}` placeholders using the connection's variables, the same way the publish
panel does. Send the template, not a value you computed yourself; the app's counters advance on send.

When the connection is the one on screen, the publish also passes through that page's script or data
schema, and the result is what reaches the broker. A script can drop or rewrite the message, so read
the error instead of assuming success. A connected connection that is not on screen is sent as UTF-8
text after variables are filled; its script is not applied.

### Reading messages

`list_messages` is independent of the human's screen. The direction tab, the topic filter, the search
box and the scroll position do not hide anything from you. It merges the app's stored history with
the messages the page just received, so a QoS 0 message the app chose not to store is still readable
while the page is open.

Messages are ordered by arrival. `afterId` returns only what came after that message; if the id is
older than the returned window, `cursorReset` is `true` and you got the newest page instead.

### Waiting

After a publish, call `wait_for_message` rather than looping on `list_messages`.

- Pass `afterId` of the last message you already handled. Without it, only messages arriving after
  the call count, which is usually what you want but loses a reply that came in while you were
  deciding.
- `matched: false` means the timeout expired. The connection is fine; read `list_messages` to see
  what did arrive.
- The app answers some commands by itself. Check `autoReplies` in `get_connection` before assuming
  a command must be followed by a reply you send.

## Staying on the right connection

Every tool accepts `connectionId`. Pass the id from `get_connection`.

The bridge can use every connection that is already connected, including ones that are not on screen.
Switching the page does not retarget your call and does not cancel a wait. When more than one is
connected, a call without `connectionId` fails and names the connected ones. A connection that is
not connected is refused. Do not ask the app to connect it, and do not open your own MQTT client.

## What you cannot do

- **Cannot change configuration.** Subscriptions, variables, automatic replies and sequence
  definitions are read-only for you. Starting or stopping a sequence is allowed; editing one is not.
- **Cannot open a connection.** Only a client the app has already connected can be published to,
  read, or used to start a sequence. Ask the human to connect it.
- **Cannot pick a payload format.** `publish` sends UTF-8 text. Hex, Base64, CBOR and MsgPack, and
  MQTT 5 properties are not available through the bridge. If the verification needs them, ask the
  human to send from the panel.
- **Cannot run on a remote machine.** The server binds `127.0.0.1` with a local bearer token; there
  is no TLS and no remote access.

## Limits worth knowing before you design a test

- `publish` is plain text and goes through the connection's variables and publish script/schema. If a
  script or schema is configured, it applies to your message too.
- `list_messages` returns at most 100 rows, default 30.
- `wait_for_message` waits at most 60 seconds per call. A sequence with longer delays needs several
  waits, or `list_messages` reading afterwards.
- Message sequences send their steps directly. Their payloads are not passed through a publish
  script or schema, so results can differ from what the same text produces from the panel.
- A sequence run publishes on its own schedule. Do not publish a step yourself in parallel: the
  app's run is authoritative, and duplicates will look like a bug in the device.
- Sequence delays are relative to the previous step, not absolute.
- A sequence that is already running is cancelled and restarted when `start_sequence` is called
  again. Its unsent steps are dropped.
- Disconnecting cancels unfinished sequence steps. They do not resume after a reconnect.
- Variables live per connection. Reading `get_connection` does not advance counters, so a snapshot
  cannot desynchronise what the app will send next.
- `${startAt}` (kind `runStart`) is written when a sequence on that connection starts and stays fixed
  for that run. It is `null` before the first run.

## Reporting back

When the human asks you to verify something, report:

1. Which connection you used: name, broker, client id, and whether it was connected.
2. What you sent, with the topic and the exact payload after the app filled in the variables.
3. What came back, with timestamps, and whether you got it by waiting or by reading.
4. Anything you could not do because of a limit above, stated plainly rather than worked around.

If a publish is refused, read the error before retrying. The usual causes are: the connection is not
connected, a `${name}` placeholder has no value on that connection, the publish script or schema
rejected the payload, or the connection changed under you.

## Errors you may see

| message | meaning | what to do |
| --- | --- | --- |
| `No connection is connected` / `No connected connection has id` | that client is offline, or none are | ask the human to connect; the agent cannot open a connection |
| `Unresolved variables: a, b` | no value for those placeholders on this connection | read `get_connection`; use names the connection actually defines, or ask the human |
| `The publish script or schema rejected the payload` | the configured transform refused it | change the payload or ask the human; the message was not sent |
| `connectionId is required when more than one connection is connected` | several clients are online and the call did not name one | pass `connectionId` from `get_connection` |
| `No message sequence named "..." on this connection` | wrong id or name | use the id from `get_connection` |
| `Open a connection in MQTTX Plus` | no connection page is open | ask the human to open the connection |
| `MQTTX Plus did not answer in time` | the page did not respond | ask the human to check the app window |
