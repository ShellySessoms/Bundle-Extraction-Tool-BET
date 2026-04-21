/**
 * Extract & Upsert: Review Step
 *
 * Tests the review screen that displays extracted bundle data before upserting.
 * Covers the record summary table, reference data panel, schedule/debt schedule
 * sections, template detection, and the "Proceed with Upsert" button.
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

async function navigateToReviewStep(): Promise<void> {
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

  // Connect → Search
  await ctx.page.locator('button', { hasText: /Next/ }).click()
  await expect(ctx.page.locator('text=Select a Bundle')).toBeVisible()

  // Search → Extract
  await ctx.page.locator('text=QA Testing Template v5').click()
  await mockExtractBundle(ctx.electronApp, MOCK_BUNDLE_EXPORT, MOCK_EXTRACT_PROGRESS)
  await ctx.page.locator('button', { hasText: 'Extract Selected Bundle' }).click()
  await expect(ctx.page.locator('text=Extracting Bundle')).toBeVisible()

  // Start extraction and wait
  await ctx.page.locator('button', { hasText: 'Start Extraction' }).click()
  await expect(ctx.page.locator('text=Extraction complete')).toBeVisible({ timeout: 15_000 })

  // Extract → Review
  await ctx.page.locator('button', { hasText: /Next/ }).click()
  await expect(ctx.page.locator('text=Review Extraction')).toBeVisible()
}

test.describe('Review Step — Extract & Upsert', () => {

  // Scenario: Review step shows the heading and description for extract-upsert mode
  // Given the extraction completed and the user navigated to review
  // Then the heading says "Review Extraction" and the description mentions upserting
  test('shows correct heading and description', async () => {
    await navigateToReviewStep()
    await expect(ctx.page.getByRole('heading', { name: 'Review Extraction' })).toBeVisible()
    await expect(ctx.page.locator('text=Review the extracted data before upserting')).toBeVisible()
  })

  // Scenario: Summary table shows all object API names and record counts
  // Given bundle data was extracted
  // Then the table shows each Salesforce object with its count and a Total row
  test('displays record count table with all objects', async () => {
    await navigateToReviewStep()
    await expect(ctx.page.locator('text=Object API Name')).toBeVisible()
    await expect(ctx.page.locator('text=Record Count')).toBeVisible()
    await expect(ctx.page.locator('text=LLC_BI__Underwriting_Bundle__c').first()).toBeVisible()
    await expect(ctx.page.locator('text=LLC_BI__Spread_Statement_Type__c').first()).toBeVisible()
    await expect(ctx.page.locator('text=Total').first()).toBeVisible()
  })

  // Scenario: Empty objects are flagged with a yellow warning banner
  // Given some objects have 0 records (e.g., Period data on a template)
  // Then a yellow warning lists the empty objects
  test('shows warning banner for empty objects', async () => {
    await navigateToReviewStep()
    await expect(ctx.page.locator('text=/object\\(s\\) have 0 records/')).toBeVisible()
  })

  // Scenario: Template bundles show a blue info banner about periods
  // Given the bundle has no Spread_Statement_Period records (template)
  // Then a blue info banner explains that periods are created on instantiation
  test('shows template info banner when no period data exists', async () => {
    await navigateToReviewStep()
    await expect(ctx.page.locator('text=Periods and period data')).toBeVisible()
  })

  // Scenario: Reference data section shows financial consolidation and classifications
  // Given the bundle has reference data
  // Then the Financial Consolidation, Classifications, and Projections Templates are displayed
  test('shows reference data panel', async () => {
    await navigateToReviewStep()
    await expect(ctx.page.getByRole('heading', { name: 'Reference Data (will resolve in target)' })).toBeVisible()
    await expect(ctx.page.locator('text=Standard Consolidation')).toBeVisible()
    await expect(ctx.page.locator('text=Commercial')).toBeVisible()
  })

  // Scenario: Schedules section shows schedule counts
  // Given the bundle has schedule data
  // Then the Schedules section shows LLC_BI__Schedule__c and entry counts
  test('shows Schedules section with counts', async () => {
    await navigateToReviewStep()
    const schedulesHeading = ctx.page.getByRole('heading', { name: 'Schedules' }).first()
    await expect(schedulesHeading).toBeVisible()
  })

  // Scenario: Debt Schedules section shows debt schedule counts
  // Given the bundle has debt schedule data
  // Then the Debt Schedules section shows relevant object counts
  test('shows Debt Schedules section with counts', async () => {
    await navigateToReviewStep()
    await expect(ctx.page.getByRole('heading', { name: 'Debt Schedules' })).toBeVisible()
  })

  // Scenario: Export file path is displayed
  // Given the bundle was extracted to a file
  // Then the file path is shown in a gray box
  test('displays the export file path', async () => {
    await navigateToReviewStep()
    await expect(ctx.page.locator('text=Export file:')).toBeVisible()
    await expect(ctx.page.locator('text=/QA_Testing_Template_v5/')).toBeVisible()
  })

  // Scenario: "Proceed with Upsert" button is visible in extract-upsert mode
  // Given the mode is extract-upsert
  // Then the "Proceed with Upsert" button is shown (not "Open File" or "Start Over")
  test('shows Proceed with Upsert button', async () => {
    await navigateToReviewStep()
    await expect(ctx.page.locator('button', { hasText: 'Proceed with Upsert' })).toBeVisible()
  })

  // Scenario: "Open File" and "Start Over" buttons are NOT shown in extract-upsert mode
  // Given the mode is extract-upsert (not extract-only)
  // Then the "Open File" and "Start Over" buttons should not appear on the review step
  test('does not show Open File or Start Over on review in extract-upsert mode', async () => {
    await navigateToReviewStep()
    await expect(ctx.page.locator('button', { hasText: 'Open File' })).toHaveCount(0)
    await expect(ctx.page.locator('button', { hasText: 'Start Over' })).toHaveCount(0)
  })

  // Scenario: Back button returns to the extract step
  // Given the user is on the review step
  // When the user clicks Back
  // Then the app returns to the extract step
  test('Back button returns to extract step', async () => {
    await navigateToReviewStep()
    await ctx.page.locator('button', { hasText: 'Back' }).click()
    await expect(ctx.page.locator('text=Extracting Bundle')).toBeVisible()
  })
})
