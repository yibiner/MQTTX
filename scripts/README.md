# MQTTX Utility Scripts

This directory contains utility scripts that help with development, build processes, and fixing compatibility issues in dependencies.

## Available Scripts

### 1. gen-version.js

A version generator script that updates version information before builds.

**Function**: Writes `src/version.ts` from `package.json`. The upstream `version` and the Plus build number `mqttxPlusVersion` (`year.month.day.nth`) are copied together, plus a combined `fullVersion` (`1.13.1+2026.11.06.1`) used by the local agent.

**When to run**:

- `node scripts/gen-version.js` copies the numbers already in package.json. Dev startup does this and does not change the build number.
- `node scripts/gen-version.js --bump` advances the Plus build number (same day increments, a new day starts at `.1`), saves it back to package.json, then regenerates `src/version.ts`. The packaging scripts pass `--bump`.

### 2. patch-mcp-sdk.js

Fixes Node.js module import compatibility issues in the MCP SDK for Electron environments.

**Problem**: Modern Node.js modules use the 'node:' prefix for built-in modules (e.g., 'node:fs'), but Electron and older Node.js versions don't fully support this syntax, leading to errors like "Cannot find module 'node:fs'".

**Solution**: This script removes all 'node:' prefixes from import statements and require() calls in the MCP SDK files. It also patches the pkce-challenge module which has modern syntax issues.

**What it modifies**:

- Removes 'node:' prefixes from import statements in MCP SDK files
- Converts require('node:module') to require('module')
- Replaces the pkce-challenge module implementation with a compatible version

### 3. patch-monaco-clipboard.js

Fixes clipboard functionality in Monaco Editor when running in Electron.

**Problem**: Monaco Editor doesn't properly detect Electron's renderer process as a web environment, causing clipboard functionality (especially paste) to fail. This issue became more prominent with Electron 34+ where execCommand('paste') support was dropped.

**Solution**: This patch removes the `platform.isWeb` check in the clipboard.js file, allowing clipboard operations to work in Electron regardless of platform detection.

**Related Issue**: [monaco-editor#4855](https://github.com/microsoft/monaco-editor/issues/4855)

**What it modifies**:

- Changes the condition `if (!result && platform.isWeb)` to `if (!result)` in Monaco's clipboard implementation
- Adds comments explaining the patch for future reference

## How to Use

Most scripts run automatically at appropriate times through npm/yarn scripts in package.json.

The patch scripts run automatically after `yarn install` through the `postinstall` script in package.json.

If you need to run them manually:

```bash
# Copy the current version into src/version.ts
node scripts/gen-version.js

# Advance the Plus build number, then copy it (what packaging runs)
node scripts/gen-version.js --bump

# Run Monaco Editor clipboard patch
node scripts/patch-monaco-clipboard.js

# Run MCP SDK patch
node scripts/patch-mcp-sdk.js
```

## When to Run Patches

- After installing or updating dependencies
- If you encounter clipboard issues in Monaco Editor within Electron
- If you encounter import errors with the MCP SDK
- If you see version information missing in the application
