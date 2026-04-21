/**
 * Extract & Upsert: Bundle Search Step
 *
 * Tests the bundle search/selection table where users pick a bundle to extract.
 * Covers tab switching (Templates / Bundles / All), filtering, row selection,
 * and the Extract Selected Bundle button.
 */
import { test, expect } from '@playwright/test'
import {
  launchApp,
  closeApp,
  ensureOnModeStep,
  mockConnectSource,
  mockConnectTarget,
  mockSearchBundles,
  mockSaveCredentials,
  type AppContext
} from './helpers/electron-app'
import {
  MOCK_BUNDLES_TEMPLATES,
  MOCK_BUNDLES_ALL
} from './helpers/fixtures'

let ctx: AppContext

test.beforeAll(async () => {
  ctx = await launchApp()
})

test.afterAll(async () => {
  await closeApp(ctx)
})

async function navigateToBundleSearch(): Promise<void> {
  await ensureOnModeStep(ctx.page)
  await mockConnectSource(ctx.electronApp)
  await mockConnectTarget(ctx.electronApp)
  await mockSaveCredentials(ctx.electronApp)
  await mockSearchBundles(ctx.electronApp, MOCK_BUNDLES_TEMPLATES)

  await ctx.page.locator('text=Extract & Upsert').click()
  await expect(ctx.page.locator('text=Connect to Salesforce Orgs')).toBeVisible()

  // Fill and connect source
  const usernameInputs = ctx.page.locator('input[type="text"]')
  await usernameInputs.first().fill('source@test.org')
  const connectButtons = ctx.page.locator('button', { hasText: 'Connect' })
  await connectButtons.first().click()
  await expect(ctx.page.locator('text=Org ID: ORG_SOURCE_001')).toBeVisible()

  // Fill and connect target
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

  // Navigate to search
  await ctx.page.locator('button', { hasText: /Next/ }).click()
  await expect(ctx.page.locator('text=Select a Bundle')).toBeVisible()
}

test.describe('Bundle Search — Extract & Upsert', () => {

  // Scenario: The bundle search step shows the heading and filter controls
  // Given the user has connected both orgs and navigated forward
  // Then the "Select a Bundle" heading and tab buttons are visible
  test('shows heading and tab buttons', async () => {
    await navigateToBundleSearch()
    await expect(ctx.page.getByRole('heading', { name: 'Select a Bundle' })).toBeVisible()
    await expect(ctx.page.locator('button', { hasText: 'Templates' })).toBeVisible()
    await expect(ctx.page.locator('button', { hasText: 'Bundles' })).toBeVisible()
    await expect(ctx.page.locator('button', { hasText: /^All$/ })).toBeVisible()
  })

  // Scenario: Templates tab is active by default and shows template results
  // Given the search step loaded
  // Then the Templates tab is the solid variant (active) and template names appear
  test('Templates tab is active by default', async () => {
    await navigateToBundleSearch()
    const templatesBtn = ctx.page.locator('button', { hasText: 'Templates' })
    await expect(templatesBtn).toHaveClass(/rt-variant-solid/)
  })

  // Scenario: Template results are displayed in the table
  // Given the mock returns 3 templates
  // Then all 3 should appear in the results table
  test('displays template results in the table', async () => {
    await navigateToBundleSearch()
    await expect(ctx.page.locator('text=QA Testing Template v5')).toBeVisible()
    await expect(ctx.page.locator('text=Client Template v3')).toBeVisible()
    await expect(ctx.page.locator('text=CRE Consolidation Template')).toBeVisible()
    await expect(ctx.page.locator('text=3 results found')).toBeVisible()
  })

  // Scenario: Extract button is disabled when no bundle is selected
  // Given no row has been clicked
  // Then the "Extract Selected Bundle" button should be disabled
  test('Extract button is disabled when no bundle selected', async () => {
    await navigateToBundleSearch()
    const extractBtn = ctx.page.locator('button', { hasText: 'Extract Selected Bundle' })
    await expect(extractBtn).toBeDisabled()
  })

  // Scenario: User selects a bundle by clicking a table row
  // Given the template list is displayed
  // When the user clicks on a bundle row
  // Then the row becomes highlighted and the Extract button becomes enabled
  test('clicking a row selects the bundle and enables Extract button', async () => {
    await navigateToBundleSearch()
    await ctx.page.locator('text=QA Testing Template v5').click()
    const extractBtn = ctx.page.locator('button', { hasText: 'Extract Selected Bundle' })
    await expect(extractBtn).toBeEnabled()
  })

  // Scenario: User filters the bundle list with the search input
  // Given the template list is displayed
  // When the user types in the search field
  // Then only matching bundles are shown and the result count updates
  test('search input filters the bundle list', async () => {
    await navigateToBundleSearch()
    const searchInput = ctx.page.locator('input[placeholder="Search templates by name..."]')
    await searchInput.fill('CRE')
    await expect(ctx.page.locator('text=CRE Consolidation Template')).toBeVisible()
    await expect(ctx.page.locator('text=1 result found')).toBeVisible()

    await searchInput.clear()
    await expect(ctx.page.locator('text=3 results found')).toBeVisible()
  })

  // Scenario: Switching to "All" tab shows both templates and bundles
  // Given the user is on the Templates tab
  // When the user clicks the "All" tab
  // Then both templates and bundles appear with the Type column
  test('switching to All tab shows all bundles and templates', async () => {
    await navigateToBundleSearch()
    await mockSearchBundles(ctx.electronApp, MOCK_BUNDLES_ALL)
    await ctx.page.locator('button', { hasText: /^All$/ }).click()
    await expect(ctx.page.locator('text=4 results found')).toBeVisible()
    await expect(ctx.page.locator('text=Acme Corp Q4 Bundle')).toBeVisible()
  })

  // Scenario: Switching to "Bundles" tab shows the account/borrower info tip
  // Given the user is on any tab
  // When the user clicks the "Bundles" tab
  // Then a blue info box about borrower accounts is shown
  test('Bundles tab shows borrower info tip', async () => {
    await navigateToBundleSearch()
    await mockSearchBundles(ctx.electronApp, MOCK_BUNDLES_ALL.filter(b => !b.isTemplate))
    await ctx.page.locator('button', { hasText: 'Bundles' }).click()
    await expect(ctx.page.locator('text=Bundles are associated with specific borrower accounts')).toBeVisible()
  })

  // Scenario: Search placeholder text changes per tab
  // Given the user is on the Templates tab
  // Then the placeholder says "Search templates by name..."
  // When the user switches to Bundles
  // Then the placeholder changes to "Search by bundle name or account..."
  test('search placeholder text changes per tab', async () => {
    await navigateToBundleSearch()
    await expect(ctx.page.locator('input[placeholder="Search templates by name..."]')).toBeVisible()
    await mockSearchBundles(ctx.electronApp, [])
    await ctx.page.locator('button', { hasText: 'Bundles' }).click()
    await expect(ctx.page.locator('input[placeholder="Search by bundle name or account..."]')).toBeVisible()
  })

  // Scenario: Back button returns to org connection step
  // Given the user is on the bundle search step
  // When the user clicks Back
  // Then the app returns to the org connection step
  test('Back button returns to org connection step', async () => {
    await navigateToBundleSearch()
    await ctx.page.locator('button', { hasText: 'Back' }).click()
    await expect(ctx.page.locator('text=Connect to Salesforce Orgs')).toBeVisible()
  })
})
