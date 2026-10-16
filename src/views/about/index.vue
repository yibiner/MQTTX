<template>
  <div class="about-view rightbar">
    <div class="about-topbar">
      <h1 class="titlebar">{{ $t('about.about') }}</h1>
    </div>
    <div class="about-container" :class="{ 'is-light': getterTheme === 'light' }">
      <!-- Background Grid Effect -->
      <div class="grid-background">
        <div class="grid-lines"></div>
        <div class="gradient-orb gradient-orb--1"></div>
        <div class="gradient-orb gradient-orb--2"></div>
      </div>

      <!-- Main Content - Two Column Layout -->
      <div class="about-main">
        <!-- Left: Logo, name, version -->
        <div class="about-left">
          <div class="logo-section">
            <div class="logo-glow"></div>
            <img :src="appLogoSrc" alt="MQTTX Plus" class="app-logo" />
          </div>
          <h2 class="app-name">{{ appName }}</h2>
          <p class="app-description">{{ $t('about.mqttxDesc') }}</p>
          <div class="version-badge">
            <span class="version-label">{{ $t('common.version') }}</span>
            <span class="version-number">v{{ version }}</span>
          </div>
        </div>

        <!-- Right: Local resources -->
        <div class="about-right">
          <div class="resources-card">
            <h3 class="resources-title">
              <i class="el-icon-folder-opened"></i>
              <span>{{ $t('about.localResources') }}</span>
            </h3>
            <ul class="resource-list">
              <li v-for="resource in localResources" :key="resource.key" class="resource-item">
                <div class="resource-info">
                  <span class="resource-label">
                    <i :class="resource.icon"></i>
                    {{ $t(resource.label) }}
                  </span>
                  <span class="resource-path" :title="resource.path">{{ resource.path }}</span>
                </div>
                <div class="resource-actions">
                  <a
                    class="action-link"
                    href="javascript:;"
                    v-clipboard:copy="resource.path"
                    v-clipboard:success="() => onCopySuccess(resource)"
                    @click.prevent
                  >
                    <i class="el-icon-document-copy"></i>
                    <span>{{ copiedKey === resource.key ? $t('about.copied') : $t('about.copy') }}</span>
                  </a>
                  <a class="action-link" href="javascript:;" @click.prevent="openResource(resource)">
                    <i :class="resource.directory ? 'el-icon-folder-opened' : 'el-icon-view'"></i>
                    <span>{{ resource.directory ? $t('about.open') : $t('about.reveal') }}</span>
                  </a>
                </div>
              </li>
            </ul>
          </div>

          <!-- Footer -->
          <div class="about-footer">
            <span class="copyright">&copy;{{ fullYear }} EMQ Technologies Inc. &middot; {{ appName }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import { Getter } from 'vuex-class'
import { ipcRenderer } from 'electron'
import version from '@/version'
import { APP_NAME } from '@/appIdentity'

/**
 * Local resources shown on this page. Kept in sync with the keys the main process accepts in
 * `src/main/localResources.ts`; the paths themselves are always resolved by the main process.
 */
type LocalResourceKey = 'data' | 'database' | 'config' | 'logs'

interface LocalResource {
  key: LocalResourceKey
  label: string
  icon: string
  directory: boolean
  path: string
}

const RESOURCE_DEFINITIONS: { key: LocalResourceKey; label: string; icon: string; directory: boolean }[] = [
  { key: 'data', label: 'about.dataDirectory', icon: 'el-icon-folder', directory: true },
  { key: 'database', label: 'about.databaseFile', icon: 'el-icon-coin', directory: false },
  { key: 'config', label: 'about.configFile', icon: 'el-icon-setting', directory: false },
  { key: 'logs', label: 'about.logDirectory', icon: 'el-icon-tickets', directory: true },
]

@Component
export default class About extends Vue {
  @Getter('currentTheme') private getterTheme!: Theme

  private resourcePaths: Partial<Record<LocalResourceKey, string>> = {}

  private copiedKey = ''

  get version(): string {
    return version
  }

  get appName(): string {
    return APP_NAME
  }

  get fullYear(): number {
    return new Date().getFullYear()
  }

  get appLogoSrc(): string {
    if (this.getterTheme === 'light') {
      return require('@/assets/images/mqttx-dark.png')
    }
    return require('@/assets/images/mqttx-light.png')
  }

  /** Only the resources the main process reported are rendered. */
  get localResources(): LocalResource[] {
    return RESOURCE_DEFINITIONS.map((definition) => ({
      ...definition,
      path: this.resourcePaths[definition.key] || '',
    })).filter((resource) => resource.path)
  }

  private async created(): Promise<void> {
    try {
      this.resourcePaths = await ipcRenderer.invoke('getLocalResourcePaths')
    } catch (error) {
      this.$log.error(`Could not read the local resource paths: ${error}`)
    }
  }

  private onCopySuccess(resource: LocalResource): void {
    this.copiedKey = resource.key
    setTimeout(() => {
      this.copiedKey = ''
    }, 1500)
  }

  private async openResource(resource: LocalResource): Promise<void> {
    try {
      const result = await ipcRenderer.invoke('openLocalResource', resource.key)
      if (result && result.ok === false) {
        this.$message.error((result.error as string) || (this.$t('about.openFailed') as string))
      }
    } catch (error) {
      this.$log.error(`Could not open the local resource: ${error}`)
      this.$message.error(this.$t('about.openFailed') as string)
    }
  }
}
</script>

<style lang="scss" scoped>
.about-view {
  position: relative;
  padding: 0 16px;
  overflow: hidden;
}

.about-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .titlebar {
    margin: 0;
  }
}

