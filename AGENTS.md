# AGENTS.md

Guidance for AI coding agents working in this repository.

## Before every commit

Scan what you are about to commit for secrets and private identifiers. If you find
something, stop and report it instead of silently rewriting or committing.

### What must never be committed

- Actual values of API keys, access tokens, secrets, or bearer tokens
- Private keys or certificates: `BEGIN ... PRIVATE KEY`, `ssh-rsa AAAA...`,
  `.pem` / `.p12` / `.pfx` / `.key` files
- Provider tokens: strings starting with `ghp_`, `github_pat_`, `xox[baprs]-`, `sk-`
- Credential files: `.env`, `.npmrc`, `.netrc`, `id_rsa`, `credentials.json`
- Real account passwords, or connection strings that embed a password
- Internal hostnames and private network addresses

The test: if the value leaked, could someone reach a real system with it? If yes,
it must not be committed.

Acceptable: placeholders such as `local-test-token`, values generated at runtime,
`127.0.0.1`, `example.com`.

### Naming conventions for sample data

Fixtures, examples, and documentation must use obviously fictional identifiers:

- Topic prefixes: `app/`, never an organisation-specific prefix
- Device models: `SN` followed by digits (e.g. `SN0106`), never a real product code
- Serial numbers: values that read as fake at a glance
- Hosts: `example.com`, `127.0.0.1`

Sample values should look synthetic, not like a masked copy of a real one.

## How to scan

```bash
# 1. See what is staged
git diff --cached --name-only

# 2. Scan added lines only, so unrelated matches in existing code do not distract
git diff --cached | grep '^+' | grep -inE \
  '(secret|password|passwd|token|api[_-]?key|credential|private[_-]?key)' \
  | grep -viE '(placeholder|type="password"|passwordRules|showPassword)'

# 3. Scan for keys and private addresses
git diff --cached | grep '^+' | grep -nE \
  '(BEGIN [A-Z ]*PRIVATE KEY|ssh-rsa AAAA|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|10\.[0-9]+\.[0-9]+\.[0-9]+|192\.168\.)'
```

Review every hit. A field name like `password` is harmless; a value is not.

## Also confirm

- The commit author is a personal identity, not a shared or organisational address
- No build output, local database, or log file is staged

## If a secret reaches the repository

1. Not committed yet: fix the file.
2. Committed but not pushed: `git commit --amend`, or an interactive rebase.
3. Already pushed: tell the user immediately. The value is in the remote history and
   must be **revoked**, then the history rewritten. Back up before rewriting.
