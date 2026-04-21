/**
 * Shared Electron app launcher and IPC mock utilities for E2E tests.
 *
 * Centralizes boilerplate so each spec file focuses on its own scenarios
 * instead of re-implementing launch/teardown and mock wiring.
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { resolve } from 'path'

export const ROOT = resolve(__dirname, '..', '..', '..')
export const FIXTURE_A = resolve(ROOT, 'tests/fixtures/bundleA.json')
export const FIXTURE_B = resolve(ROOT, 'tests/fixtures/bundleB.json')

export interface AppContext {
  electronApp: ElectronApplication
  page: Page
}

export async function launchApp(): Promise<AppContext> {
  const electronApp = await electron.launch({
    args: [resolve(ROOT, 'out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test' }
  })
  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { electronApp, page }
}

export async function closeApp(ctx: AppContext): Promise<void> {
  await ctx.electronApp?.close()
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

export async function ensureOnModeStep(page: Page): Promise<void> {
  const isModeStep = await page.locator('text=Compare Bundles').isVisible().catch(() => false)
  if (isModeStep) return

  const startOver = page.locator('button', { hasText: 'Start Over' })
  if (await startOver.isVisible().catch(() => false)) {
    await startOver.click()
    await page.locator('text=Compare Bundles').waitFor({ state: 'visible', timeout: 5_000 })
    return
  }

  const back = page.locator('button', { hasText: 'Back' })
  for (let i = 0; i < 10; i++) {
    if (await page.locator('text=Compare Bundles').isVisible().catch(() => false)) return
    if (!(await back.isVisible().catch(() => false))) break
    await back.click()
    await page.waitForTimeout(200)
  }
}

export async function clickModeCard(page: Page, title: string): Promise<void> {
  await page.locator(`text=${title}`).click()
}

// ---------------------------------------------------------------------------
// Dialog mocks
// ---------------------------------------------------------------------------

export async function mockOpenDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [path] })
  }, filePath)
}

export async function mockOpenDialogCancelled(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: true, filePaths: [] })
  })
}

// ---------------------------------------------------------------------------
// IPC mocks for Salesforce operations
// ---------------------------------------------------------------------------

export interface MockOrgOptions {
  connected?: boolean
  orgId?: string
  username?: string
  error?: string
}

export async function mockConnectSource(
  app: ElectronApplication,
  opts: MockOrgOptions = { connected: true, orgId: 'ORG_SOURCE_001', username: 'source@test.org' }
): Promise<void> {
  await app.evaluate(({ ipcMain }, result) => {
    ipcMain.removeHandler('sf:connectSource')
    ipcMain.handle('sf:connectSource', () => Promise.resolve(result))
  }, opts)
}

export async function mockConnectTarget(
  app: ElectronApplication,
  opts: MockOrgOptions = { connected: true, orgId: 'ORG_TARGET_001', username: 'target@test.org' }
): Promise<void> {
  await app.evaluate(({ ipcMain }, result) => {
    ipcMain.removeHandler('sf:connectTarget')
    ipcMain.handle('sf:connectTarget', () => Promise.resolve(result))
  }, opts)
}

export async function mockSearchBundles(
  app: ElectronApplication,
  bundles: Record<string, unknown>[]
): Promise<void> {
  await app.evaluate(({ ipcMain }, data) => {
    ipcMain.removeHandler('sf:searchBundles')
    ipcMain.handle('sf:searchBundles', () => Promise.resolve(data))
  }, bundles)
}

export async function mockExtractBundle(
  app: ElectronApplication,
  exportData: Record<string, unknown>,
  progressEvents?: Record<string, unknown>[]
): Promise<void> {
  await app.evaluate(({ ipcMain, BrowserWindow }, { data, events }) => {
    ipcMain.removeHandler('sf:extractBundle')
    ipcMain.handle('sf:extractBundle', async () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win && events) {
        for (const evt of events) {
          win.webContents.send('progress', evt)
          await new Promise((r) => setTimeout(r, 50))
        }
      }
      return data
    })
  }, { data: exportData, events: progressEvents ?? [] })
}

export async function mockImportBundle(
  app: ElectronApplication,
  summary: Record<string, unknown>,
  progressEvents?: Record<string, unknown>[]
): Promise<void> {
  await app.evaluate(({ ipcMain, BrowserWindow }, { data, events }) => {
    ipcMain.removeHandler('sf:importBundle')
    ipcMain.handle('sf:importBundle', async () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win && events) {
        for (const evt of events) {
          win.webContents.send('progress', evt)
          await new Promise((r) => setTimeout(r, 50))
        }
      }
      return data
    })
  }, { data: summary, events: progressEvents ?? [] })
}

export async function mockSaveCredentials(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('app:saveCredentials')
    ipcMain.handle('app:saveCredentials', () => Promise.resolve())
  })
}

export async function mockSelectDirectory(app: ElectronApplication, dir: string): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [path] })
  }, dir)
}
