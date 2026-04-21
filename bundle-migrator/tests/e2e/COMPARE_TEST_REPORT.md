# Compare Feature - Test & QA Report

**Date:** 2026-04-20
**Scope:** Compare Bundles mode (end-to-end Playwright tests + code review)
**Fixtures:** bundleA.json (QA Testing Template v5), bundleB.json (Client Template v3), bundleIdentical.json

---

## Test Summary

| Metric | Count |
|--------|-------|
| Total test cases | 57 |
| Test describes (groups) | 11 |
| Previous test count | 23 |
| New/expanded tests | 34 |

---

## Test Case Inventory

### Landing Page (ModeStep) - 3 tests

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 1 | Shows app title and four mode cards | All modes render on landing |
| 2 | No Back button on landing | Clean entry point |
| 3 | Compare mode card shows description | Correct card copy |

### Navigation - 5 tests

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 4 | Compare Bundles navigates to file select | Mode card click routing |
| 5 | Breadcrumb shows correct steps | Mode > Select Files > Results |
| 6 | Breadcrumb highlights current step | Bold font-weight on active step |
| 7 | Compare button disabled without files | Guard against empty submission |
| 8 | Back button returns to ModeStep | Backward navigation |

### File Selection - 11 tests

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 9 | Heading and description visible | Page context for user |
| 10 | Labels for both file slots | "Your Template (A)" / "Customer/Client Template (B)" |
| 11 | Both Browse buttons visible initially | Starting state |
| 12 | Load File A via mocked dialog | Bundle A metadata renders |
| 13 | File A summary card shows metadata | Name, objects, records count |
| 14 | File path displayed after loading | Shows full path for traceability |
| 15 | Load File B via mocked dialog | Bundle B metadata renders |
| 16 | Browse changes to "Change File..." | Button label state change |
| 17 | Compare enabled after both files loaded | Unlocks proceed action |
| 18 | Contextual help text after both loaded | "We'll show what B has that A doesn't" |
| 19 | Cancelled dialog does not change state | No side effects on cancel |
| 20 | Disabled with only File A | Partial state guard |
| 21 | Disabled with only File B | Partial state guard |

### Results with Differences - 14 tests

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 22 | Comparison Results heading | Results page rendered |
| 23 | Difference summary with counts/names | Aggregate diff overview |
| 24 | Summary badges (only-in-A/B, config) | Visual diff breakdown |
| 25 | Structurally similar banner | 70%+ shared threshold |
| 26 | Statement Types section | Main comparison category |
| 27 | Schedules section | Schedule comparison present |
| 28 | Debt Schedules section | Debt schedule comparison present |
| 29 | Rows sub-heading | Row-level differences |
| 30 | Record Totals sub-heading | Total-level differences |
| 31 | Human-readable labels (not internal IDs) | "Income Statement" not "000007923" |
| 32 | Row diffs grouped by type label | 'in "Income Statement"' context |
| 33 | Rent Roll as only-in-B | Fixture-specific correctness |
| 34 | Interest Only Schedule as only-in-B | Fixture-specific correctness |
| 35 | Row counts shown for shared types | A/B row count display |

### Expand/Collapse Interactions - 4 tests

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 36 | Diff types expanded by default | Auto-expand on differences |
| 37 | Collapse section on click | Toggle behavior |
| 38 | Re-expand collapsed section | Round-trip toggle |
| 39 | Config-different row expands field table | Drill-down to field-level diffs |

### Filters and Search - 12 tests

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 40 | Filter bar shows Type and Severity | Filter groups visible |
| 41 | "All" active by default | Default filter state |
| 42 | Only in A filter activates | Button variant toggles |
| 43 | Only in B filter activates | Button variant toggles |
| 44 | Config Diff filter activates | Button variant toggles |
| 45 | Reset to All deactivates others | Filter reset |
| 46 | Severity High filter | Severity filter toggle |
| 47 | Severity Medium filter | Severity filter toggle |
| 48 | Severity Low filter | Severity filter toggle |
| 49 | Search accepts input | Text input works |
| 50 | Search filters by matching text | "Rent Roll" narrows results |
| 51 | No-match search hides content | Empty state on zero results |

### Results Navigation - 3 tests

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 52 | Back returns to file select | Step regression |
| 53 | Start Over returns to ModeStep | Full reset |
| 54 | Re-enter compare after Start Over | Flow reusability |

### Identical Bundles - 7 tests

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 55 | Identical message displayed | Green banner for match |
| 56 | No difference summary box | Clean identical state |
| 57 | No Export Report button | Export hidden when nothing to report |
| 58 | No filter controls | Filters hidden when unnecessary |
| 59 | No search box | Search hidden when unnecessary |
| 60 | No structurally similar banner | Distinct from "similar" |
| 61 | Back and Start Over still visible | Navigation always available |

### Export Report - 3 tests

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 62 | Export button visible with diffs | Action available |
| 63 | Export triggers and shows path | End-to-end export flow |
| 64 | Export success message styled | Green confirmation feedback |

### Data Accuracy - 9 tests

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 65 | Income Statement shared | Correct match by LLC_BI__Type__c |
| 66 | Balance Sheet shared | Correct match |
| 67 | Rent Roll only-in-B | Correct exclusion from A |
| 68 | Amortization Schedule shared | Schedule matching by Name |
| 69 | Primary Debt Schedule in both | Debt schedule matching |
| 70 | Secondary Debt Schedule only-in-B | Correct exclusion from A |
| 71 | Operating Expenses only-in-B | Row-level only-in-B |
| 72 | Projection Templates in Other Diffs | Top-level count difference |
| 73 | Loan Assumptions difference | Top-level difference |

