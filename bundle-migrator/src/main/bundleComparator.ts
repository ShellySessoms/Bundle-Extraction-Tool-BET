import type {
  BundleExport,
  BundleComparison,
  StatementTypeComparison,
  RowDifference,
  TotalDifference,
  ScheduleComparison,
  DebtScheduleComparison,
  TopLevelDifference,
  FieldDiff,
  SfRecord
} from '../shared/types'

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

function diffFields(
  a: SfRecord,
  b: SfRecord,
  fields: { api: string; label: string }[]
): FieldDiff[] {
  const diffs: FieldDiff[] = []
  for (const { api, label } of fields) {
    const va = a[api]
    const vb = b[api]
    if (str(va) !== str(vb)) {
      diffs.push({
        fieldName: label,
        labelA: str(va) || null,
        labelB: str(vb) || null,
        valueA: va ?? null,
        valueB: vb ?? null
      })
    }
  }
  return diffs
}

function getRecords(bundle: BundleExport, objectName: string): SfRecord[] {
  return bundle.records[objectName] ?? []
}

function typeLabel(r: SfRecord): string {
  return str(r.LLC_BI__Type__c) || str(r.Name) || r.Id
}

function totalLabel(r: SfRecord): string {
  return str(r.LLC_BI__Title__c) || str(r.Name)
}

// ---------------------------------------------------------------------------
// Statement Types → hierarchical
// ---------------------------------------------------------------------------
function buildStatementTypes(
  bundleA: BundleExport,
  bundleB: BundleExport
): StatementTypeComparison[] {
  const typeObj = 'LLC_BI__Spread_Statement_Type__c'
  const recObj = 'LLC_BI__Spread_Statement_Record__c'
  const totalObj = 'LLC_BI__Spread_Statement_Record_Total__c'

  const typesA = getRecords(bundleA, typeObj)
  const typesB = getRecords(bundleB, typeObj)

  const typeMapA = new Map<string, SfRecord>()
  for (const r of typesA) typeMapA.set(typeLabel(r), r)
  const typeMapB = new Map<string, SfRecord>()
  for (const r of typesB) typeMapB.set(typeLabel(r), r)

  const recsA = getRecords(bundleA, recObj)
  const recsB = getRecords(bundleB, recObj)
  const totalsA = getRecords(bundleA, totalObj)
  const totalsB = getRecords(bundleB, totalObj)

  const typeIdToLabelA = new Map<string, string>()
  for (const r of typesA) typeIdToLabelA.set(r.Id, typeLabel(r))
  const typeIdToLabelB = new Map<string, string>()
  for (const r of typesB) typeIdToLabelB.set(r.Id, typeLabel(r))

  const rowsByTypeA = groupByParent(recsA, 'LLC_BI__Spread_Statement_Type__c', typeIdToLabelA)
  const rowsByTypeB = groupByParent(recsB, 'LLC_BI__Spread_Statement_Type__c', typeIdToLabelB)
  const totalsByTypeA = groupByParent(totalsA, 'LLC_BI__Spread_Statement_Type__c', typeIdToLabelA)
  const totalsByTypeB = groupByParent(totalsB, 'LLC_BI__Spread_Statement_Type__c', typeIdToLabelB)

  const result: StatementTypeComparison[] = []
  const processed = new Set<string>()

  for (const [label] of typeMapA) {
    processed.add(label)
    const rowsA = rowsByTypeA.get(label) ?? []
    const rowsB = rowsByTypeB.get(label) ?? []
    const totA = totalsByTypeA.get(label) ?? []
    const totB = totalsByTypeB.get(label) ?? []

    if (!typeMapB.has(label)) {
      result.push({
        label,
        status: 'only-in-a',
        rowDifferences: [],
        totalDifferences: [],
        rowCountA: rowsA.length,
        rowCountB: 0,
        totalCountA: totA.length,
        totalCountB: 0,
        hasDifferences: true
      })
      continue
    }

    const rowDiffs = compareRows(rowsA, rowsB)
    const totalDiffs = compareTotals(totA, totB)
    const hasDifferences = rowDiffs.length > 0 || totalDiffs.length > 0

    result.push({
      label,
      status: 'shared',
      rowDifferences: rowDiffs,
      totalDifferences: totalDiffs,
      rowCountA: rowsA.length,
      rowCountB: rowsB.length,
      totalCountA: totA.length,
      totalCountB: totB.length,
      hasDifferences
    })
  }

  for (const [label] of typeMapB) {
    if (processed.has(label)) continue
    const rowsB = rowsByTypeB.get(label) ?? []
    const totB = totalsByTypeB.get(label) ?? []
    result.push({
      label,
      status: 'only-in-b',
      rowDifferences: [],
      totalDifferences: [],
      rowCountA: 0,
      rowCountB: rowsB.length,
      totalCountA: 0,
      totalCountB: totB.length,
      hasDifferences: true
    })
  }

  return result
}

