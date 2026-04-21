/**
 * Extract & Upsert: Exploratory Tests
 *
 * Cross-cutting, edge-case, and regression scenarios that span multiple steps
 * or test unusual user paths through the Extract & Upsert flow.
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
  MOCK_IMPORT_SUMMARY_SUCCESS
} from './helpers/fixtures'

let ctx: AppContext

test.beforeAll(async () => {
  ctx = await launchApp()
})

test.afterAll(async () => {
  await closeApp(ctx)
})

async function setupOrgMocks(): Promise<void> {
  await mockConnectSource(ctx.electronApp)
  await mockConnectTarget(ctx.electronApp)
  await mockSaveCredentials(ctx.electronApp)
  await mockSearchBundles(ctx.electronApp, MOCK_BUNDLES_TEMPLATES)
}

async function connectBothOrgs(): Promise<void> {
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
}

test.describe('Exploratory — Full End-to-End Happy Path', () => {

  // Scenario: Complete E2E flow from Mode selection through Summary
  // Given the user starts from Mode
  // When they go through every step: Mode → Connect → Search → Extract → Review → Target → Import → Summary
  // Then the app reaches Summary showing "Upsert Complete"
  test('full happy path from Mode to Summary completes successfully', async () => {
    await ensureOnModeStep(ctx.page)
    await setupOrgMocks()

    await ctx.page.locator('text=Extract & Upsert').click()
    await expect(ctx.page.locator('text=Connect to Salesforce Orgs')).toBeVisible()

    await connectBothOrgs()

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

    await mockImportBundle(ctx.electronApp, MOCK_IMPORT_SUMMARY_SUCCESS, MOCK_IMPORT_PROGRESS)
    await ctx.page.locator('button', { hasText: /Next/ }).click()
    await expect(ctx.page.locator('text=Importing Bundle')).toBeVisible()
    await expect(ctx.page.locator('text=Import complete')).toBeVisible({ timeout: 15_000 })

    await ctx.page.locator('button', { hasText: /Next/ }).click()
    await expect(ctx.page.locator('text=Upsert Complete')).toBeVisible()
  })
})

test.describe('Exploratory — Backward Navigation', () => {

  // Scenario: User navigates backward through all steps without breaking state
  // Given the user is on the Review step
  // When they click Back multiple times through Extract → Search → Connect → Mode
  // Then each step renders correctly without errors
  test('backward navigation through all steps preserves state', async () => {
    await ensureOnModeStep(ctx.page)
    await setupOrgMocks()

    await ctx.page.locator('text=Extract & Upsert').click()
    await connectBothOrgs()

    await ctx.page.locator('button', { hasText: /Next/ }).click()
    await expect(ctx.page.locator('text=Select a Bundle')).toBeVisible()

    await ctx.page.locator('text=QA Testing Template v5').click()
    await mockExtractBundle(ctx.electronApp, MOCK_BUNDLE_EXPORT, MOCK_EXTRACT_PROGRESS)
    await ctx.page.locator('button', { hasText: 'Extract Selected Bundle' }).click()
    await ctx.page.locator('button', { hasText: 'Start Extraction' }).click()
    await expect(ctx.page.locator('text=Extraction complete')).toBeVisible({ timeout: 15_000 })

    await ctx.page.locator('button', { hasText: /Next/ }).click()
    await expect(ctx.page.locator('text=Review Extraction')).toBeVisible()

    // Now go back all the way
    await ctx.page.locator('button', { hasText: 'Back' }).click()
    await expect(ctx.page.locator('text=Extracting Bundle')).toBeVisible()

    await ctx.page.locator('button', { hasText: 'Back' }).click()
    await expect(ctx.page.locator('text=Select a Bundle')).toBeVisible()

    await ctx.page.locator('button', { hasText: 'Back' }).click()
    await expect(ctx.page.locator('text=Connect to Salesforce Orgs')).toBeVisible()

    await ctx.page.locator('button', { hasText: 'Back' }).click()
    await expect(ctx.page.locator('text=Extract & Upsert')).toBeVisible()
  })

  // Scenario: Returning to extract step after review shows the previous result
  // Given the extraction already completed
  // When the user goes back to extract from review
  // Then the extract step still shows "Extraction complete" (not a blank state)
  test('returning to extract step shows already-completed extraction', async () => {
    await ensureOnModeStep(ctx.page)
    await setupOrgMocks()

    await ctx.page.locator('text=Extract & Upsert').click()
    await connectBothOrgs()
    await ctx.page.locator('button', { hasText: /Next/ }).click()

    await ctx.page.locator('text=QA Testing Template v5').click()
    await mockExtractBundle(ctx.electronApp, MOCK_BUNDLE_EXPORT, MOCK_EXTRACT_PROGRESS)
    await ctx.page.locator('button', { hasText: 'Extract Selected Bundle' }).click()
    await ctx.page.locator('button', { hasText: 'Start Extraction' }).click()
    await expect(ctx.page.locator('text=Extraction complete')).toBeVisible({ timeout: 15_000 })

    await ctx.page.locator('button', { hasText: /Next/ }).click()
    await expect(ctx.page.locator('text=Review Extraction')).toBeVisible()

    await ctx.page.locator('button', { hasText: 'Back' }).click()
    await expect(ctx.page.locator('text=Extracting Bundle')).toBeVisible()
    await expect(ctx.page.locator('text=100%')).toBeVisible()
  })
})

test.describe('Exploratory — Empty & Edge States', () => {

  // Scenario: Bundle search returns empty results
  // Given the source org has no bundles matching the search
  // When the search completes
  // Then "0 results found" is shown and Extract button stays disabled
  test('empty search results shows zero count', async () => {
    await ensureOnModeStep(ctx.page)
    await setupOrgMocks()
    await mockSearchBundles(ctx.electronApp, [])

    await ctx.page.locator('text=Extract & Upsert').click()
    await connectBothOrgs()
    await ctx.page.locator('button', { hasText: /Next/ }).click()
    await expect(ctx.page.locator('text=Select a Bundle')).toBeVisible()
    await expect(ctx.page.locator('text=0 results found')).toBeVisible()
    await expect(ctx.page.locator('button', { hasText: 'Extract Selected Bundle' })).toBeDisabled()
  })

  // Scenario: Search API error is displayed to the user
  // Given the bundle search IPC call throws an error
  // Then an error banner is shown on the search step
  test('search API error shows error banner', async () => {
    await ensureOnModeStep(ctx.page)
    await mockConnectSource(ctx.electronApp)
    await mockConnectTarget(ctx.electronApp)
    await mockSaveCredentials(ctx.electronApp)
    await ctx.electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('sf:searchBundles')
      ipcMain.handle('sf:searchBundles', () =>
        Promise.reject(new Error('INVALID_FIELD: No such column: LLC_BI__lookupKey__c'))
      )
    })

    await ctx.page.locator('text=Extract & Upsert').click()
    await connectBothOrgs()
    await ctx.page.locator('button', { hasText: /Next/ }).click()
    await expect(ctx.page.locator('text=INVALID_FIELD')).toBeVisible({ timeout: 10_000 })
  })

  // Scenario: Only source connected, Next is still disabled (need both for extract-upsert)
  // Given the user connected the source org but not the target
  // Then the Next button remains disabled
  test('Next disabled when only source is connected', async () => {
    await ensureOnModeStep(ctx.page)
    await mockConnectSource(ctx.electronApp)
    await mockSaveCredentials(ctx.electronApp)

    await ctx.page.locator('text=Extract & Upsert').click()
    await expect(ctx.page.locator('text=Connect to Salesforce Orgs')).toBeVisible()

    const usernameInputs = ctx.page.locator('input[type="text"]')
    await usernameInputs.first().fill('source@test.org')
    const connectButtons = ctx.page.locator('button', { hasText: 'Connect' })
    await connectButtons.first().click()
    await expect(ctx.page.locator('text=Org ID: ORG_SOURCE_001')).toBeVisible()

    const nextBtn = ctx.page.locator('button', { hasText: /Next/ })
    await expect(nextBtn).toBeDisabled()
  })
})

test.describe('Exploratory — "Upsert this file again" Shortcut', () => {

  // Scenario: User clicks "Upsert this file again" from Summary to re-import
  // Given the user finished an extract-upsert flow and is on Summary
  // When they click "Upsert this file again"
  // Then the app switches to upsert-only mode and goes to Connect step
  test('Upsert this file again switches to upsert-only mode', async () => {
    await ensureOnModeStep(ctx.page)
    await setupOrgMocks()

    await ctx.page.locator('text=Extract & Upsert').click()
    await connectBothOrgs()
    await ctx.page.locator('button', { hasText: /Next/ }).click()

    await ctx.page.locator('text=QA Testing Template v5').click()
    await mockExtractBundle(ctx.electronApp, MOCK_BUNDLE_EXPORT, MOCK_EXTRACT_PROGRESS)
    await ctx.page.locator('button', { hasText: 'Extract Selected Bundle' }).click()
    await ctx.page.locator('button', { hasText: 'Start Extraction' }).click()
    await expect(ctx.page.locator('text=Extraction complete')).toBeVisible({ timeout: 15_000 })

    await ctx.page.locator('button', { hasText: /Next/ }).click()
    await ctx.page.locator('button', { hasText: 'Proceed with Upsert' }).click()

    await mockImportBundle(ctx.electronApp, MOCK_IMPORT_SUMMARY_SUCCESS, MOCK_IMPORT_PROGRESS)
    await ctx.page.locator('button', { hasText: /Next/ }).click()
    await expect(ctx.page.locator('text=Import complete')).toBeVisible({ timeout: 15_000 })

    await ctx.page.locator('button', { hasText: /Next/ }).click()
    await expect(ctx.page.locator('text=Upsert Complete')).toBeVisible()

    await ctx.page.locator('button', { hasText: 'Upsert this file again' }).click()
    // Should switch to upsert-only mode and show target connect
    await expect(ctx.page.locator('text=Connect to Target Org')).toBeVisible()
  })
})

test.describe('Exploratory — Mode Step Isolation', () => {

  // Scenario: Each mode card navigates to the correct first step
  // Given the user is on the Mode step
  // When they click each mode
  // Then the correct first step appears for that mode

  test('Extract Only navigates to org connection', async () => {
    await ensureOnModeStep(ctx.page)
    await ctx.page.locator('text=Extract Only').click()
    await expect(ctx.page.locator('text=Connect to Salesforce Orgs')).toBeVisible()
    await ctx.page.locator('button', { hasText: 'Back' }).click()
  })

  test('Upsert Only navigates to target org connection', async () => {
    await ensureOnModeStep(ctx.page)
    await ctx.page.locator('text=Upsert Only').click()
    await expect(ctx.page.locator('text=Connect to Target Org')).toBeVisible()
    await ctx.page.locator('button', { hasText: 'Back' }).click()
  })

  test('Compare Bundles navigates to file select', async () => {
    await ensureOnModeStep(ctx.page)
    await ctx.page.locator('text=Compare Bundles').click()
    await expect(ctx.page.locator('text=Select Bundles to Compare')).toBeVisible()
    await ctx.page.locator('button', { hasText: 'Back' }).click()
  })
})
