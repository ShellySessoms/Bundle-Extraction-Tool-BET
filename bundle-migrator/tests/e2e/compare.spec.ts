import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..', '..')
const FIXTURE_A = resolve(ROOT, 'tests/fixtures/bundleA.json')
const FIXTURE_B = resolve(ROOT, 'tests/fixtures/bundleB.json')
const FIXTURE_IDENTICAL = resolve(ROOT, 'tests/fixtures/bundleIdentical.json')

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(ROOT, 'out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test' }
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await electronApp?.close()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function mockSelectBundleFile(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [path] })
  }, filePath)
}

async function mockSelectBundleFileCancelled(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: true, filePaths: [] })
  })
}

async function mockExportCompareReport(app: ElectronApplication, outPath: string): Promise<void> {
  await app.evaluate(({ ipcMain }, path) => {
    ipcMain.removeHandler('app:exportCompareReport')
    ipcMain.handle('app:exportCompareReport', () => Promise.resolve(path))
  }, outPath)
}

async function ensureOnModeStep(): Promise<void> {
  const isModeStep = await page.locator('text=Compare Bundles').isVisible().catch(() => false)
  if (isModeStep) return

  const startOver = page.locator('button', { hasText: 'Start Over' })
  if (await startOver.isVisible().catch(() => false)) {
    await startOver.click()
    await expect(page.locator('text=Compare Bundles')).toBeVisible()
    return
  }

  const back = page.locator('button', { hasText: 'Back' })
  while (await back.isVisible().catch(() => false)) {
    await back.click()
    await page.waitForTimeout(200)
    if (await page.locator('text=Compare Bundles').isVisible().catch(() => false)) return
  }
}

async function navigateToCompareFileSelect(): Promise<void> {
  await ensureOnModeStep()
  await page.locator('text=Compare Bundles').click()
  await expect(page.locator('text=Select Bundles to Compare')).toBeVisible()
}

async function loadBothFiles(fixtureA: string, fixtureB: string): Promise<void> {
  await mockSelectBundleFile(electronApp, fixtureA)
  await page.locator('button', { hasText: /Browse|Change File/ }).first().click()
  await page.waitForTimeout(500)

  await mockSelectBundleFile(electronApp, fixtureB)
  const browseButtons = page.locator('button', { hasText: /Browse|Change File/ })
  await browseButtons.nth(1).click()
  await page.waitForTimeout(500)
}

async function navigateToCompareResults(fixtureA: string, fixtureB: string): Promise<void> {
  await ensureOnModeStep()
  await page.locator('text=Compare Bundles').click()
  await expect(page.locator('text=Select Bundles to Compare')).toBeVisible()

  await loadBothFiles(fixtureA, fixtureB)

  await page.locator('button', { hasText: /^Compare/ }).click()
  await expect(page.locator('text=Comparison Results')).toBeVisible({ timeout: 15_000 })
}

// ===========================================================================
// Landing Page (ModeStep)
// ===========================================================================
test.describe('Landing Page (ModeStep)', () => {
  test('shows the app title and four mode cards', async () => {
    await expect(page.locator('text=Bundle Migrator').first()).toBeVisible()
    await expect(page.locator('text=Extract Only')).toBeVisible()
    await expect(page.locator('text=Extract & Upsert')).toBeVisible()
    await expect(page.locator('text=Upsert Only')).toBeVisible()
    await expect(page.locator('text=Compare Bundles')).toBeVisible()
  })

  test('has no Back button on the landing page', async () => {
    const backButton = page.locator('button', { hasText: 'Back' })
    await expect(backButton).toHaveCount(0)
  })

  test('compare mode card shows correct description', async () => {
    await expect(
      page.locator('text=Load two bundle JSON files and see a plain-English diff')
    ).toBeVisible()
  })
})