function groupByParent(
  records: SfRecord[],
  parentField: string,
  idToLabel: Map<string, string>
): Map<string, SfRecord[]> {
  const map = new Map<string, SfRecord[]>()
  for (const r of records) {
    const parentId = str(r[parentField])
    const label = idToLabel.get(parentId) ?? parentId
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(r)
  }
  return map
}

function compareRows(rowsA: SfRecord[], rowsB: SfRecord[]): RowDifference[] {
  const mapA = new Map<string, SfRecord>()
  for (const r of rowsA) { const n = str(r.Name); if (n) mapA.set(n, r) }
  const mapB = new Map<string, SfRecord>()
  for (const r of rowsB) { const n = str(r.Name); if (n) mapB.set(n, r) }

  const diffs: RowDifference[] = []

  for (const [name] of mapA) {
    if (!mapB.has(name)) {
      diffs.push({ label: name, status: 'only-in-a' })
    }
  }
  for (const [name] of mapB) {
    if (!mapA.has(name)) {
      diffs.push({ label: name, status: 'only-in-b' })
    }
  }

  for (const [name, recA] of mapA) {
    const recB = mapB.get(name)
    if (!recB) continue
    const fields = diffFields(recA, recB, [
      { api: 'LLC_BI__Formula__c', label: 'Formula' },
      { api: 'LLC_BI__Is_Calculated__c', label: 'Is Calculated' },
      { api: 'LLC_BI__Row_Type__c', label: 'Row Type' },
      { api: 'LLC_BI__Sort_Order__c', label: 'Sort Order' }
    ])
    if (fields.length > 0) {
      diffs.push({ label: name, status: 'config-different', fieldDiffs: fields })
    }
  }

  return diffs
}

