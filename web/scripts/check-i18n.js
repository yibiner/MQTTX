#!/usr/bin/env node
/**
 * Checks that every `$t('module.key')` used in the web sources exists in the language files.
 *
 * Why this exists: a wrong key is silent at runtime - vue-i18n simply renders the key, so
 * `$t('variable.add')` shows "variable.add" in the UI with no error anywhere. That is exactly how a
 * batch of unpacked labels reached the running app during the MQTTX Plus port.
 *
 * Run with `yarn check:i18n` (also part of `yarn lint:i18n`, see package.json).
 */
const fs = require('fs')
const path = require('path')

const SRC = path.resolve(__dirname, '..', 'src')
const LANG_DIR = path.join(SRC, 'lang')

/** Duplicated keys found while reading the modules, reported at the end. */
const duplicates = []

/** Top-level keys of one language module that have a `zh` translation. */
const readModuleKeys = (moduleName) => {
  const file = path.join(LANG_DIR, `${moduleName}.ts`)
  if (!fs.existsSync(file)) {
    return null
  }
  const source = fs.readFileSync(file, 'utf8')
  const keys = new Set()
  const re = /^ {2}(\w+): \{\n([\s\S]*?)^ {2}\},/gm
  let match
  while ((match = re.exec(source)) !== null) {
    if (/\bzh:/.test(match[2])) {
      if (keys.has(match[1])) {
        // A duplicated key silently keeps only the last definition, so the two translations drift
        // apart without anybody noticing - exactly what TypeScript rejects at build time, but the
        // message points at the object literal rather than at the duplicate.
        duplicates.push(`${moduleName}.${match[1]}`)
      }
      keys.add(match[1])
    }
  }
  return keys
}

const walk = (dir) => {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walk(full))
    } else if (/\.(vue|ts)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const modules = new Map()
const moduleNames = fs
  .readdirSync(LANG_DIR)
  .filter((name) => name.endsWith('.ts') && name !== 'index.ts')
  .map((name) => name.replace(/\.ts$/, ''))
moduleNames.forEach((name) => modules.set(name, readModuleKeys(name)))

const problems = []
let dynamicKeys = 0
for (const file of walk(SRC)) {
  const source = fs.readFileSync(file, 'utf8')
  const re = /\$t\(\s*'([^']+)'/g
  let match
  while ((match = re.exec(source)) !== null) {
    const key = match[1]
    // A key built at runtime (`$t('configs.variableBound' + capitalize(kind))`) cannot be checked
    // statically; the concrete names are ordinary keys and are covered by their own usages.
    if (/^\s*\+/.test(source.slice(match.index + match[0].length))) {
      dynamicKeys += 1
      continue
    }
    const [mod, ...rest] = key.split('.')
    const name = rest.join('.')
    if (!modules.has(mod)) {
      problems.push({ file, key, reason: `unknown language module "${mod}"` })
      continue
    }
    if (!name) {
      problems.push({ file, key, reason: 'missing key after the module (expected "module.key")' })
      continue
    }
    if (!modules.get(mod).has(name)) {
      problems.push({ file, key, reason: `"${name}" is not defined in lang/${mod}.ts` })
    }
  }
}

if (duplicates.length) {
  console.error(`i18n check failed: ${duplicates.length} duplicated key(s)`)
  duplicates.forEach((key) => console.error(`  ${key}`))
  console.error('\nAn object literal keeps only the last definition of a duplicated key.')
  process.exit(1)
}

if (problems.length) {
  console.error(`i18n check failed: ${problems.length} unresolved key(s)\n`)
  problems.forEach(({ file, key, reason }) => {
    console.error(`  ${path.relative(path.resolve(__dirname, '..'), file)}: $t('${key}') - ${reason}`)
  })
  console.error('\nA key that is not defined is rendered verbatim by vue-i18n, with no runtime error.')
  process.exit(1)
}

console.log(
  `i18n check passed: every $t() key resolves to a defined language entry` +
    (dynamicKeys ? ` (${dynamicKeys} key(s) built at runtime were skipped).` : '.'),
)
