import type { BundleComparison, BundleExport, SfRecord } from '../shared/types'

export function buildComparisonSummaryForAI(comparison: BundleComparison): string {
  const lines: string[] = []

  const onlyInA = comparison.statementTypes.filter((s) => s.status === 'only-in-a')
  const onlyInB = comparison.statementTypes.filter((s) => s.status === 'only-in-b')
  const shared = comparison.statementTypes.filter((s) => s.status === 'shared')
  const sharedWithDiffs = shared.filter((s) => s.hasDifferences)
  const sharedIdentical = shared.filter((s) => !s.hasDifferences)

  lines.push(`## Statement Types`)
  lines.push(`- Shared: ${shared.length} statement types in common`)
  lines.push(
    `- Only in "${comparison.bundleAName}": ${onlyInA.length} (${onlyInA.map((s) => s.label).join(', ')})`
  )
  lines.push(
    `- Only in "${comparison.bundleBName}": ${onlyInB.length} (${onlyInB.map((s) => s.label).join(', ')})`
  )
  lines.push(`- Shared but different: ${sharedWithDiffs.length}`)
  lines.push(
    `- Identical: ${sharedIdentical.length} (${sharedIdentical.map((s) => s.label).join(', ')})`
  )

  if (sharedWithDiffs.length > 0) {
    lines.push(`\n## Row Differences in Shared Statement Types`)
    for (const st of sharedWithDiffs.slice(0, 10)) {
      const rowOnlyInA = st.rowDifferences.filter((r) => r.status === 'only-in-a').length
      const rowOnlyInB = st.rowDifferences.filter((r) => r.status === 'only-in-b').length
      const rowConfigDiff = st.rowDifferences.filter((r) => r.status === 'config-different').length
      lines.push(`- ${st.label}: A has ${st.rowCountA} rows, B has ${st.rowCountB} rows`)
      if (rowOnlyInA > 0)
        lines.push(
          `  - ${rowOnlyInA} rows only in A: ${st.rowDifferences
            .filter((r) => r.status === 'only-in-a')
            .slice(0, 5)
            .map((r) => r.label)
            .join(', ')}`
        )
      if (rowOnlyInB > 0)
        lines.push(
          `  - ${rowOnlyInB} rows only in B: ${st.rowDifferences
            .filter((r) => r.status === 'only-in-b')
            .slice(0, 5)
            .map((r) => r.label)
            .join(', ')}`
        )
      if (rowConfigDiff > 0)
        lines.push(`  - ${rowConfigDiff} rows with formula/config differences`)
    }
  }

  if (comparison.schedules.length > 0) {
    const schedOnlyA = comparison.schedules.filter((s) => s.status === 'only-in-a')
    const schedOnlyB = comparison.schedules.filter((s) => s.status === 'only-in-b')
    lines.push(`\n## Schedules`)
    lines.push(
      `- Only in A: ${schedOnlyA.length} (${schedOnlyA.map((s) => s.name).join(', ')})`
    )
    lines.push(
      `- Only in B: ${schedOnlyB.length} (${schedOnlyB.map((s) => s.name).join(', ')})`
    )
  }

  if (comparison.debtSchedules.length > 0) {
    const dsOnlyA = comparison.debtSchedules.filter((s) => s.status === 'only-in-a')
    const dsOnlyB = comparison.debtSchedules.filter((s) => s.status === 'only-in-b')
    lines.push(`\n## Debt Schedules`)
    lines.push(`- Only in A: ${dsOnlyA.length} (${dsOnlyA.map((s) => s.name).join(', ')})`)
    lines.push(`- Only in B: ${dsOnlyB.length} (${dsOnlyB.map((s) => s.name).join(', ')})`)
  }

  lines.push(`\n## Summary Counts`)
  lines.push(
    `- Total differences: ${comparison.summary.totalRowDifferences + comparison.summary.totalScheduleDifferences}`
  )
  lines.push(
    `- Statement types with differences: ${comparison.summary.statementsWithDifferences}`
  )

  return lines.join('\n')
}

function summarizeRecords(records: SfRecord[], maxRows: number): string {
  return records
    .slice(0, maxRows)
    .map((r) => {
      const label =
        (r.LLC_BI__Row_Label__c as string) ||
        (r.Name as string) ||
        (r.LLC_BI__lookupKey__c as string) ||
        r.Id
      const formula = r.LLC_BI__Formula__c as string | undefined
      return formula ? `  - ${label} (Formula: ${formula})` : `  - ${label}`
    })
    .join('\n')
}

