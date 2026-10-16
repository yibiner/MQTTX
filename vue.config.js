const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin')
const path = require('path')
// Shared with the running app (src/appIdentity.ts) so the installed bundle name, the app id and the
// user data directory can never drift apart.
const identity = require('./app.identity.json')
// "MQTTX Plus" -> "MQTTX-Plus", used for the artifact file names.
const artifactPrefix = identity.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

module.exports = {
  productionSourceMap: false,
  devServer: {
    hot: true,
    host: '0.0.0.0',
    disableHostCheck: true,
  },
  // Instruct Vue CLI to transpile the 'zod-to-json-schema' dependency with Babel,
  // ensuring compatibility with environments that do not support modern JavaScript features.
  transpileDependencies: ['zod-to-json-schema'],
  chainWebpack: (config) => {
    // Add a rule to handle .mjs files (JavaScript modules).
    // This ensures that .mjs files in node_modules are processed correctly.
    config.module
      .rule('mjs')
      .test(/\.mjs$/)
      .type('javascript/auto')
      .include.add(/node_modules/)
      .end()

    // Add a rule to handle .txt files as raw text
    config.module
      .rule('txt')
      .test(/\.txt$/)
      .use('raw-loader')
      .loader('raw-loader')
      .end()

    // Use Electron mock in test environment
    if (process.env.NODE_ENV === 'test') {
      config.resolve.alias.set(
        path.resolve(__dirname, 'src/store') + '$',
        path.resolve(__dirname, 'tests/unit/mocks/store.js'),
      )
      config.resolve.alias.set('electron', path.resolve(__dirname, 'tests/unit/mocks/electron.js'))
      config.resolve.alias.set('@electron/remote', path.resolve(__dirname, 'tests/unit/mocks/electron.js'))
      config.resolve.alias.set('electron-store', path.resolve(__dirname, 'tests/unit/mocks/electron-store.js'))
      // Keep the native SQLite driver out of the webpack test bundle.
      config.externals({ sqlite3: 'commonjs sqlite3', vm2: 'commonjs vm2' })
    }
  },
  configureWebpack: {
    plugins: [
      new MonacoWebpackPlugin({
        output: 'static/',
        languages: ['json', 'javascript'],
        features: [
          '!accessibilityHelp',
          '!bracketMatching',
          'caretOperations',
          'clipboard',
          'codeAction',
          'codelens',
          'colorDetector',
          '!comment',
          'contextmenu',
          'coreCommands',
          'cursorUndo',
          '!dnd',
          '!find',
          '!folding',
          '!fontZoom',
          '!format',
          '!gotoError',
          '!gotoLine',
          '!gotoSymbol',
          '!hover',
          '!iPadShowKeyboard',
          '!inPlaceReplace',
          'inspectTokens',
          'linesOperations',
          '!links',
          '!multicursor',
          '!parameterHints',
          'quickCommand',
          'quickOutline',
          '!referenceSearch',
          '!rename',
          'smartSelect',
          'snippets',
          'suggest',
          '!toggleHighContrast',
          'toggleTabFocusMode',
          'transpose',
          'wordHighlighter',
          'wordOperations',
          'wordPartOperations',
        ],
      }),
    ],
  },
  pluginOptions: {
    electronBuilder: {
      nodeIntegration: true,
      // Prevent bundling of certain imported packages and instead retrieve these external dependencies at runtime.
      // In order to connect to websocket.
      externals: ['mqtt', 'vm2', 'log4js', 'typeorm'],
      builderOptions: {
        // This build is "MQTTX Plus", a fork of MQTTX: its own app id, its own app name (=> its own
        // macOS bundle and its own user data directory) and its own artifact names, so it can be
        // installed next to the official MQTTX without sharing anything with it.
        appId: identity.bundleId,
        productName: identity.name,
        extraMetadata: {
          productName: identity.name,
        },
        // Kept for completeness only: update checks are disabled unless the app is named exactly
        // "MQTTX" (see isOfficialBuild in src/main/updateChecker.ts), so this build never pulls an
        // official release over itself.
        publish: [
          {
            provider: 'generic',
            url: 'https://www.emqx.com/en/downloads/MQTTX',
          },
        ],
        nsis: {
          oneClick: false,
          allowElevation: true,
          allowToChangeInstallationDirectory: true,
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
          artifactName: `${artifactPrefix}-Setup-\${version}-\${arch}.\${ext}`,
        },
        win: {
          artifactName: `${artifactPrefix}-\${version}-\${arch}-win.\${ext}`,
          icon: './public/icons/app.ico',
          target: [
            {
              target: 'nsis',
              arch: [
                'x64',
                'ia32',
                // FIXME: sqlite3 does not provide prebuilt binaries for Windows ARM64, needs to be compiled manually
                // Issue: https://github.com/TryGhost/node-sqlite3/issues/1799
                // 'arm64'
              ],
            },
            {
              target: 'zip',
              arch: ['x64', 'ia32'],
            },
          ],
        },
        mac: {
          icon: './public/icons/mac/Icon.icns',
          artifactName: `${artifactPrefix}-\${version}-\${arch}.\${ext}`,
          target: [
            {
              target: 'dmg',
              arch: ['x64', 'arm64'],
            },
            // FIXME: pkg target is not working, it will cause the app to crash when built.
            // Issue: https://github.com/electron-userland/electron-builder/issues/6015
            // {
            //   target: 'pkg',
            //   arch: ['x64', 'arm64'],
            // },
            {
              target: 'zip',
              arch: ['x64', 'arm64'],
            },
          ],
        },
        linux: {
          icon: './public/icons/512x512.png',
          target: [
            { target: 'AppImage', arch: ['x64', 'arm64'] },
            { target: 'deb', arch: ['x64', 'arm64'] },
            { target: 'rpm', arch: ['x64', 'arm64'] },
            { target: 'snap', arch: ['x64'] },
          ],
        },
      },
    },
  },
}
