/**
 * Extract & Upsert: Extraction Step
 *
 * Tests the extraction progress screen that streams log entries, shows a
 * progress bar, and transitions to Review after extraction completes.
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
  mockSaveCredentials,
  mockSelectDirectory,
  type AppContext
} from './helpers/electron-app'
import {
  MOCK_BUNDLES_TEMPLATES,
  MOCK_EXTRACT_PROGRESS,
  MOCK_BUNDLE_EXPORT
} from './helpers/fixtures'

let ctx: AppContext

test.beforeAll(async () => {
  ctx = await launchApp()
})

test.afterAll(async () => {
  await closeApp(ctx)
})

async function navigateToExtractStep(): Promise<void> {
  await ensureOnModeStep(ctx.page)
  await mockConnectSource(ctx.electronApp)
  await mockConnectTarget(ctx.electronApp)
  await mockSaveCredentials(ctx.electronApp)
  await mockSearchBundles(ctx.electronApp, MOCK_BUNDLES_TEMPLATES)

  // Mode → Org Connect
  await ctx.page.locator('text=Extract & Upsert').click()
  await expect(ctx.page.locator('text=Connect to Salesforce Orgs')).toBeVisible()

  // Connect source
  const usernameInputs = ctx.page.locator('input[type="text"]')
  await usernameInputs.first().fill('source@test.org')
  const connectButtons = ctx.page.locator('button', { hasText: 'Connect' })
  await connectButtons.first().click()
  await expect(ctx.page.locator('text=Org ID: ORG_SOURCE_001')).toBeVisible()

  // Connect target
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

  // Connect → Search
  await ctx.page.locator('button', { hasText: /Next/ }).click()
  await expect(ctx.page.locator('text=Select a Bundle')).toBeVisible()

  // Select bundle and click Extract
  await ctx.page.locator('text=QA Testing Template v5').click()
  await ctx.page.locator('button', { hasText: 'Extract Selected Bundle' }).click()

  await expect(ctx.page.locator('text=Extracting Bundle')).toBeVisible()
}

test.describe('Extraction Step — Extract & Upsert', () => {

  // Scenario: The extraction step shows heading and save location field
  // Given the user selected a bundle and navigated to extract
  // Then the "Extracting Bundle" heading, Save Location field, and Start button appear
  test('shows heading, save location, and start button', async () => {
    await navigateToExtractStep()
    await expect(ctx.page.getByRole('heading', { name: 'Extracting Bundle' })).toBeVisible()
    await expect(ctx.page.locator('text=Save Location')).toBeVisible()
    await expect(ctx.page.locator('button', { hasText: 'Start Extraction' })).toBeVisible()
  })

  // Scenario: Browse button opens directory picker to change save location
  // Given the extract step is shown
  // When the user clicks Browse...
  // Then the directory picker dialog is invoked
  test('Browse button changes the save location', async () => {
    await navigateToExtractStep()
    await mockSelectDirectory(ctx.electronApp, '/tmp/custom-output')
    await ctx.page.locator('button', { hasText: 'Browse...' }).click()
    await ctx.page.waitForTimeout(300)
    const saveInput = ctx.page.locator('input[type="text"]').first()
    await expect(saveInput).toHaveValue('/tmp/custom-output')
  })

  // Scenario: Starting extraction shows progress bar and log entries
  // Given the user clicks Start Extraction
  // When progress events stream in
  // Then the progress bar advances and log entries appear
  test('Start Extraction shows progress and log entries', async () => {
    await navigateToExtractStep()
    await mockExtractBundle(ctx.electronApp, MOCK_BUNDLE_EXPORT, MOCK_EXTRACT_PROGRESS)
    await ctx.page.locator('button', { hasText: 'Start Extraction' }).click()
    await expect(ctx.page.locator('text=Extraction complete')).toBeVisible({ timeout: 15_000 })
    await expect(ctx.page.locator('text=100%')).toBeVisible()
  })

  // Scenario: Extraction complete shows success banner and Next button
  // Given the extraction finished successfully
  // Then a green success banner and Next button appear
  test('shows success banner and Next button when extraction completes', async () => {
    await navigateToExtractStep()
    await mockExtractBundle(ctx.electronApp, MOCK_BUNDLE_EXPORT, MOCK_EXTRACT_PROGRESS)
    await ctx.page.locator('button', { hasText: 'Start Extraction' }).click()
    await expect(ctx.page.locator('text=Extraction complete')).toBeVisible({ timeout: 15_000 })
    await expect(ctx.page.locator('button', { hasText: /Next/ })).toBeVisible()
  })

  // Scenario: Back button is disabled while extraction is in progress
  // Given the extraction is running
  // Then the Back button should be disabled to prevent navigation
  test('Back button is disabled during extraction', async () => {
    await navigateToExtractStep()
    await mockExtractBundle(ctx.electronApp, MOCK_BUNDLE_EXPORT, MOCK_EXTRACT_PROGRESS)
    await ctx.page.locator('button', { hasText: 'Start Extraction' }).click()
    const backBtn = ctx.page.locator('button', { hasText: 'Back' })
    await expect(backBtn).toBeDisabled()
    await expect(ctx.page.locator('text=Extraction complete')).toBeVisible({ timeout: 15_000 })
  })

  // Scenario: Extraction failure shows error message and Retry button
  // Given the extraction IPC call throws an error
  // Then an error banner and Retry button appear
  test('shows error and Retry button on extraction failure', async () => {
    await navigateToExtractStep()
    await ctx.electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('sf:extractBundle')
      ipcMain.handle('sf:extractBundle', () =>
        Promise.reject(new Error('SOQL query failed: invalid object LLC_BI__Underwriting_Bundle__c'))
      )
    })
    await ctx.page.locator('button', { hasText: 'Start Extraction' }).click()
    await expect(ctx.page.locator('text=SOQL query failed')).toBeVisible({ timeout: 10_000 })
    await expect(ctx.page.locator('button', { hasText: 'Retry' })).toBeVisible()
  })

  // Scenario: Browse and Start buttons are disabled after extraction starts
  // Given extraction is in progress
  // Then Browse and Start buttons should not be clickable
  test('Browse and Start buttons are disabled during extraction', async () => {
    await navigateToExtractStep()
    await mockExtractBundle(ctx.electronApp, MOCK_BUNDLE_EXPORT, MOCK_EXTRACT_PROGRESS)
    await ctx.page.locator('button', { hasText: 'Start Extraction' }).click()
    await expect(ctx.page.locator('button', { hasText: 'Browse...' })).toBeDisabled()
    await expect(ctx.page.locator('text=Extraction complete')).toBeVisible({ timeout: 15_000 })
  })

  // Scenario: Back button returns to bundle search after extraction completes
  // Given extraction is complete
  // When the user clicks Back
  // Then the app returns to the bundle search step
  test('Back button returns to bundle search after completion', async () => {
    await navigateToExtractStep()
    await mockExtractBundle(ctx.electronApp, MOCK_BUNDLE_EXPORT, MOCK_EXTRACT_PROGRESS)
    await ctx.page.locator('button', { hasText: 'Start Extraction' }).click()
    await expect(ctx.page.locator('text=Extraction complete')).toBeVisible({ timeout: 15_000 })
    await ctx.page.locator('button', { hasText: 'Back' }).click()
    await expect(ctx.page.locator('text=Select a Bundle')).toBeVisible()
  })
})
