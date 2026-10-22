# Payload variables

Every place a message is built from a template - the topic and payload of a publish, a timed
message, an automatic subscription topic, an automatic reply - goes through one variable system:

```
text ──scan──▶ ${name} | ${name:config} | ${body with an operator}
                    │
                    ▼
        provider chain (closest definition first)
          1. built-in variables          builtin     reserved, stateless (time, uuid)
          2. message / topic variables   message     only when the caller has a received message
             session variables           session     ${connectedAt} · ${sessionSentCount}
          3. variable definitions        definitions constants + stateful variables (see below)
          4. legacy string map           user        only for callers that pass `variables`
          5. registered extensions       custom      see "Extending"; a `reserved` one joins row 1
          6. inline forms                inline      ${count:1} · ${rssi:-30..-60} (compatibility)
                    │
                    ▼
      unresolved names (nothing above answered)
```

`src/utils/payloadVariables.ts` is the public facade. The implementation is split by concern:

| file                                 | responsibility                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `variables/types.ts`                 | `VariableProvider`, `VariableContext`, options/results                                               |
| `variables/placeholders.ts`          | the `${...}` syntax                                                                                  |
| `variables/expression.ts`            | the arithmetic language inside a placeholder                                                         |
| `variables/providers/builtin.ts`     | `${timestamp}`, `${ts}`, `${timestampSec}`, `${datetime}`, `${date}`, `${time}`, `${iso}`, `${uuid}` |
| `variables/providers/message.ts`     | `${msg.<path>}`, `${topic}`                                                                          |
| `variables/providers/user.ts`        | the legacy merged string map (kept for compatibility)                                                |
| `variables/providers/definitions.ts` | constants and stateful variable definitions                                                          |
| `variables/providers/session.ts`     | `${connectedAt}`, `${connectedAtSec}`, `${appStartedAt}`, `${sessionSentCount}`                      |
| `variables/providers/inline.ts`      | the legacy counters / random ranges                                                                  |
| `variables/resolver.ts`              | the one pipeline: recursion guard, arithmetic fallback, JSON quotes, unresolved list                 |
| `variables/registry.ts`              | the chain, reserved names, name validation, the variable guide                                       |
| `variables/counters.ts`              | persistence of the legacy `${count:3}`                                                               |
| `variables/definitions.ts`           | the definition model + normalization of the stored forms                                             |
| `variables/state.ts`                 | the per-scope runtime state, bounds, formatting, reset triggers                                      |
| `variables/lifecycle.ts`             | connect / disconnect / app-start / manual reset wiring                                               |
| `variables/migration.ts`             | one-click migration of the legacy inline forms                                                       |
| `../connectionVariables.ts`          | scope assembly of one connection + connection field variables                                        |

## Syntax

| form                     | meaning                                                                           |
| ------------------------ | --------------------------------------------------------------------------------- |
| `${name}`                | a variable (built-in, message path, user variable or inline form)                 |
| `${name:3}`              | **legacy** counter: first send uses 3, then +1 (compatibility only, migrate it)   |
| `${name:-30..-60}`       | **legacy** random integer from the range, drawn fresh on every send               |
| `${ts-34000}`            | arithmetic: `+ - * / %`, parentheses, unary minus; every operand must be a number |
| `${msg.ts - 34000}`      | arithmetic on a field of the received message                                     |
| `${msg.sensor-1}`        | the field **named** `sensor-1` (a path without whitespace is a field path)        |
| `${msg.data.list[0].id}` | nested / array field                                                              |
| `"${timestamp}"`         | the quotes are dropped when the value is a number, so JSON keeps its type         |

A value may reference further placeholders (`device = PLC-${line}-${msg.msgId}`); the resolver
expands them recursively up to 10 levels and reports a reference cycle instead of looping. Anything
that cannot be resolved is left verbatim and returned in `unresolved` - the publish paths ask the
user before sending it, the automatic replies skip the rule and log it.

## Stateful variables ("可变变量")

A variable can be a plain constant (a string template, expanded on every use) or one of the
stateful kinds. The definition says what it is and where its value restarts; the current value
lives in a separate store so the definition stays a configuration:

| kind         | value                                                         | example                                         |
| ------------ | ------------------------------------------------------------- | ----------------------------------------------- |
| `constant`   | a template / fixed value                                      | `productType = A1`                              |
| `sequence`   | `initial`, `step`, `min`/`max`, `onBound`, reset triggers     | water weight `200`, `step: -20` → 200, 180, 160 |
| `random`     | `min`/`max`, optional `seed`                                  | `${rssi}` in `-60..-30`                         |
| `randomWalk` | the previous value ± `range`, inside `min`/`max`              | temperature drifting around 25                  |
| `choice`     | weighted `options`                                            | 95% normal value, 5% fault code                 |
| `session`    | generated once per connection session (`uuid` or a template)  | `${sessionId}`                                  |
| `captured`   | written by an automatic reply action, `value` is the fallback | capture the last `msgId`                        |

State keys decide who shares a value:

