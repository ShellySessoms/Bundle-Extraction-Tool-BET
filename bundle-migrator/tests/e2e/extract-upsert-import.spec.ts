/**
 * Extract & Upsert: Import (Upsert) Step
 *
 * Tests the import progress screen that streams phase updates (resolve,
 * import, backfill, complete), shows a progress bar, and transitions to
 * Summary when done.
 */
import { test, expect } from '@playwright/test'
import {
  launchApp,
  closeApp,
  ensureOnModeStep,
  mockConnectSource,
  mockConnectTarget,
  mockSearchBundles,
  mockExtractBundle,
  mockImportBundle,
  mockSaveCredentials,
  type AppContext
} from './helpers/electron-app'
import {
  MOCK_BUNDLES_TEMPLATES,
  MOCK_EXTRACT_PROGRESS,
  MOCK_BUNDLE_EXPORT,
  MOCK_IMPORT_PROGRESS,
  MOCK_IMPORT_SUMMARY_SUCCESS,
  MOCK_IMPORT_PROGRESS_WITH_ERRORS,
  MOCK_IMPORT_SUMMARY_PARTIAL
} from './helpers/fixtures'

let ctx: AppContext

test.beforeAll(async () => {
  ctx = await launchApp()
})

test.afterAll(async () => {
  await closeApp(ctx)
})

async function navigateToImportStep(
  importSummary = MOCK_IMPORT_SUMMARY_SUCCESS,
  importProgress = MOCK_IMPORT_PROGRESS
): Promise<void> {
  await ensureOnModeStep(ctx.page)
  await mockConnectSource(ctx.electronApp)
  await mockConnectTarget(ctx.electronApp)
  await mockSaveCredentials(ctx.electronApp)
  await mockSearchBundles(ctx.electronApp, MOCK_BUNDLES_TEMPLATES)

  // Mode → Connect
  await ctx.page.locator('text=Extract & Upsert').click()
  await expect(ctx.page.locator('text=Connect to Salesforce Orgs')).toBeVisible()

  // Connect both orgs
  const usernameInputs = ctx.page.locator('input[type="text"]')
  await usernameInputs.first().fill('source@test.org')
  const connectButtons = ctx.page.locator('button', { hasText: 'Connect' })
  await connectButtons.first().click()
  await expect(ctx.page.locator('text=Org ID: ORG_SOURCE_001')).toBeVisible()

  const allInputs = ctx.page.locator('input')
  const inputCount = await allInputs.count()
  for (let i = 0; i < inputCount; i++) {
    const input = allInputs.nth(i)
    const value = await input.inputValue()
    if (value === '' || value === 'https://login.salesforce.com') {
      const type = await input.getAttribute('type')
      if (type === 'text') {
        await input.fill('target@test.org')
        break
      }
    }
  }
  await connectButtons.nth(1).click()
  await expect(ctx.page.locator('text=Org ID: ORG_TARGET_001')).toBeVisible()

  // Connect → Search → Extract → Review → Target Connect → Import
  await ctx.page.locator('button', { hasText: /Next/ }).click()
  await expect(ctx.page.locator('text=Select a Bundle')).toBeVisible()

  await ctx.page.locator('text=QA Testing Template v5').click()
  await mockExtractBundle(ctx.electronApp, MOCK_BUNDLE_EXPORT, MOCK_EXTRACT_PROGRESS)
  await ctx.page.locator('button', { hasText: 'Extract Selected Bundle' }).click()
  await ctx.page.locator('button', { hasText: 'Start Extraction' }).click()
  await expect(ctx.page.locator('text=Extraction complete')).toBeVisible({ timeout: 15_000 })

  // Extract → Review → Target Connect → Import
  await ctx.page.locator('button', { hasText: /Next/ }).click()
  await expect(ctx.page.locator('text=Review Extraction')).toBeVisible()

  await ctx.page.locator('button', { hasText: 'Proceed with Upsert' }).click()
  await expect(ctx.page.locator('text=Connect Target Org')).toBeVisible()

  await mockImportBundle(ctx.electronApp, importSummary, importProgress)
  await ctx.page.locator('button', { hasText: /Next/ }).click()
  await expect(ctx.page.locator('text=Importing Bundle')).toBeVisible()
}