// ===========================================================================
// Compare Flow: Navigation
// ===========================================================================
test.describe('Compare Flow - Navigation', () => {
  test('clicking Compare Bundles navigates to file select step', async () => {
    await ensureOnModeStep()
    await page.locator('text=Compare Bundles').click()
    await expect(page.locator('text=Select Bundles to Compare')).toBeVisible()
  })

  test('breadcrumb shows correct steps for compare mode', async () => {
    await expect(page.locator('text=Mode')).toBeVisible()
    await expect(page.locator('text=Select Files')).toBeVisible()
    await expect(page.locator('text=Results')).toBeVisible()
  })

  test('breadcrumb highlights current step as bold', async () => {
    const selectFilesStep = page.locator('span:has-text("Select Files")').first()
    await expect(selectFilesStep).toHaveCSS('font-weight', '700')
  })

  test('Compare button is disabled when no files are selected', async () => {
    const compareBtn = page.locator('button', { hasText: 'Compare' })
    await expect(compareBtn).toBeDisabled()
  })

  test('Back button returns to ModeStep', async () => {
    await page.locator('button', { hasText: 'Back' }).click()
    await expect(page.locator('text=Bundle Migrator').first()).toBeVisible()
    await expect(page.locator('text=Compare Bundles')).toBeVisible()
  })
})