- a **global variable** of the preset manager → `g:<variable id>` (one value for every connection);
- a **client variable** of a connection / client preset → `c:<connection id>:<name>` (one value per
  connection, so two devices can count independently).

Reset triggers (`resetOn`): `connect` (a successful CONNACK, automatic reconnects included unless
`resetOnReconnect: false`), `disconnect`, `appStart` (once per app process), `manual` (the reset
button), and `bound` through `onBound: 'reset'`. `resetEverySec` is a lazy periodic reset: it
happens on the next use, so no timer has to run in the background. A preview / probe never
advances a value (`commitCounters: false`), and a variable used in both the topic and the payload
advances once per message.

Formatting: `format.pad` zero-pads (`000123`) and `format.precision` fixes the decimals. Arithmetic
in expressions turns the value into a JavaScript number, so a 64-bit integer field loses precision
only when used in an expression, not when injected as text.

### Legacy inline forms

`${count:3}` and `${rssi:-30..-60}` keep working, but they are no longer the way to define a
variable: they cannot express scope, step, bounds or reset. The help dialog marks them as
compatibility syntax, and "迁移旧内联写法" (global variables tab) scans the known templates, creates
the matching variable definitions (migrating the persisted counter value) and is idempotent.

## Adding a variable source

A new kind of variable is one `VariableProvider`; no parser, counter or template-pass change:

```ts
import { registerVariableProvider } from '@/utils/payloadVariables'
import type { VariableProvider } from '@/utils/payloadVariables'

const environmentVariables: VariableProvider = {
  id: 'environment',
  // `prefixes` declares the namespace: it lets a token that also contains an operator
  // (`${env.MY-VAR}`) be tried as a name before it is read as arithmetic. Declare `names` for exact
  // names - a reserved provider's names cannot be used as a user variable.
  prefixes: ['env'],
  // The guide dialog has four fixed group headings (builtin/context/connection/inline); a provider
  // has to file under one of them.
  guide: [{ name: '${env.NAME}', group: 'context' }],
  resolve: (request) => {
    if (!request.name.startsWith('env.')) {
      return undefined // not mine: let the next provider answer
    }
    return process.env[request.name.slice('env.'.length)]
  },
}

const unregister = registerVariableProvider(environmentVariables)
```

Pieces that are handled for the provider: the `${...}` scanning, `name:config`, arithmetic
(`${env.PORT * 2}` uses the provider for its identifier), recursive expansion of `nested` values,
the unresolved report, and the variable guide entry.

Two placement rules of the registry:

- a normal provider is asked **after** the user-defined variables, so a name a user defined still
  wins (use this for optional integrations);
- a `reserved` provider (`registerVariableProvider(provider, { reserved: true })`) is inserted
  right after the built-in variables - before the context and the user-defined ones - and its
  `names` can no longer be used as a variable name (use this for a new built-in).

For one message only, pass the provider to the resolver instead of registering it:

```ts
createPayloadVariableResolver({ variables, message, providers: [myProvider] })
```

## Reply rendering

An automatic reply is rendered with `messageContext: true`: the received message is part of the
context even when its payload is not JSON, so `${msg.x}` renders as an empty string (as the old
pre-pass did) instead of making the rule fail. Without a message context (a plain publish),
`${msg...}` falls through to the user variables, so a variable named `msg` keeps working.

The automation dialog preview passes `commitCounters: false`, so looking at a preview never
consumes a sequence number of a `${count:1}` reply; the engine commits once, after the reply was
built successfully.

## Notes

- The `${msg...}`/`${topic}` namespaces need a message/topic context; `${topic}` needs the `topic`
  option, the message fields need `message` and `messageContext` (the reply renderer always sets
  it, so a missing field renders as `''`).
- Arithmetic goes through JavaScript numbers: a value above 2^53 (a 64-bit integer field) is exact
  when injected as text but loses precision when used in an expression.
- A namespaced placeholder (`${a.b}`, `${msg.x}`) is a variable, not literal text: in the publish
  path it is reported by the unresolved check instead of being published silently. Send it verbatim
  through the confirmation dialog if that was intended.
- Counters are committed after a text was built successfully. The write is coalesced (500 ms), so
  two windows can briefly read the same value - exactness across windows is best-effort.

## Scope assembly

`connectionVariableDefinitions(connection)` / `connectionVariableMap(connection)` return the merged
definitions / plain values of one connection; the scope order is written down only here:

1. the "客户端变量" of the connection (closest, wins)
2. the global variables of the preset manager
3. the fields of the connection (`${clientId}`, `${username}`, `${name}`, `${host}`, `${port}`;
   the password is deliberately not exposed)

An empty value counts as "not defined" and falls through to the next scope / inline form.

## Counters

`${count:3}` stages its next value in the resolver and is written to `electron-store` on
`commit()`. A probe (`commitCounters: false`, see `collectUnresolvedVariables`) therefore does not
advance a counter, and a counter used in both the topic and the payload of one message advances
once. `resetPayloadCounters()` is the "Reset payload variables" action in the settings.