.about-container {
  position: relative;
  height: calc(100% - 60px);
  display: flex;
  justify-content: center;
  padding: 24px;
  overflow-y: auto;
}

/* Background Effects */
.grid-background {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.grid-lines {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(var(--color-border-default) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-border-default) 1px, transparent 1px);
  background-size: 60px 60px;
  opacity: 0.3;
  mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
}

.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.35;
  animation: float 8s ease-in-out infinite;
}

.gradient-orb--1 {
  width: 350px;
  height: 350px;
  background: var(--color-main-green);
  top: 10%;
  left: 20%;
  animation-delay: 0s;
}

.gradient-orb--2 {
  width: 280px;
  height: 280px;
  background: var(--color-minor-green);
  bottom: 20%;
  right: 15%;
  animation-delay: -4s;
}

.about-container.is-light {
  .gradient-orb {
    display: none;
  }

  .logo-glow {
    display: none;
  }

  .grid-lines {
    opacity: 0.5;
    background-image: linear-gradient(#d0d5dd 1px, transparent 1px),
      linear-gradient(90deg, #d0d5dd 1px, transparent 1px);
  }

  .action-link {
    color: var(--color-text-default);

    i {
      color: var(--color-text-default);
    }
  }

  .version-badge,
  .resources-card {
    background: #fff;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  }
}

@keyframes float {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  25% {
    transform: translate(20px, -20px) scale(1.05);
  }
  50% {
    transform: translate(0, 20px) scale(1);
  }
  75% {
    transform: translate(-20px, -10px) scale(0.95);
  }
}

/* Main Content - Two Column */
.about-main {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 56px;
  max-width: 1000px;
  width: 100%;
  /* Centers the content vertically while still allowing the container to scroll when needed. */
  margin: auto;
}

/* Left Column - Logo */
.about-left {
  flex-shrink: 0;
  width: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.logo-section {
  position: relative;
  width: 180px;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-glow {
  position: absolute;
  width: 130px;
  height: 130px;
  background: radial-gradient(circle, var(--color-main-green) 0%, transparent 70%);
  border-radius: 50%;
  filter: blur(30px);
  opacity: 0.6;
  animation: breathe 4s ease-in-out infinite;
}

@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.15);
    opacity: 0.4;
  }
}

.app-logo {
  position: relative;
  z-index: 1;
  width: 132px;
  height: auto;
  transition: transform 0.3s ease;
}

.logo-section:hover .app-logo {
  transform: scale(1.05);
}

.app-name {
  margin: 8px 0 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-title);
}

.app-description {
  margin: 8px 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-light);
}

.version-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: var(--color-bg-card-gradient);
  border-radius: 100px;
}

.version-label {
  font-size: 13px;
  color: var(--color-text-light);
  font-weight: 500;
}

.version-number {
  font-size: 14px;
  color: var(--color-main-green);
  font-weight: 600;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace;
}

/* Right Column - Local resources */
.about-right {
  flex: 1;
  min-width: 0;
}

.resources-card {
  background: var(--color-bg-card-gradient);
  border-radius: 12px;
  padding: 20px 24px;
}

.resources-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-title);

  i {
    color: var(--color-main-green);
  }
}

.resource-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.resource-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;

  & + .resource-item {
    border-top: 1px solid var(--color-border-default);
  }
}

.resource-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.resource-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-default);

  i {
    font-size: 13px;
    color: var(--color-text-card_icon);
  }
}

.resource-path {
  font-size: 12px;
  color: var(--color-text-light);
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace;
  word-break: break-all;
}

.resource-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.action-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  color: var(--color-text-light);
  font-size: 13px;
  text-decoration: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;

  i {
    font-size: 14px;
  }

  &:hover {
    color: var(--color-main-green);
    background: var(--color-bg-card-normal);
  }
}

/* Footer */
.about-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  padding-top: 16px;
}

.copyright {
  font-size: 12px;
  color: var(--color-text-light);
}
</style>