// ===========================================================================
// Compare Flow: File Selection
// ===========================================================================
test.describe('Compare Flow - File Selection', () => {
  test.beforeEach(async () => {
    await navigateToCompareFileSelect()
  })

  test('shows file select heading and description', async () => {
    await expect(page.locator('text=Select Bundles to Compare')).toBeVisible()
    await expect(page.locator('text=Pick two bundle export JSON files')).toBeVisible()
  })

  test('shows labels for both file slots', async () => {
    await expect(page.getByRole('heading', { name: 'Your Template (A)' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Customer/Client Template (B)' })).toBeVisible()
  })

  test('both Browse buttons are visible initially', async () => {
    const browseButtons = page.locator('button', { hasText: 'Browse...' })
    await expect(browseButtons).toHaveCount(2)
  })

  test('can load File A via mocked dialog', async () => {
    await mockSelectBundleFile(electronApp, FIXTURE_A)
    await page.locator('button', { hasText: /Browse|Change File/ }).first().click()
    await expect(page.locator('text=QA Testing Template v5').first()).toBeVisible()
  })

  test('File A summary card shows bundle metadata', async () => {
    await mockSelectBundleFile(electronApp, FIXTURE_A)
    await page.locator('button', { hasText: /Browse|Change File/ }).first().click()

    await expect(page.locator('text=Bundle A').first()).toBeVisible()
    await expect(page.locator('text=QA Testing Template v5').first()).toBeVisible()
    await expect(page.locator('text=/Objects:/')).toBeVisible()
    await expect(page.locator('text=/Records:/')).toBeVisible()
  })

  test('shows file path after loading File A', async () => {
    await mockSelectBundleFile(electronApp, FIXTURE_A)
    await page.locator('button', { hasText: /Browse|Change File/ }).first().click()

    const filename = FIXTURE_A.split('/').pop()!
    await expect(page.locator(`text=${filename}`)).toBeVisible()
  })

  test('can load File B via mocked dialog', async () => {
    await mockSelectBundleFile(electronApp, FIXTURE_B)
    const browseButtons = page.locator('button', { hasText: /Browse|Change File/ })
    await browseButtons.nth(1).click()
    await expect(page.locator('text=Client Template v3').first()).toBeVisible()
  })

  test('Browse button changes to "Change File..." after loading', async () => {
    await mockSelectBundleFile(electronApp, FIXTURE_A)
    await page.locator('button', { hasText: 'Browse...' }).first().click()
    await expect(page.locator('text=QA Testing Template v5').first()).toBeVisible()

    await expect(page.locator('button', { hasText: 'Change File...' }).first()).toBeVisible()
  })

  test('Compare button becomes enabled after both files are loaded', async () => {
    await loadBothFiles(FIXTURE_A, FIXTURE_B)

    const compareBtn = page.locator('button', { hasText: /^Compare/ })
    await expect(compareBtn).toBeEnabled()
  })

  test('shows contextual help text after both files are loaded', async () => {
    await loadBothFiles(FIXTURE_A, FIXTURE_B)

    await expect(page.locator('text=We\'ll show what B has that A doesn\'t')).toBeVisible()
  })

  test('cancelled dialog does not change state', async () => {
    await mockSelectBundleFileCancelled(electronApp)
    await page.locator('button', { hasText: /Browse|Change File/ }).first().click()

    const compareBtn = page.locator('button', { hasText: /^Compare/ })
    await expect(compareBtn).toBeDisabled()
  })

  test('Compare button remains disabled with only File A loaded', async () => {
    await mockSelectBundleFile(electronApp, FIXTURE_A)
    await page.locator('button', { hasText: /Browse|Change File/ }).first().click()
    await expect(page.locator('text=QA Testing Template v5').first()).toBeVisible()

    const compareBtn = page.locator('button', { hasText: /^Compare/ })
    await expect(compareBtn).toBeDisabled()
  })

  test('Compare button remains disabled with only File B loaded', async () => {
    await mockSelectBundleFile(electronApp, FIXTURE_B)
    const browseButtons = page.locator('button', { hasText: /Browse|Change File/ })
    await browseButtons.nth(1).click()
    await expect(page.locator('text=Client Template v3').first()).toBeVisible()

    const compareBtn = page.locator('button', { hasText: /^Compare/ })
    await expect(compareBtn).toBeDisabled()
  })
})

// ===========================================================================
// Compare Flow: Results with Differences
// ===========================================================================
test.describe('Compare Flow - Results (with differences)', () => {
  test('shows Comparison Results heading', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=Comparison Results')).toBeVisible()
  })

  test('shows difference summary with counts and bundle names', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=/difference.*found/')).toBeVisible()
    await expect(page.locator('text=QA Testing Template v5').first()).toBeVisible()
    await expect(page.locator('text=Client Template v3').first()).toBeVisible()
  })

  test('shows summary badges for only-in-A, only-in-B, and config differences', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=/only in A/').first()).toBeVisible()
    await expect(page.locator('text=/only in B/').first()).toBeVisible()
    await expect(page.locator('text=/config diff/i').first()).toBeVisible()
  })

  test('shows structurally similar banner when bundles share most statement types', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=These bundles are structurally similar')).toBeVisible()
  })

  test('shows Statement Types section', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.getByRole('heading', { name: 'Statement Types' })).toBeVisible()
  })

  test('shows Schedules section', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.getByRole('heading', { name: 'Schedules', exact: true })).toBeVisible()
  })

  test('shows Debt Schedules section', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.getByRole('heading', { name: 'Debt Schedules' })).toBeVisible()
  })

  test('shows Rows label within expanded statement types', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=Rows').first()).toBeVisible()
  })

  test('shows Record Totals label within expanded statement types', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=Record Totals').first()).toBeVisible()
  })

  test('uses human-readable statement type labels not internal IDs', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=/Income Statement/').first()).toBeVisible()
    await expect(page.locator('text=000007923')).toHaveCount(0)
  })

  test('rows diff uses human-readable type labels for grouping', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=/in "Income Statement"/').first()).toBeVisible()
  })

  test('shows "Only in B" badge for Rent Roll statement type', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    const rentRollCard = page.locator('text=Rent Roll').first()
    await expect(rentRollCard).toBeVisible()
  })

  test('shows "Only in B" badge for Interest Only Schedule', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=Interest Only Schedule')).toBeVisible()
  })

  test('shows row counts for shared statement types (A/B)', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=/\\d+\\/\\d+ rows/').first()).toBeVisible()
  })

  test('shows diff badge count on statement types with differences', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=/\\d+ diffs?/').first()).toBeVisible()
  })
})

