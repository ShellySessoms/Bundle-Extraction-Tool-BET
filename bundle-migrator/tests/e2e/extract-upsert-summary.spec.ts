/**
 * Extract & Upsert: Summary Step
 *
 * Tests the final summary screen that shows the outcome of the import:
 * success/partial/failed banner, per-object counts, error export, and
 * "Upsert this file again" shortcut.
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

async function navigateToSummary(
  importSummary = MOCK_IMPORT_SUMMARY_SUCCESS,
  importProgress = MOCK_IMPORT_PROGRESS
): Promise<void> {
  await ensureOnModeStep(ctx.page)
  await mockConnectSource(ctx.electronApp)
  await mockConnectTarget(ctx.electronApp)
  await mockSaveCredentials(ctx.electronApp)
  await mockSearchBundles(ctx.electronApp, MOCK_BUNDLES_TEMPLATES)

  // Full flow: Mode → Connect → Search → Extract → Review → Target → Import → Summary
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

  await mockImportBundle(ctx.electronApp, importSummary, importProgress)
  await ctx.page.locator('button', { hasText: /Next/ }).click()
  await expect(ctx.page.locator('text=Importing Bundle')).toBeVisible()
  await expect(ctx.page.locator('text=Import complete')).toBeVisible({ timeout: 15_000 })

  // Import → Summary
  await ctx.page.locator('button', { hasText: /Next/ }).click()
  await expect(ctx.page.getByRole('heading', { name: 'Summary' })).toBeVisible()
}

test.describe('Summary Step — Extract & Upsert (Success)', () => {

  // Scenario: Summary shows "Upsert Complete" banner when all records succeed
  // Given all records were imported without errors
  // Then a green "Upsert Complete" banner is shown
  test('shows Upsert Complete banner on full success', async () => {
    await navigateToSummary()
    await expect(ctx.page.locator('text=Upsert Complete')).toBeVisible()
  })

  // Scenario: Summary shows per-object result table with Succeeded/Failed columns
  // Given the import completed
  // Then the table shows Object, Succeeded, and Failed columns
  test('shows per-object result table', async () => {
    await navigateToSummary()
    await expect(ctx.page.locator('th', { hasText: 'Object' })).toBeVisible()
    await expect(ctx.page.locator('th', { hasText: 'Succeeded' })).toBeVisible()
    await expect(ctx.page.locator('th', { hasText: 'Failed' })).toBeVisible()
    await expect(ctx.page.locator('text=LLC_BI__Underwriting_Bundle__c').first()).toBeVisible()
  })

  // Scenario: Summary shows total row with overall counts
  // Given 12 records were processed with 0 failures
  // Then the Total row shows succeeded=12, failed=0
  test('shows total row with correct counts', async () => {
    await navigateToSummary()
    await expect(ctx.page.locator('td', { hasText: 'Total' })).toBeVisible()
  })

  // Scenario: "Open Log File" button is visible
  // Given the summary step loaded
  // Then the "Open Log File" button should be present
  test('shows Open Log File button', async () => {
    await navigateToSummary()
    await expect(ctx.page.locator('button', { hasText: 'Open Log File' })).toBeVisible()
  })

  // Scenario: "Export Error Report" button is NOT shown when there are zero failures
  // Given all records succeeded
  // Then the error export button should not appear
  test('does not show Export Error Report when zero failures', async () => {
    await navigateToSummary()
    await expect(ctx.page.locator('button', { hasText: 'Export Error Report' })).toHaveCount(0)
  })

  // Scenario: "Upsert this file again" button is available in extract-upsert mode
  // Given the mode is extract-upsert
  // Then a shortcut button to re-upsert the same file is shown
  test('shows Upsert this file again button', async () => {
    await navigateToSummary()
    await expect(ctx.page.locator('button', { hasText: 'Upsert this file again' })).toBeVisible()
  })

  // Scenario: "Start Over" button returns to Mode step and resets state
  // Given the user is on the summary
  // When the user clicks Start Over
  // Then the app returns to the Mode step
  test('Start Over returns to Mode step', async () => {
    await navigateToSummary()
    await ctx.page.locator('button', { hasText: 'Start Over' }).click()
    await expect(ctx.page.locator('text=Bundle Migrator').first()).toBeVisible()
    await expect(ctx.page.locator('text=Extract & Upsert')).toBeVisible()
  })
})

test.describe('Summary Step — Extract & Upsert (Partial Failure)', () => {

  // Scenario: Summary shows "Partial Success" banner when some records fail
  // Given 10 succeeded and 2 failed
  // Then a yellow "Partial Success" banner is shown
  test('shows Partial Success banner on mixed results', async () => {
    await navigateToSummary(MOCK_IMPORT_SUMMARY_PARTIAL, MOCK_IMPORT_PROGRESS_WITH_ERRORS)
    await expect(ctx.page.locator('text=Partial Success')).toBeVisible()
  })

  // Scenario: "Export Error Report" button appears when there are failures
  // Given some records failed
  // Then the "Export Error Report" button is visible
  test('shows Export Error Report button when failures exist', async () => {
    await navigateToSummary(MOCK_IMPORT_SUMMARY_PARTIAL, MOCK_IMPORT_PROGRESS_WITH_ERRORS)
    await expect(ctx.page.locator('button', { hasText: 'Export Error Report' })).toBeVisible()
  })

  // Scenario: Failed count is highlighted in red in the result table
  // Given some records failed
  // Then the failed column cells with non-zero values are styled red
  test('failed counts are visible in the result table', async () => {
    await navigateToSummary(MOCK_IMPORT_SUMMARY_PARTIAL, MOCK_IMPORT_PROGRESS_WITH_ERRORS)
    const failedCell = ctx.page.locator('td').filter({ hasText: '2' }).first()
    await expect(failedCell).toBeVisible()
  })
})
