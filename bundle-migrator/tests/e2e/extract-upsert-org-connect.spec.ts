/**
 * Extract & Upsert: Org Connection Step
 *
 * Tests the dual-org connection screen where the user enters credentials
 * and connects to both source and target Salesforce orgs.
 */
import { test, expect } from '@playwright/test'
import {
  launchApp,
  closeApp,
  ensureOnModeStep,
  mockConnectSource,
  mockConnectTarget,
  mockSaveCredentials,
  type AppContext
} from './helpers/electron-app'

let ctx: AppContext

test.beforeAll(async () => {
  ctx = await launchApp()
})

test.afterAll(async () => {
  await closeApp(ctx)
})

async function navigateToOrgConnect(): Promise<void> {
  await ensureOnModeStep(ctx.page)
  await ctx.page.locator('text=Extract & Upsert').click()
  await expect(ctx.page.locator('text=Connect to Salesforce Orgs')).toBeVisible()
}

test.describe('Org Connection — Extract & Upsert', () => {

  // Scenario: Both Source and Target org panels are shown
  // Given the user selected Extract & Upsert
  // When the org connection step renders
  // Then both Source Org and Target Org panels are visible
  test('shows both Source Org and Target Org panels', async () => {
    await navigateToOrgConnect()
    await expect(ctx.page.getByRole('heading', { name: 'Source Org' })).toBeVisible()
    await expect(ctx.page.getByRole('heading', { name: 'Target Org' })).toBeVisible()
  })

  // Scenario: Each org panel has username, password, token, and login URL fields
  // Given the user is on the org connection step
  // Then each panel should have all four credential fields
  test('each org panel has all credential fields', async () => {
    await navigateToOrgConnect()
    const usernameFields = ctx.page.locator('text=Username')
    await expect(usernameFields).toHaveCount(2)

    const passwordFields = ctx.page.locator('text=Password')
    await expect(passwordFields).toHaveCount(2)

    const tokenFields = ctx.page.locator('text=Security Token')
    await expect(tokenFields).toHaveCount(2)

    const loginUrlFields = ctx.page.locator('text=Login URL')
    await expect(loginUrlFields).toHaveCount(2)
  })

  // Scenario: Next button is disabled until both orgs are connected
  // Given neither org is connected yet
  // Then the Next button should be disabled
  test('Next button is disabled when no orgs are connected', async () => {
    await navigateToOrgConnect()
    const nextBtn = ctx.page.locator('button', { hasText: /Next/ })
    await expect(nextBtn).toBeDisabled()
  })

  // Scenario: Connect button is disabled when username is empty
  // Given the username field is blank
  // Then the Connect button for that panel should be disabled
  test('Connect button is disabled when username is empty', async () => {
    await navigateToOrgConnect()
    const connectButtons = ctx.page.locator('button', { hasText: 'Connect' })
    const firstConnect = connectButtons.first()
    await expect(firstConnect).toBeDisabled()
  })

  // Scenario: User connects source org successfully
  // Given the user enters valid source credentials
  // When the user clicks Connect on Source Org
  // Then the Source Org shows "Connected" badge and Org ID
  test('successfully connects to source org', async () => {
    await navigateToOrgConnect()
    await mockConnectSource(ctx.electronApp)
    await mockSaveCredentials(ctx.electronApp)

    const sourcePanel = ctx.page.locator('text=Source Org').locator('..')
    const usernameInputs = ctx.page.locator('input[type="text"]')
    await usernameInputs.first().fill('source@test.org')

    const connectButtons = ctx.page.locator('button', { hasText: 'Connect' })
    await connectButtons.first().click()

    await expect(ctx.page.locator('text=Connected').first()).toBeVisible()
    await expect(ctx.page.locator('text=Org ID: ORG_SOURCE_001')).toBeVisible()
  })

  // Scenario: User connects target org successfully
  // Given the user enters valid target credentials
  // When the user clicks Connect on Target Org
  // Then the Target Org shows "Connected" badge and Org ID
  test('successfully connects to target org', async () => {
    await mockConnectTarget(ctx.electronApp)

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

    const connectButtons = ctx.page.locator('button', { hasText: 'Connect' })
    const targetConnect = connectButtons.nth(1)
    await targetConnect.click()

    await expect(ctx.page.locator('text=Org ID: ORG_TARGET_001')).toBeVisible()
  })

  // Scenario: Next button becomes enabled after both orgs connect
  // Given both source and target orgs are connected
  // Then the Next button should be enabled
  test('Next button is enabled after both orgs are connected', async () => {
    const nextBtn = ctx.page.locator('button', { hasText: /Next/ })
    await expect(nextBtn).toBeEnabled()
  })

  // Scenario: Source org connection fails and shows error
  // Given the user enters invalid source credentials
  // When the connection attempt fails
  // Then a "Failed" badge and error message are shown
  test('shows error badge when source connection fails', async () => {
    await navigateToOrgConnect()
    await mockConnectSource(ctx.electronApp, {
      connected: false,
      orgId: '',
      username: '',
      error: 'INVALID_LOGIN: Invalid username or password'
    })

    const usernameInputs = ctx.page.locator('input[type="text"]')
    await usernameInputs.first().fill('bad@test.org')

    const connectButtons = ctx.page.locator('button', { hasText: 'Connect' })
    await connectButtons.first().click()

    await expect(ctx.page.locator('text=Failed')).toBeVisible()
    await expect(ctx.page.locator('text=INVALID_LOGIN: Invalid username or password')).toBeVisible()
  })

  // Scenario: Target org connection fails and shows error
  // Given the user enters invalid target credentials
  // When the connection attempt fails
  // Then a "Failed" badge and error message are shown
  test('shows error badge when target connection fails', async () => {
    await navigateToOrgConnect()
    await mockConnectTarget(ctx.electronApp, {
      connected: false,
      orgId: '',
      username: '',
      error: 'INVALID_LOGIN: security token required'
    })

    const allInputs = ctx.page.locator('input')
    const inputCount = await allInputs.count()
    for (let i = 0; i < inputCount; i++) {
      const input = allInputs.nth(i)
      const value = await input.inputValue()
      if (value === '' || value === 'https://login.salesforce.com') {
        const type = await input.getAttribute('type')
        if (type === 'text') {
          await input.fill('badtarget@test.org')
          break
        }
      }
    }

    const connectButtons = ctx.page.locator('button', { hasText: 'Connect' })
    await connectButtons.nth(1).click()

    await expect(ctx.page.locator('text=INVALID_LOGIN: security token required')).toBeVisible()
  })

  // Scenario: Save Credentials button persists credentials
  // Given the user has entered credentials
  // When the user clicks Save Credentials
  // Then the credentials are saved without error
  test('Save Credentials button works', async () => {
    await navigateToOrgConnect()
    await mockSaveCredentials(ctx.electronApp)
    const saveBtn = ctx.page.locator('button', { hasText: 'Save Credentials' })
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()
    await ctx.page.waitForTimeout(300)
    await expect(saveBtn).not.toHaveText('Saving...')
  })

  // Scenario: Back button returns to Mode step
  // Given the user is on the org connection step
  // When the user clicks Back
  // Then the app navigates back to the Mode step
  test('Back button returns to Mode step', async () => {
    await navigateToOrgConnect()
    await ctx.page.locator('button', { hasText: 'Back' }).click()
    await expect(ctx.page.locator('text=Extract & Upsert')).toBeVisible()
    await expect(ctx.page.locator('text=Compare Bundles')).toBeVisible()
  })
})