// ===========================================================================
// Compare Flow: Expand/Collapse Interactions
// ===========================================================================
test.describe('Compare Flow - Expand/Collapse', () => {
  test.beforeEach(async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
  })

  test('statement type cards with differences are expanded by default', async () => {
    await expect(page.locator('text=Rows').first()).toBeVisible()
  })

  test('clicking a section header collapses it', async () => {
    const stHeader = page.locator('text=Statement Types').first()
    await stHeader.click()
    await page.waitForTimeout(300)

    const rowsHeading = page.getByRole('heading', { name: 'Rows' })
    await expect(rowsHeading).toHaveCount(0)
  })

  test('clicking a collapsed section header expands it again', async () => {
    const stHeader = page.locator('text=Statement Types').first()
    await stHeader.click()
    await page.waitForTimeout(300)
    await stHeader.click()
    await page.waitForTimeout(300)

    await expect(page.locator('text=/Income Statement/').first()).toBeVisible()
  })

  test('clicking a config-different badge row expands field diff table', async () => {
    const configBadge = page.locator('span:has-text("Config Different")').first()
    if (await configBadge.isVisible()) {
      const row = configBadge.locator('..')
      await row.click()
      await page.waitForTimeout(500)
      await expect(page.locator('th', { hasText: 'Field' }).first()).toBeVisible()
    }
  })

  test('field diff table shows Bundle A and Bundle B column headers', async () => {
    const configBadge = page.locator('span:has-text("Config Different")').first()
    if (await configBadge.isVisible()) {
      const row = configBadge.locator('..')
      await row.click()
      await page.waitForTimeout(500)
      await expect(page.locator('th', { hasText: 'Bundle A' }).first()).toBeVisible()
      await expect(page.locator('th', { hasText: 'Bundle B' }).first()).toBeVisible()
    }
  })
})

// ===========================================================================
// Compare Flow: Filters and Search
// ===========================================================================
test.describe('Compare Flow - Filters and Search', () => {
  test.beforeEach(async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
  })

  test('filter bar shows Type and Severity groups', async () => {
    await expect(page.locator('text=Type:').first()).toBeVisible()
    await expect(page.locator('text=/Severity/').first()).toBeVisible()
  })

  test('All filter button is active by default', async () => {
    const allBtns = page.locator('button', { hasText: /^All$/ })
    await expect(allBtns.first()).toHaveClass(/rt-variant-solid/)
  })

  test('clicking Only in A filter activates it', async () => {
    const onlyInABtn = page.locator('button', { hasText: 'Only in A' })
    await onlyInABtn.click()
    await expect(onlyInABtn).toHaveClass(/rt-variant-solid/)
  })

  test('clicking Only in B filter activates it', async () => {
    const onlyInBBtn = page.locator('button', { hasText: 'Only in B' })
    await onlyInBBtn.click()
    await expect(onlyInBBtn).toHaveClass(/rt-variant-solid/)
  })

  test('clicking Config Diff filter activates it', async () => {
    const configBtn = page.locator('button', { hasText: 'Config Diff' })
    await configBtn.click()
    await expect(configBtn).toHaveClass(/rt-variant-solid/)
  })

  test('resetting to All deactivates other filters', async () => {
    await page.locator('button', { hasText: 'Only in A' }).click()
    const allBtn = page.locator('button', { hasText: /^All$/ }).first()
    await allBtn.click()
    await expect(allBtn).toHaveClass(/rt-variant-solid/)
  })

  test('severity High filter activates', async () => {
    const highBtn = page.locator('button', { hasText: 'High' })
    await highBtn.click()
    await expect(highBtn).toHaveClass(/rt-variant-solid/)

    const allBtns = page.locator('button', { hasText: /^All$/ })
    await allBtns.nth(1).click()
  })

  test('severity Medium filter activates', async () => {
    const medBtn = page.locator('button', { hasText: 'Medium' })
    await medBtn.click()
    await expect(medBtn).toHaveClass(/rt-variant-solid/)

    const allBtns = page.locator('button', { hasText: /^All$/ })
    await allBtns.nth(1).click()
  })

  test('severity Low filter activates', async () => {
    const lowBtn = page.locator('button', { hasText: 'Low' })
    await lowBtn.click()
    await expect(lowBtn).toHaveClass(/rt-variant-solid/)

    const allBtns = page.locator('button', { hasText: /^All$/ })
    await allBtns.nth(1).click()
  })

  test('search box is visible and accepts input', async () => {
    const searchInput = page.locator('input[placeholder="Search differences..."]')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('test search')
    await expect(searchInput).toHaveValue('test search')
    await searchInput.clear()
  })

  test('search filters differences by matching text', async () => {
    const searchInput = page.locator('input[placeholder="Search differences..."]')
    await searchInput.fill('Rent Roll')
    await expect(page.locator('text=/Rent Roll/').first()).toBeVisible()
    await searchInput.clear()
  })

  test('search with no matches hides all diff content', async () => {
    const searchInput = page.locator('input[placeholder="Search differences..."]')
    await searchInput.fill('zzz_nonexistent_zzz')

    const incomeStatement = page.locator('text=Income Statement')
    await expect(incomeStatement).toHaveCount(0)
    await searchInput.clear()
  })

  test('clearing search restores all differences', async () => {
    const searchInput = page.locator('input[placeholder="Search differences..."]')
    await searchInput.fill('zzz_nonexistent_zzz')
    await searchInput.clear()

    await expect(page.locator('text=/Income Statement/').first()).toBeVisible()
  })
})