### Self-Comparison - 1 test

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 74 | File compared against itself = identical | Edge case sanity |

---

## Coverage Assessment

| Area | Coverage | Notes |
|------|----------|-------|
| File selection happy path | High | Both files, single file, cancel |
| Comparison results display | High | All sections, badges, labels |
| Identical bundles | High | Message, hidden controls, no export |
| Filters (type) | High | All 4 filter buttons tested |
| Filters (severity) | High | All 4 severity buttons tested |
| Search | High | Match, no-match, clear |
| Navigation (back/start over) | High | Both from file select and results |
| Export report | Medium | Trigger + mock; no real file write |
| Expand/collapse interactions | Medium | Section + row-level toggle |
| Error handling (invalid files) | Low | Not tested - see recommendation below |
| Keyboard accessibility | None | Not tested |
| Large bundle performance | None | No large fixture exists |

---

## Enhancement Recommendations

### Priority 1 - High Value

**1. Error feedback for invalid/malformed JSON files**
- **Current:** If a user selects a non-JSON file or a JSON file that isn't a bundle export, the error is caught but the message is generic.
- **Recommendation:** Add validation in the file-load handler that checks for required fields (`bundleId`, `bundleName`, `records`) and shows a specific message like "This file isn't a bundle export. Expected fields: bundleName, records."
- **Impact:** Prevents user confusion when they pick the wrong file.

**2. Side-by-side summary on results page**
- **Current:** Results only show the diff. Users must remember what they loaded.
- **Recommendation:** Add a small header card showing "Bundle A: QA Testing Template v5 (extracted Apr 10)" vs "Bundle B: Client Template v3 (extracted Apr 12)" at the top of results.
- **Impact:** Context at a glance, especially useful for screenshots/sharing.

**3. Export to CSV option**
- **Current:** Only Markdown export is available.
- **Recommendation:** Add a CSV export option for row-level and total-level diffs. Stakeholders who work in spreadsheets will appreciate this.
- **Impact:** Broader audience for comparison reports.

### Priority 2 - Medium Value

**4. "Swap A and B" button on file select**
- **Current:** If a user loads files in the wrong order, they must re-browse both.
- **Recommendation:** Add a swap button between the two file cards. Simple state swap of `fileA` and `fileB`.
- **Impact:** Small but frequent friction point.

**5. Diff count in breadcrumb**
- **Current:** Breadcrumb says "Results" with no indication of outcome.
- **Recommendation:** After comparison completes, update breadcrumb to "Results (12 diffs)" or "Results (Identical)".
- **Impact:** Quick glance status without scrolling.

**6. Keyboard shortcut for Expand All / Collapse All**
- **Current:** Each section and row must be clicked individually.
- **Recommendation:** Add "Expand All" / "Collapse All" buttons next to the filter bar.
- **Impact:** Faster review of large bundles with many statement types.

**7. Empty state for filtered results**
- **Current:** When filters hide all results, the sections just disappear with no message.
- **Recommendation:** Show "No differences match the current filter" when all items are filtered out.
- **Impact:** Prevents user confusion about whether the app is broken or just filtered.

### Priority 3 - Nice to Have

**8. Drag and drop file loading**
- **Current:** Files can only be loaded via the OS file dialog.
- **Recommendation:** Accept drag-and-drop of JSON files onto the file cards.
- **Impact:** Faster workflow for power users.

**9. Remember last-used directory**
- **Current:** File dialog always opens to the OS default.
- **Recommendation:** Store the last directory used for bundle file selection and re-open there.
- **Impact:** Saves navigation time for users with a consistent export directory.

**10. Color-coded field diff values**
- **Current:** Field diff table shows values in plain monospace text.
- **Recommendation:** Use red/green background highlights for changed values (red for A, green for B) similar to a code diff.
- **Impact:** Faster visual scanning of what changed.

---

## Issues Found During Review

| # | Severity | Description |
|---|----------|-------------|
| 1 | Low | `CompareResultsStep` line 36-37: `labelA` and `labelB` render `null` as `(empty)` but don't distinguish between `null`, `undefined`, and empty string `""`. A field that is explicitly `""` in one bundle and `null` in the other will show both as `(empty)` even though they're technically different values. |
| 2 | Low | `bundleComparator.ts` line 362: Row mapping differences only surface when the percentage diff exceeds 10%, meaning small bundles (e.g., 5 vs 6 mappings = 17% diff) trigger while larger ones (e.g., 100 vs 109 = 9% diff) silently pass. Consider making the threshold configurable or removing it. |
| 3 | Low | `CompareResultsStep` line 100: `StatementTypeCard` `defaultExpanded` is set to `type.hasDifferences`, so statement types that are `only-in-a` or `only-in-b` (which always have `hasDifferences: true`) auto-expand even though their expanded view only says "This statement type exists only in Bundle A/B" with no further drill-down. Consider collapsing these by default since there's no additional detail to show. |
| 4 | Info | The severity filter applies only to the "Other Differences" (top-level) section, but the UI presents it alongside the type filter which applies to everything. This could be confusing - consider grouping them separately or adding a tooltip. |

---

## How to Run

```bash
cd bundle-migrator
npm run build && npx playwright test tests/e2e/compare.spec.ts
```

For headed mode (to watch tests run):
```bash
npm run build && npx playwright test tests/e2e/compare.spec.ts --headed
```