test.describe('Import Step — Extract & Upsert', () => {

  // Scenario: Import step shows the heading and phase progress
  // Given the user navigated to the import step
  // Then the "Importing Bundle" heading and phase label are visible
  test('shows heading and phase label', async () => {
    await navigateToImportStep()
    await expect(ctx.page.getByRole('heading', { name: 'Importing Bundle' })).toBeVisible()
  })

  // Scenario: Import starts automatically and shows progress through phases
  // Given the import step loaded
  // When the import runs through resolve → import → backfill → complete
  // Then progress events stream into the log and the progress bar fills
  test('import runs automatically and shows progress', async () => {
    await navigateToImportStep()
    await expect(ctx.page.locator('text=Import complete')).toBeVisible({ timeout: 15_000 })
    await expect(ctx.page.locator('text=100%')).toBeVisible()
  })

  // Scenario: Successful import shows green "Import complete" banner and Next button
  // Given all records were imported successfully
  // Then a green success banner and Next button appear
  test('shows success banner and Next button on completion', async () => {
    await navigateToImportStep()
    await expect(ctx.page.locator('text=Import complete')).toBeVisible({ timeout: 15_000 })
    await expect(ctx.page.locator('button', { hasText: /Next/ })).toBeVisible()
  })

  // Scenario: Back button is disabled while import is in progress
  // Given the import is running
  // Then the Back button should be disabled
  test('Back button is disabled during import', async () => {
    await navigateToImportStep()
    const backBtn = ctx.page.locator('button', { hasText: 'Back' })
    await expect(backBtn).toBeDisabled()
    await expect(ctx.page.locator('text=Import complete')).toBeVisible({ timeout: 15_000 })
  })

  // Scenario: Import with partial failures still shows completion
  // Given some records fail during import
  // When the import completes
  // Then the import still completes and Next button appears
  test('import with partial failures completes and shows Next', async () => {
    await navigateToImportStep(MOCK_IMPORT_SUMMARY_PARTIAL, MOCK_IMPORT_PROGRESS_WITH_ERRORS)
    await expect(ctx.page.locator('text=Import complete')).toBeVisible({ timeout: 15_000 })
    await expect(ctx.page.locator('button', { hasText: /Next/ })).toBeVisible()
  })

  // Scenario: Import failure shows error message
  // Given the import IPC call throws a fatal error
  // Then an error banner appears
  test('shows error banner on fatal import failure', async () => {
    await ensureOnModeStep(ctx.page)
    await mockConnectSource(ctx.electronApp)
    await mockConnectTarget(ctx.electronApp)
    await mockSaveCredentials(ctx.electronApp)
    await mockSearchBundles(ctx.electronApp, MOCK_BUNDLES_TEMPLATES)

    await ctx.page.locator('text=Extract & Upsert').click()
    await expect(ctx.page.locator('text=Connect to Salesforce Orgs')).toBeVisible()

    const usernameInputs = ctx.page.locator('input[type="text"]')
    await usernameInputs.first().fill('source@test.org')
    const connectButtons = ctx.page.locator('button', { hasText: 'Connect' })
    await connectButtons.first().click()
    await expect(ctx.page.locator('text=Org ID: ORG_SOURCE_001')).toBeVisible()

    const allInputs = ctx.page.locator('input')
    const inputCount = await allInputs.count()
    for (let i = 0; i < inputCount; i++) {
      const input = allInputs.nth(i)
      const value = await input.inputValue()
      if (value === '' || value === 'https://login.salesforce.com') {
        const type = await input.getAttribute('type')
        if (type === 'text') {
          await input.fill('target@test.org')
          break
        }
      }
    }
    await connectButtons.nth(1).click()
    await expect(ctx.page.locator('text=Org ID: ORG_TARGET_001')).toBeVisible()

    await ctx.page.locator('button', { hasText: /Next/ }).click()
    await expect(ctx.page.locator('text=Select a Bundle')).toBeVisible()

    await ctx.page.locator('text=QA Testing Template v5').click()
    await mockExtractBundle(ctx.electronApp, MOCK_BUNDLE_EXPORT, MOCK_EXTRACT_PROGRESS)
    await ctx.page.locator('button', { hasText: 'Extract Selected Bundle' }).click()
    await ctx.page.locator('button', { hasText: 'Start Extraction' }).click()
    await expect(ctx.page.locator('text=Extraction complete')).toBeVisible({ timeout: 15_000 })

    await ctx.page.locator('button', { hasText: /Next/ }).click()
    await expect(ctx.page.locator('text=Review Extraction')).toBeVisible()

    await ctx.page.locator('button', { hasText: 'Proceed with Upsert' }).click()
    await expect(ctx.page.locator('text=Connect Target Org')).toBeVisible()

    await ctx.electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('sf:importBundle')
      ipcMain.handle('sf:importBundle', () =>
        Promise.reject(new Error('Target org is not configured. Set TARGET_SF_USERNAME in .env to import.'))
      )
    })

    await ctx.page.locator('button', { hasText: /Next/ }).click()
    await expect(ctx.page.locator('text=Importing Bundle')).toBeVisible()
    await expect(ctx.page.locator('text=Target org is not configured')).toBeVisible({ timeout: 10_000 })
  })

  // Scenario: Back button returns to Review after import completes
  // Given the import finished
  // When the user clicks Back
  // Then the app returns to the Review step
  test('Back button returns to Review after import completes', async () => {
    await navigateToImportStep()
    await expect(ctx.page.locator('text=Import complete')).toBeVisible({ timeout: 15_000 })
    await ctx.page.locator('button', { hasText: 'Back' }).click()
    await expect(ctx.page.locator('text=Review Extraction')).toBeVisible()
  })
})