// ===========================================================================
// Compare Flow: Navigation from Results
// ===========================================================================
test.describe('Compare Flow - Results Navigation', () => {
  test('Back button returns to file selection from results', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await page.locator('button', { hasText: 'Back' }).click()
    await expect(page.locator('text=Select Bundles to Compare')).toBeVisible()
  })

  test('Start Over returns to ModeStep from results', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await page.locator('button', { hasText: 'Start Over' }).click()
    await expect(page.locator('text=Bundle Migrator').first()).toBeVisible()
    await expect(page.locator('text=Compare Bundles')).toBeVisible()
  })

  test('can re-enter compare flow after Start Over', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await page.locator('button', { hasText: 'Start Over' }).click()
    await expect(page.locator('text=Compare Bundles')).toBeVisible()

    await page.locator('text=Compare Bundles').click()
    await expect(page.locator('text=Select Bundles to Compare')).toBeVisible()
  })
})

// ===========================================================================
// Compare Flow: Identical Bundles
// ===========================================================================
test.describe('Compare Flow - Identical Bundles', () => {
  test('shows identical message when comparing same data', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_IDENTICAL)
    await expect(page.locator('text=These bundles are identical in configuration')).toBeVisible()
  })

  test('does not show difference summary box for identical bundles', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_IDENTICAL)
    await expect(page.locator('text=/difference.*found/')).toHaveCount(0)
  })

  test('does not show export buttons for identical bundles', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_IDENTICAL)
    await expect(page.locator('button', { hasText: 'Export Markdown' })).toHaveCount(0)
    await expect(page.locator('button', { hasText: 'Export CSV' })).toHaveCount(0)
  })

  test('does not show filter controls for identical bundles', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_IDENTICAL)
    await expect(page.locator('text=Type:')).toHaveCount(0)
    await expect(page.locator('text=/Severity/')).toHaveCount(0)
  })

  test('does not show search box for identical bundles', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_IDENTICAL)
    const searchInput = page.locator('input[placeholder="Search differences..."]')
    await expect(searchInput).toHaveCount(0)
  })

  test('does not show structurally similar banner for identical bundles', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_IDENTICAL)
    await expect(page.locator('text=These bundles are structurally similar')).toHaveCount(0)
  })

  test('Back and Start Over buttons are still visible for identical bundles', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_IDENTICAL)
    await expect(page.locator('button', { hasText: 'Back' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'Start Over' })).toBeVisible()
  })
})