export function buildTemplateContextForPDI(bundle: BundleExport, affectedArea?: string): string {
  const lines: string[] = []
  const records = bundle.records

  const statementTypes = records['LLC_BI__Spread_Statement_Type__c'] ?? []
  const rows = records['LLC_BI__Spread_Statement_Record__c'] ?? []
  const totals = records['LLC_BI__Spread_Statement_Record_Total__c'] ?? []
  const linkedRecords = records['LLC_BI__Linked_Spread_Statement_Record__c'] ?? []
  const commonSizing = records['LLC_BI__Calc_Common_Sizing_Record__c'] ?? []
  const schedules = records['LLC_BI__Spread_Schedule__c'] ?? []
  const scheduleEntries = records['LLC_BI__Spread_Schedule_Entry__c'] ?? []
  const debtSchedules = records['LLC_BI__Debt_Schedule__c'] ?? []

  const areaLower = (affectedArea ?? '').toLowerCase()
  const isTargeted = areaLower !== '' && areaLower !== 'any'

  if (isTargeted) {
    const matchingType = statementTypes.find(
      (st) => ((st.LLC_BI__Row_Label__c as string) || (st.Name as string) || '')
        .toLowerCase()
        .includes(areaLower)
    )

    if (matchingType) {
      const typeId = matchingType.Id
      const typeName = (matchingType.LLC_BI__Row_Label__c as string) || (matchingType.Name as string) || typeId
      lines.push(`## Statement Type: ${typeName}`)

      const typeRows = rows.filter((r) => r.LLC_BI__Spread_Statement_Type__c === typeId)
      lines.push(`\n### Rows (${typeRows.length})`)
      lines.push(summarizeRecords(typeRows, 50))

      const typeTotals = totals.filter((r) => r.LLC_BI__Spread_Statement_Type__c === typeId)
      if (typeTotals.length > 0) {
        lines.push(`\n### Total Groups (${typeTotals.length})`)
        lines.push(summarizeRecords(typeTotals, 30))
      }

      const typeLinked = linkedRecords.filter(
        (r) => r.LLC_BI__Spread_Statement_Type__c === typeId
      )
      if (typeLinked.length > 0) {
        lines.push(`\n### Linked Record References (${typeLinked.length})`)
        lines.push(summarizeRecords(typeLinked, 20))
      }

      const typeCommonSizing = commonSizing.filter(
        (r) => r.LLC_BI__Spread_Statement_Type__c === typeId
      )
      if (typeCommonSizing.length > 0) {
        lines.push(`\n### Common Sizing Config (${typeCommonSizing.length})`)
        lines.push(summarizeRecords(typeCommonSizing, 20))
      }
    } else {
      lines.push(`## No statement type found matching "${affectedArea}"`)
      lines.push(`Available: ${statementTypes.map((st) => (st.LLC_BI__Row_Label__c as string) || (st.Name as string) || st.Id).join(', ')}`)
    }

    if (areaLower.includes('debt') || areaLower.includes('schedule')) {
      lines.push(`\n## Debt Schedules (${debtSchedules.length})`)
      lines.push(summarizeRecords(debtSchedules, 20))
      lines.push(`\n## Schedules (${schedules.length})`)
      lines.push(summarizeRecords(schedules, 20))
      if (scheduleEntries.length > 0) {
        lines.push(`\n## Schedule Entries (${scheduleEntries.length})`)
        lines.push(summarizeRecords(scheduleEntries, 30))
      }
    }
  } else {
    lines.push(`## Statement Types (${statementTypes.length})`)
    for (const st of statementTypes) {
      const name = (st.LLC_BI__Row_Label__c as string) || (st.Name as string) || st.Id
      const typeRows = rows.filter((r) => r.LLC_BI__Spread_Statement_Type__c === st.Id)
      lines.push(`- ${name}: ${typeRows.length} rows`)
    }

    const formulaRows = rows.filter((r) => r.LLC_BI__Formula__c)
    if (formulaRows.length > 0) {
      lines.push(`\n## Rows with Formulas (${formulaRows.length})`)
      lines.push(summarizeRecords(formulaRows, 40))
    }

    if (linkedRecords.length > 0) {
      lines.push(`\n## Linked Record References (${linkedRecords.length})`)
      lines.push(summarizeRecords(linkedRecords, 20))
    }

    if (debtSchedules.length > 0) {
      lines.push(`\n## Debt Schedules (${debtSchedules.length})`)
      lines.push(summarizeRecords(debtSchedules, 15))
    }

    if (schedules.length > 0) {
      lines.push(`\n## Schedules (${schedules.length})`)
      lines.push(summarizeRecords(schedules, 15))
    }
  }

  const totalRecords = Object.values(records).reduce((sum, arr) => sum + arr.length, 0)
  lines.push(`\n## Overall: ${totalRecords} total records across ${Object.keys(records).length} objects`)

  const result = lines.join('\n')
  const MAX_CHARS = 12000
  return result.length > MAX_CHARS ? result.slice(0, MAX_CHARS) + '\n... (truncated)' : result
}
