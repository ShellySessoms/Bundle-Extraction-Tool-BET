/**
 * Extract & Upsert: Mode Selection Step
 *
 * Tests the landing page mode selection for the Extract & Upsert workflow.
 * Verifies the card is visible, clickable, and routes to the correct next step.
 */
import { test, expect } from '@playwright/test'
import {
  launchApp,
  closeApp,
  ensureOnModeStep,
  type AppContext
} from './helpers/electron-app'

let ctx: AppContext

test.beforeAll(async () => {
  ctx = await launchApp()
})

test.afterAll(async () => {
  await closeApp(ctx)
})

test.describe('Mode Selection — Extract & Upsert', () => {

  // Scenario: User sees all four workflow options on the landing page
  // Given the app has launched
  // Then the user should see all four mode cards
  test('displays all four mode cards on the landing page', async () => {
    await ensureOnModeStep(ctx.page)
    await expect(ctx.page.locator('text=Extract Only')).toBeVisible()
    await expect(ctx.page.locator('text=Extract & Upsert')).toBeVisible()
    await expect(ctx.page.locator('text=Upsert Only')).toBeVisible()
    await expect(ctx.page.locator('text=Compare Bundles')).toBeVisible()
  })

  // Scenario: User sees the app title and subtitle
  // Given the app has launched
  // Then the user should see "Bundle Migrator" and the subtitle
  test('shows the app title and subtitle', async () => {
    await ensureOnModeStep(ctx.page)
    await expect(ctx.page.locator('text=Bundle Migrator').first()).toBeVisible()
    await expect(ctx.page.locator('text=Migrate Salesforce LLC_BI underwriting bundles between orgs')).toBeVisible()
  })

  // Scenario: User sees no Back button on the landing page
  // Given the user is on the Mode step
  // Then there should be no Back button since this is the first step
  test('does not show a Back button on the landing page', async () => {
    await ensureOnModeStep(ctx.page)
    const backButton = ctx.page.locator('button', { hasText: 'Back' })
    await expect(backButton).toHaveCount(0)
  })

  // Scenario: User selects Extract & Upsert and navigates to org connection
  // Given the user is on the Mode step
  // When the user clicks "Extract & Upsert"
  // Then the app navigates to the org connection step
  test('clicking Extract & Upsert navigates to org connection step', async () => {
    await ensureOnModeStep(ctx.page)
    await ctx.page.locator('text=Extract & Upsert').click()
    await expect(ctx.page.locator('text=Connect to Salesforce Orgs')).toBeVisible()
  })

  // Scenario: The breadcrumb displays the correct steps for extract-upsert mode
  // Given the user has selected Extract & Upsert
  // Then the breadcrumb should show all eight steps in the flow
  test('breadcrumb shows correct steps for extract-upsert mode', async () => {
    await expect(ctx.page.locator('text=Mode')).toBeVisible()
    await expect(ctx.page.locator('text=Connect')).toBeVisible()
    await expect(ctx.page.locator('text=Select Bundle')).toBeVisible()
    await expect(ctx.page.locator('text=Extract')).toBeVisible()
    await expect(ctx.page.locator('text=Review')).toBeVisible()
    await expect(ctx.page.locator('text=Target Org')).toBeVisible()
    await expect(ctx.page.locator('text=Upsert')).toBeVisible()
    await expect(ctx.page.locator('text=Summary')).toBeVisible()
  })

  // Scenario: Back button returns to the landing page from org connect
  // Given the user is on the org connection step
  // When the user clicks Back
  // Then the app returns to the Mode step
  test('Back button from org connect returns to mode step', async () => {
    await ctx.page.locator('button', { hasText: 'Back' }).click()
    await expect(ctx.page.locator('text=Bundle Migrator').first()).toBeVisible()
    await expect(ctx.page.locator('text=Extract & Upsert')).toBeVisible()
  })
})