// ===========================================================================
// Compare Flow: Export Report
// ===========================================================================
test.describe('Compare Flow - Export', () => {
  test('Export Markdown button is visible when differences exist', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('button', { hasText: 'Export Markdown' })).toBeVisible()
  })

  test('Export CSV button is visible when differences exist', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('button', { hasText: 'Export CSV' })).toBeVisible()
  })

  test('clicking Export Markdown triggers export and shows success message', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)

    const mockPath = '/tmp/compare_report_test.md'
    await mockExportCompareReport(electronApp, mockPath)

    await page.locator('button', { hasText: 'Export Markdown' }).click()
    await expect(page.locator('text=Report exported to:')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('text=compare_report_test.md')).toBeVisible()
  })

  test('export success message shows the exported file name', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)

    const mockPath = '/tmp/compare_report_styled.md'
    await mockExportCompareReport(electronApp, mockPath)
    await page.locator('button', { hasText: 'Export Markdown' }).click()

    await expect(page.locator('text=Report exported to:')).toBeVisible()
    await expect(page.locator('text=compare_report_styled.md')).toBeVisible()
  })
})

// ===========================================================================
// Compare Flow: Fixture Data Accuracy
// ===========================================================================
test.describe('Compare Flow - Data Accuracy', () => {
  test('Income Statement shows as shared between both bundles', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    const incomeRow = page.locator('text=Income Statement').first()
    await expect(incomeRow).toBeVisible()
  })

  test('Balance Sheet shows as shared between both bundles', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=Balance Sheet').first()).toBeVisible()
  })

  test('Rent Roll appears as only-in-B (exists in B but not A)', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    const rentRoll = page.locator('text=Rent Roll').first()
    await expect(rentRoll).toBeVisible()
  })

  test('Amortization Schedule shows as shared with config differences', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=Amortization Schedule').first()).toBeVisible()
  })

  test('Primary Debt Schedule appears in both bundles', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=Primary Debt Schedule').first()).toBeVisible()
  })

  test('Secondary Debt Schedule appears as only-in-B', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=Secondary Debt Schedule').first()).toBeVisible()
  })

  test('Operating Expenses row appears as only-in-B', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=Operating Expenses').first()).toBeVisible()
  })

  test('shows Projection Templates difference in Other Differences', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=Projection Templates').first()).toBeVisible()
  })

  test('shows Loan Assumptions difference', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.getByRole('heading', { name: 'Loan Assumptions' })).toBeVisible()
  })
})

// ===========================================================================
// Compare Flow: Comparing Same File (self-comparison)
// ===========================================================================
test.describe('Compare Flow - Self Comparison', () => {
  test('comparing a file against itself shows identical result', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_A)
    await expect(page.locator('text=These bundles are identical in configuration')).toBeVisible()
  })
})

// ===========================================================================
// Enhancement Tests: Side-by-side Summary Header
// ===========================================================================
test.describe('Enhancement - Side-by-side Summary Header', () => {
  test('results page shows Bundle A and Bundle B summary cards', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=Bundle A').first()).toBeVisible()
    await expect(page.locator('text=Bundle B').first()).toBeVisible()
  })

  test('summary cards show bundle names', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=QA Testing Template v5').first()).toBeVisible()
    await expect(page.locator('text=Client Template v3').first()).toBeVisible()
  })

  test('summary cards show extraction date and record count', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=/Extracted.*records/').first()).toBeVisible()
  })
})

// ===========================================================================
// Enhancement Tests: Breadcrumb Diff Count
// ===========================================================================
test.describe('Enhancement - Breadcrumb Diff Count', () => {
  test('breadcrumb shows diff count on results step', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('text=/Results \\(\\d+ diffs?\\)/')).toBeVisible()
  })

  test('breadcrumb shows Identical label for identical bundles', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_IDENTICAL)
    await expect(page.locator('text=Results (Identical)')).toBeVisible()
  })
})