function compareTotals(totalsA: SfRecord[], totalsB: SfRecord[]): TotalDifference[] {
  const mapA = new Map<string, SfRecord>()
  for (const r of totalsA) { const k = totalLabel(r); if (k) mapA.set(k, r) }
  const mapB = new Map<string, SfRecord>()
  for (const r of totalsB) { const k = totalLabel(r); if (k) mapB.set(k, r) }

  const diffs: TotalDifference[] = []

  for (const [label] of mapA) {
    if (!mapB.has(label)) diffs.push({ label, status: 'only-in-a' })
  }
  for (const [label] of mapB) {
    if (!mapA.has(label)) diffs.push({ label, status: 'only-in-b' })
  }

  for (const [label, recA] of mapA) {
    const recB = mapB.get(label)
    if (!recB) continue
    const fields = diffFields(recA, recB, [
      { api: 'LLC_BI__Formula__c', label: 'Formula' },
      { api: 'LLC_BI__Sort_Order__c', label: 'Sort Order' },
      { api: 'LLC_BI__Row_Number__c', label: 'Row Number' }
    ])
    if (fields.length > 0) {
      diffs.push({ label, status: 'config-different', fieldDiffs: fields })
    }
  }

  return diffs
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------
function buildSchedules(bundleA: BundleExport, bundleB: BundleExport): ScheduleComparison[] {
  const obj = 'LLC_BI__Schedule__c'
  const entryObj = 'LLC_BI__Schedule_Entry__c'
  const sectionObj = 'LLC_BI__Schedule_Section__c'

  const mapA = new Map<string, SfRecord>()
  for (const r of getRecords(bundleA, obj)) mapA.set(str(r.Name), r)
  const mapB = new Map<string, SfRecord>()
  for (const r of getRecords(bundleB, obj)) mapB.set(str(r.Name), r)

  const entriesA = getRecords(bundleA, entryObj)
  const entriesB = getRecords(bundleB, entryObj)
  const sectionsA = getRecords(bundleA, sectionObj).filter((r) => !!r.LLC_BI__Schedule__c)
  const sectionsB = getRecords(bundleB, sectionObj).filter((r) => !!r.LLC_BI__Schedule__c)

  const result: ScheduleComparison[] = []
  const processed = new Set<string>()

  for (const [name, recA] of mapA) {
    processed.add(name)
    const entryCountA = entriesA.filter((e) => str(e.LLC_BI__Schedule__c) === recA.Id).length
    const sectionCountA = sectionsA.filter((s) => str(s.LLC_BI__Schedule__c) === recA.Id).length

    if (!mapB.has(name)) {
      result.push({ name, status: 'only-in-a', entryCountA, entryCountB: 0, sectionCountA, sectionCountB: 0 })
      continue
    }

    const recB = mapB.get(name)!
    const entryCountB = entriesB.filter((e) => str(e.LLC_BI__Schedule__c) === recB.Id).length
    const sectionCountB = sectionsB.filter((s) => str(s.LLC_BI__Schedule__c) === recB.Id).length

    const configDiffs = diffFields(recA, recB, [
      { api: 'LLC_BI__Table_Format__c', label: 'Table Format' },
      { api: 'LLC_BI__Is_Template__c', label: 'Is Template' }
    ])

    result.push({
      name,
      status: 'shared',
      entryCountA,
      entryCountB,
      sectionCountA,
      sectionCountB,
      configDiffs: configDiffs.length > 0 ? configDiffs : undefined
    })
  }

  for (const [name, recB] of mapB) {
    if (processed.has(name)) continue
    const entryCountB = entriesB.filter((e) => str(e.LLC_BI__Schedule__c) === recB.Id).length
    const sectionCountB = sectionsB.filter((s) => str(s.LLC_BI__Schedule__c) === recB.Id).length
    result.push({ name, status: 'only-in-b', entryCountA: 0, entryCountB, sectionCountA: 0, sectionCountB })
  }

  return result
}

// ---------------------------------------------------------------------------
// Debt Schedules
// ---------------------------------------------------------------------------
function buildDebtSchedules(bundleA: BundleExport, bundleB: BundleExport): DebtScheduleComparison[] {
  const obj = 'LLC_BI__Debt_Schedule__c'
  const debtObj = 'LLC_BI__Debt__c'

  const mapA = new Map<string, SfRecord>()
  for (const r of getRecords(bundleA, obj)) mapA.set(str(r.Name), r)
  const mapB = new Map<string, SfRecord>()
  for (const r of getRecords(bundleB, obj)) mapB.set(str(r.Name), r)

  const debtsA = getRecords(bundleA, debtObj)
  const debtsB = getRecords(bundleB, debtObj)

  const result: DebtScheduleComparison[] = []
  const processed = new Set<string>()

  for (const [name, recA] of mapA) {
    processed.add(name)
    const debtCountA = debtsA.filter((d) => str(d.LLC_BI__Debt_Schedule__c) === recA.Id).length

    if (!mapB.has(name)) {
      result.push({ name, status: 'only-in-a', debtCountA, debtCountB: 0 })
      continue
    }

    const recB = mapB.get(name)!
    const debtCountB = debtsB.filter((d) => str(d.LLC_BI__Debt_Schedule__c) === recB.Id).length

    const configDiffs = diffFields(recA, recB, [
      { api: 'LLC_BI__Debt_Filter_Syntax__c', label: 'Debt Filter Syntax' },
      { api: 'LLC_BI__Is_Template__c', label: 'Is Template' }
    ])

    result.push({
      name,
      status: 'shared',
      debtCountA,
      debtCountB,
      configDiffs: configDiffs.length > 0 ? configDiffs : undefined
    })
  }

  for (const [name, recB] of mapB) {
    if (processed.has(name)) continue
    const debtCountB = debtsB.filter((d) => str(d.LLC_BI__Debt_Schedule__c) === recB.Id).length
    result.push({ name, status: 'only-in-b', debtCountA: 0, debtCountB })
  }

  return result
}

// ---------------------------------------------------------------------------
// Top-Level Differences
// ---------------------------------------------------------------------------
function buildTopLevel(bundleA: BundleExport, bundleB: BundleExport): TopLevelDifference[] {
  const diffs: TopLevelDifference[] = []

  const projA = getRecords(bundleA, 'LLC_BI__Projection_Bundle_Junction__c')
  const projB = getRecords(bundleB, 'LLC_BI__Projection_Bundle_Junction__c')
  if (projA.length !== projB.length) {
    diffs.push({
      label: 'Projection Templates',
      description: `Bundle A has ${projA.length} projection template link${projA.length !== 1 ? 's' : ''}, Bundle B has ${projB.length}`,
      severity: 'medium'
    })
  }

  const rowMapA = getRecords(bundleA, 'LLC_BI__Spread_Statement_Row_Mapping__c').length
  const rowMapB = getRecords(bundleB, 'LLC_BI__Spread_Statement_Row_Mapping__c').length
  if (rowMapA !== rowMapB) {
    diffs.push({
      label: 'Row Mappings',
      description: `Bundle A has ${rowMapA} row mapping${rowMapA !== 1 ? 's' : ''}, Bundle B has ${rowMapB}`,
      severity: 'low'
    })
  }

  const classA = getRecords(bundleA, 'LLC_BI__Spread_Record_Classification__c').length
  const classB = getRecords(bundleB, 'LLC_BI__Spread_Record_Classification__c').length
  if (classA !== classB) {
    diffs.push({
      label: 'Classifications',
      description: `Bundle A has ${classA} classification attachment${classA !== 1 ? 's' : ''}, Bundle B has ${classB}`,
      severity: 'low'
    })
  }

  const loanA = getRecords(bundleA, 'LLC_BI__Loan_Assumptions__c').length
  const loanB = getRecords(bundleB, 'LLC_BI__Loan_Assumptions__c').length
  if (loanA !== loanB) {
    diffs.push({
      label: 'Loan Assumptions',
      description: `Bundle A has ${loanA} loan assumption${loanA !== 1 ? 's' : ''}, Bundle B has ${loanB}`,
      severity: 'medium'
    })
  }

  return diffs
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export function compareBundles(bundleA: BundleExport, bundleB: BundleExport): BundleComparison {
  const statementTypes = buildStatementTypes(bundleA, bundleB)
  const schedules = buildSchedules(bundleA, bundleB)
  const debtSchedules = buildDebtSchedules(bundleA, bundleB)
  const topLevel = buildTopLevel(bundleA, bundleB)

  const onlyInA = statementTypes.filter((s) => s.status === 'only-in-a').length
  const onlyInB = statementTypes.filter((s) => s.status === 'only-in-b').length
  const shared = statementTypes.filter((s) => s.status === 'shared')
  const withDiffs = shared.filter((s) => s.hasDifferences).length

  let totalRowDiffs = 0
  for (const s of statementTypes) totalRowDiffs += s.rowDifferences.length + s.totalDifferences.length

  const schedDiffs = schedules.filter((s) =>
    s.status !== 'shared' || s.configDiffs || s.entryCountA !== s.entryCountB
  ).length
  const debtSchedDiffs = debtSchedules.filter((s) =>
    s.status !== 'shared' || s.configDiffs || s.debtCountA !== s.debtCountB
  ).length

  const identical = onlyInA === 0 && onlyInB === 0 && withDiffs === 0
    && schedDiffs === 0 && debtSchedDiffs === 0 && topLevel.length === 0

  const countRecords = (b: BundleExport): number =>
    Object.values(b.records).reduce((sum, recs) => sum + recs.length, 0)

  return {
    bundleAName: bundleA.bundleName,
    bundleBName: bundleB.bundleName,
    bundleAExtractedAt: bundleA.extractedAt,
    bundleBExtractedAt: bundleB.extractedAt,
    bundleARecordCount: countRecords(bundleA),
    bundleBRecordCount: countRecords(bundleB),
    comparedAt: new Date().toISOString(),
    summary: {
      totalStatementTypes: statementTypes.length,
      sharedStatementTypes: shared.length,
      onlyInA,
      onlyInB,
      statementsWithDifferences: withDiffs,
      totalRowDifferences: totalRowDiffs,
      totalScheduleDifferences: schedDiffs + debtSchedDiffs,
      identical
    },
    statementTypes,
    schedules,
    debtSchedules,
    topLevel
  }
}

// ---------------------------------------------------------------------------
// Markdown export
// ---------------------------------------------------------------------------
export function comparisonToMarkdown(comparison: BundleComparison): string {
  const lines: string[] = []
  lines.push('# Bundle Comparison Report')
  lines.push(`**Bundle A:** ${comparison.bundleAName}  `)
  lines.push(`**Bundle B:** ${comparison.bundleBName}  `)
  lines.push(`**Compared:** ${new Date(comparison.comparedAt).toLocaleString()}  `)
  lines.push('')

  const s = comparison.summary
  lines.push('## Summary')
  if (s.identical) {
    lines.push('These bundles are identical in configuration.')
  } else {
    lines.push(`- ${s.totalStatementTypes} statement types compared`)
    lines.push(`- ${s.sharedStatementTypes} shared, ${s.onlyInA} only in A, ${s.onlyInB} only in B`)
    lines.push(`- ${s.statementsWithDifferences} shared statement types have differences`)
    lines.push(`- ${s.totalRowDifferences} total row/total-group differences`)
    if (s.totalScheduleDifferences > 0) {
      lines.push(`- ${s.totalScheduleDifferences} schedule differences`)
    }
  }
  lines.push('')

  lines.push('## Statement Types')

  const onlyA = comparison.statementTypes.filter((t) => t.status === 'only-in-a')
  const onlyB = comparison.statementTypes.filter((t) => t.status === 'only-in-b')
  const withDiffs = comparison.statementTypes.filter((t) => t.status === 'shared' && t.hasDifferences)
  const identical = comparison.statementTypes.filter((t) => t.status === 'shared' && !t.hasDifferences)

  if (onlyA.length > 0) {
    lines.push('### Only in Bundle A')
    for (const t of onlyA) lines.push(`- ${t.label} (${t.rowCountA} rows)`)
    lines.push('')
  }

  if (onlyB.length > 0) {
    lines.push('### Only in Bundle B')
    for (const t of onlyB) lines.push(`- ${t.label} (${t.rowCountB} rows)`)
    lines.push('')
  }

  if (withDiffs.length > 0) {
    lines.push('### Shared Statement Types with Differences')
    for (const t of withDiffs) {
      lines.push(`#### ${t.label}`)
      lines.push(`Rows: A has ${t.rowCountA}, B has ${t.rowCountB}`)
      const onlyInARows = t.rowDifferences.filter((r) => r.status === 'only-in-a')
      const onlyInBRows = t.rowDifferences.filter((r) => r.status === 'only-in-b')
      const configRows = t.rowDifferences.filter((r) => r.status === 'config-different')
      if (onlyInARows.length > 0) {
        lines.push(`- Rows only in A: ${onlyInARows.map((r) => r.label).join(', ')} [${onlyInARows.length}]`)
      }
      if (onlyInBRows.length > 0) {
        lines.push(`- Rows only in B: ${onlyInBRows.map((r) => r.label).join(', ')} [${onlyInBRows.length}]`)
      }
      for (const r of configRows) {
        const changed = r.fieldDiffs?.map((f) => f.fieldName).join(', ') ?? ''
        lines.push(`- Row "${r.label}" differs in: ${changed}`)
        if (r.fieldDiffs) {
          for (const f of r.fieldDiffs) {
            lines.push(`  - ${f.fieldName}: A = \`${f.labelA ?? '(empty)'}\`, B = \`${f.labelB ?? '(empty)'}\``)
          }
        }
      }
      if (t.totalDifferences.length > 0) {
        lines.push(`- Total groups: ${t.totalDifferences.length} differences`)
      }
      lines.push('')
    }
  }

  if (identical.length > 0) {
    lines.push('### Identical Statement Types')
    for (const t of identical) lines.push(`- ${t.label} (${t.rowCountA} rows) ✓`)
    lines.push('')
  }

  if (comparison.schedules.length > 0) {
    lines.push('## Schedules')
    for (const sc of comparison.schedules) {
      const tag = sc.status === 'only-in-a' ? '(only in A)' : sc.status === 'only-in-b' ? '(only in B)' : ''
      const entries = sc.status === 'shared' ? ` — A: ${sc.entryCountA} entries, B: ${sc.entryCountB} entries` : ` — ${sc.entryCountA || sc.entryCountB} entries`
      lines.push(`- ${sc.name} ${tag}${entries}`)
    }
    lines.push('')
  }

  if (comparison.debtSchedules.length > 0) {
    lines.push('## Debt Schedules')
    for (const ds of comparison.debtSchedules) {
      const tag = ds.status === 'only-in-a' ? '(only in A)' : ds.status === 'only-in-b' ? '(only in B)' : ''
      const debts = ds.status === 'shared' ? ` — A: ${ds.debtCountA} debts, B: ${ds.debtCountB} debts` : ` — ${ds.debtCountA || ds.debtCountB} debts`
      lines.push(`- ${ds.name} ${tag}${debts}`)
    }
    lines.push('')
  }

  if (comparison.topLevel.length > 0) {
    lines.push('## Other Differences')
    for (const d of comparison.topLevel) {
      lines.push(`- **${d.label}:** ${d.description}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function comparisonToCsv(comparison: BundleComparison): string {
  const rows: string[][] = []
  rows.push(['Category', 'Item', 'Status', 'Field', 'Bundle A Value', 'Bundle B Value', 'Severity'])

  for (const st of comparison.statementTypes) {
    if (st.status !== 'shared') {
      rows.push(['Statement Type', st.label, st.status, '', '', '', ''])
    }
    for (const r of st.rowDifferences) {
      if (r.fieldDiffs && r.fieldDiffs.length > 0) {
        for (const f of r.fieldDiffs) {
          rows.push(['Row', `${st.label} > ${r.label}`, r.status, f.fieldName, f.labelA ?? '', f.labelB ?? '', ''])
        }
      } else {
        rows.push(['Row', `${st.label} > ${r.label}`, r.status, '', '', '', ''])
      }
    }
    for (const t of st.totalDifferences) {
      if (t.fieldDiffs && t.fieldDiffs.length > 0) {
        for (const f of t.fieldDiffs) {
          rows.push(['Record Total', `${st.label} > ${t.label}`, t.status, f.fieldName, f.labelA ?? '', f.labelB ?? '', ''])
        }
      } else {
        rows.push(['Record Total', `${st.label} > ${t.label}`, t.status, '', '', '', ''])
      }
    }
  }

  for (const sc of comparison.schedules) {
    if (sc.status !== 'shared' || sc.configDiffs) {
      if (sc.configDiffs) {
        for (const f of sc.configDiffs) {
          rows.push(['Schedule', sc.name, sc.status, f.fieldName, f.labelA ?? '', f.labelB ?? '', ''])
        }
      } else {
        rows.push(['Schedule', sc.name, sc.status, '', '', '', ''])
      }
    }
  }

  for (const ds of comparison.debtSchedules) {
    if (ds.status !== 'shared' || ds.configDiffs) {
      if (ds.configDiffs) {
        for (const f of ds.configDiffs) {
          rows.push(['Debt Schedule', ds.name, ds.status, f.fieldName, f.labelA ?? '', f.labelB ?? '', ''])
        }
      } else {
        rows.push(['Debt Schedule', ds.name, ds.status, '', '', '', ''])
      }
    }
  }

  for (const d of comparison.topLevel) {
    rows.push(['Other', d.label, '', '', d.description, '', d.severity])
  }

  return rows.map((r) => r.map(csvEscape).join(',')).join('\n')
}
