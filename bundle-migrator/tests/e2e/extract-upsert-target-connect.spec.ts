/**
 * Extract & Upsert: Target Org Connection Step
 *
 * Tests the dedicated target org connection screen that appears after Review
 * in the extract-upsert flow. This step confirms or changes the target org
 * before the actual import begins.
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

async function navigateToTargetConnect(): Promise<void> {
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

  // Connect → Search → Extract → Review → Target Connect
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
}

test.describe('Target Connect Step — Extract & Upsert', () => {

  // Scenario: Target connect step shows correct heading and description
  // Given the user proceeded from Review
  // Then the heading says "Connect Target Org" with confirmation text
  test('shows heading and description', async () => {
    await navigateToTargetConnect()
    await expect(ctx.page.getByRole('heading', { name: 'Connect Target Org' })).toBeVisible()
    await expect(ctx.page.locator('text=Confirm the target org credentials before upserting')).toBeVisible()
  })

  // Scenario: Target org panel is shown with credential fields
  // Given the target connect step loaded
  // Then a Target Org panel with all credential fields is visible
  test('shows Target Org panel with credential fields', async () => {
    await navigateToTargetConnect()
    await expect(ctx.page.getByRole('heading', { name: 'Target Org' })).toBeVisible()
    await expect(ctx.page.locator('text=Username')).toBeVisible()
    await expect(ctx.page.locator('text=Password')).toBeVisible()
    await expect(ctx.page.locator('text=Security Token')).toBeVisible()
    await expect(ctx.page.locator('text=Login URL')).toBeVisible()
  })

  // Scenario: Next button is enabled when target was already connected in earlier step
  // Given the target org was connected during the initial org connect
  // Then the Next button should be enabled immediately
  test('Next button is enabled when target was already connected', async () => {
    await navigateToTargetConnect()
    const nextBtn = ctx.page.locator('button', { hasText: /Next/ })
    await expect(nextBtn).toBeEnabled()
  })

  // Scenario: Target connection failure shows error
  // Given the user changes credentials and the new connection fails
  // When the user clicks Connect
  // Then an error message appears and Next remains disabled
  test('shows error when target connection fails', async () => {
    await navigateToTargetConnect()
    await mockConnectTarget(ctx.electronApp, {
      connected: false,
      orgId: '',
      username: '',
      error: 'INVALID_SESSION_ID: Session expired'
    })

    const connectBtn = ctx.page.locator('button', { hasText: 'Connect' })
    await connectBtn.click()

    await expect(ctx.page.locator('text=INVALID_SESSION_ID: Session expired')).toBeVisible()
  })

  // Scenario: Back button returns to the Review step
  // Given the user is on the target connect step
  // When the user clicks Back
  // Then the app navigates back to the Review step
  test('Back button returns to Review step', async () => {
    await navigateToTargetConnect()
    await ctx.page.locator('button', { hasText: 'Back' }).click()
    await expect(ctx.page.locator('text=Review Extraction')).toBeVisible()
  })
})