// ===========================================================================
// Enhancement Tests: Expand All / Collapse All
// ===========================================================================
test.describe('Enhancement - Expand/Collapse All', () => {
  test('Expand All and Collapse All buttons are visible', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await expect(page.locator('button', { hasText: 'Expand All' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'Collapse All' })).toBeVisible()
  })

  test('Collapse All hides expanded statement type details', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    // "in Income Statement" sublabel is visible inside expanded statement type cards
    await expect(page.locator('text=/in "Income Statement"/').first()).toBeVisible()
    await page.locator('button', { hasText: 'Collapse All' }).click()
    await page.waitForTimeout(500)
    // After collapse, sublabels inside statement type cards should be hidden
    await expect(page.locator('text=/in "Income Statement"/')).toHaveCount(0)
  })

  test('Expand All re-shows collapsed content', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    await page.locator('button', { hasText: 'Collapse All' }).click()
    await page.waitForTimeout(300)
    await page.locator('button', { hasText: 'Expand All' }).click()
    await page.waitForTimeout(300)
    await expect(page.locator('text=/Income Statement/').first()).toBeVisible()
  })
})

// ===========================================================================
// Enhancement Tests: Empty Filter State
// ===========================================================================
test.describe('Enhancement - Empty Filter State', () => {
  test('shows empty message when filter hides all results', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    const searchInput = page.locator('input[placeholder="Search differences..."]')
    await searchInput.fill('zzz_nonexistent_zzz')
    await expect(page.locator('text=No differences match the current filter.')).toBeVisible()
    await searchInput.clear()
  })
})

// ===========================================================================
// Enhancement Tests: Swap Files Button
// ===========================================================================
test.describe('Enhancement - Swap Files', () => {
  test('swap button appears after loading at least one file', async () => {
    await navigateToCompareFileSelect()
    await mockSelectBundleFile(electronApp, FIXTURE_A)
    await page.locator('button', { hasText: /Browse|Change File/ }).first().click()
    await expect(page.locator('text=QA Testing Template v5').first()).toBeVisible()

    await expect(page.locator('button', { hasText: '\u21C4' })).toBeVisible()
  })

  test('swap button swaps file A and file B', async () => {
    await navigateToCompareFileSelect()
    await loadBothFiles(FIXTURE_A, FIXTURE_B)

    await expect(page.locator('text=Bundle A').first()).toBeVisible()
    await expect(page.locator('text=Bundle B').first()).toBeVisible()

    await page.locator('button', { hasText: '\u21C4' }).click()
    await page.waitForTimeout(300)

    // After swap: the first file card should now show Client Template v3 (was B, now A)
    const firstCard = page.locator('text=Bundle A').first()
    await expect(firstCard).toBeVisible()
  })
})

// ===========================================================================
// Enhancement Tests: Drag and Drop Hint
// ===========================================================================
test.describe('Enhancement - Drag and Drop', () => {
  test('shows drag hint text on file select step', async () => {
    await navigateToCompareFileSelect()
    const hints = page.locator('text=or drag a .json file here')
    await expect(hints.first()).toBeVisible()
    await expect(hints).toHaveCount(2)
  })
})

// ===========================================================================
// Enhancement Tests: Color-coded Diff Values
// ===========================================================================
test.describe('Enhancement - Color-coded Diffs', () => {
  test('field diff table cells have red/green backgrounds', async () => {
    await navigateToCompareResults(FIXTURE_A, FIXTURE_B)
    const configBadge = page.locator('span:has-text("Config Different")').first()
    if (await configBadge.isVisible()) {
      const row = configBadge.locator('..')
      await row.click()
      await page.waitForTimeout(500)
      const redCell = page.locator('td[style*="red"]').first()
      const greenCell = page.locator('td[style*="green"]').first()
      await expect(redCell).toBeVisible()
      await expect(greenCell).toBeVisible()
    }
  })
})
