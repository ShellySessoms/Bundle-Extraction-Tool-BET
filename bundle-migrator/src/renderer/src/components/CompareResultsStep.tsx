import React, { useEffect, useMemo, useState } from 'react'
import { Box, Flex, Heading, Text, Button, Badge, TextField } from '@radix-ui/themes'
import type {
  BundleComparison,
  StatementTypeComparison,
  ScheduleComparison,
  DebtScheduleComparison,
  FieldDiff
} from '../../../shared/types'

type StatusFilter = 'all' | 'only-in-a' | 'only-in-b' | 'config-different'
type SeverityFilter = 'all' | 'high' | 'medium' | 'low'

interface Props {
  filePathA: string
  filePathB: string
  onBack: () => void
  onStartOver: () => void
  onCompared?: (diffCount: number, identical: boolean) => void
}

function formatDiffValue(label: string | null, raw: unknown): React.ReactElement {
  if (raw === null || raw === undefined) return <em style={{ color: 'var(--gray-8)' }}>(null)</em>
  if (label === '') return <em style={{ color: 'var(--gray-8)' }}>(empty)</em>
  return <>{label}</>
}

function FieldDiffTable({ diffs }: { diffs: FieldDiff[] }): React.ReactElement {
  return (
    <Box mt="2" style={{ fontSize: 12 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--gray-5)', background: 'var(--gray-2)' }}>Field</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--gray-5)', background: 'var(--gray-2)' }}>Bundle A</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--gray-5)', background: 'var(--gray-2)' }}>Bundle B</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((f) => (
            <tr key={f.fieldName}>
              <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--gray-3)', fontWeight: 500 }}>{f.fieldName}</td>
              <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--gray-3)', fontFamily: 'monospace', background: 'var(--red-2)' }}>{formatDiffValue(f.labelA, f.valueA)}</td>
              <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--gray-3)', fontFamily: 'monospace', background: 'var(--green-2)' }}>{formatDiffValue(f.labelB, f.valueB)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  )
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  switch (status) {
    case 'only-in-a': return <Badge color="blue" size="1">Only in A</Badge>
    case 'only-in-b': return <Badge color="orange" size="1">Only in B</Badge>
    case 'config-different': return <Badge color="yellow" size="1">Config Different</Badge>
    case 'shared': return <Badge color="green" size="1">Shared</Badge>
    default: return <Badge size="1">{status}</Badge>
  }
}

function SeverityBadge({ severity }: { severity: string }): React.ReactElement {
  const colors: Record<string, 'red' | 'yellow' | 'gray'> = { high: 'red', medium: 'yellow', low: 'gray' }
  return <Badge size="1" color={colors[severity] || 'gray'}>{severity}</Badge>
}

function DiffItem({ label, sublabel, status, fieldDiffs }: {
  label: string
  sublabel?: string
  status: string
  fieldDiffs?: FieldDiff[]
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const hasDetails = fieldDiffs && fieldDiffs.length > 0

  return (
    <Box py="2" px="3" style={{ borderBottom: '1px solid var(--gray-3)' }}>
      <Flex
        gap="2"
        align="center"
        style={{ cursor: hasDetails ? 'pointer' : 'default' }}
        onClick={() => { if (hasDetails) setExpanded(!expanded) }}
      >
        <StatusBadge status={status} />
        <Text size="2" style={{ flex: 1 }}>
          {label}
          {sublabel && <Text size="1" color="gray"> {sublabel}</Text>}
        </Text>
        {hasDetails && (
          <Text size="1" style={{ fontFamily: 'monospace', color: 'var(--gray-9)' }}>
            {expanded ? '\u25BC' : '\u25B6'}
          </Text>
        )}
      </Flex>
      {expanded && fieldDiffs && <FieldDiffTable diffs={fieldDiffs} />}
    </Box>
  )
}

function StatementTypeCard({ type, filter, search, defaultExpanded, expandOverride }: {
  type: StatementTypeComparison
  filter: StatusFilter
  search: string
  defaultExpanded: boolean
  expandOverride?: boolean | null
}): React.ReactElement | null {
  const [expanded, setExpanded] = useState(defaultExpanded)

  useEffect(() => {
    if (expandOverride !== null && expandOverride !== undefined) setExpanded(expandOverride)
  }, [expandOverride])

  if (filter === 'only-in-a' && type.status !== 'only-in-a') return null
  if (filter === 'only-in-b' && type.status !== 'only-in-b') return null
  if (filter === 'config-different' && !type.hasDifferences) return null

  const searchLower = search.toLowerCase()
  const matchesSearch = !search || type.label.toLowerCase().includes(searchLower)
    || type.rowDifferences.some((r) => r.label.toLowerCase().includes(searchLower))
    || type.totalDifferences.some((t) => t.label.toLowerCase().includes(searchLower))
  if (!matchesSearch) return null

  const filteredRows = type.rowDifferences.filter((r) => {
    if (filter !== 'all' && r.status !== filter) return false
    if (search && !r.label.toLowerCase().includes(searchLower) && !type.label.toLowerCase().includes(searchLower)) return false
    return true
  })

  const filteredTotals = type.totalDifferences.filter((t) => {
    if (filter !== 'all' && t.status !== filter) return false
    if (search && !t.label.toLowerCase().includes(searchLower) && !type.label.toLowerCase().includes(searchLower)) return false
    return true
  })

  const borderColor = type.status === 'only-in-a' ? 'var(--blue-6)'
    : type.status === 'only-in-b' ? 'var(--orange-6)'
      : type.hasDifferences ? 'var(--yellow-6)' : 'var(--green-6)'

  const diffCount = type.rowDifferences.length + type.totalDifferences.length

  return (
    <Box style={{ border: `1px solid ${borderColor}`, borderRadius: 'var(--radius-2)', overflow: 'hidden' }}>
      <Flex
        p="3"
        align="center"
        justify="between"
        style={{ background: 'var(--gray-2)', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <Flex gap="2" align="center">
          <Text size="1" style={{ fontFamily: 'monospace', minWidth: 16 }}>
            {expanded ? '\u25BC' : '\u25B6'}
          </Text>
          <Text size="3" weight="bold">{type.label}</Text>
          <StatusBadge status={type.status} />
        </Flex>
        <Flex gap="2" align="center">
          {type.rowCountA + type.rowCountB > 0 && (
            <Text size="1" color="gray">{type.rowCountA}/{type.rowCountB} rows</Text>
          )}
          {type.hasDifferences && (
            <Badge color="yellow" size="1">
              {diffCount} diff{diffCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </Flex>
      </Flex>

      {expanded && (
        <Box p="3">
          {type.status !== 'shared' ? (
            <Text size="2" color="gray">
              This statement type exists only in {type.status === 'only-in-a' ? 'Bundle A' : 'Bundle B'} with{' '}
              {type.status === 'only-in-a' ? type.rowCountA : type.rowCountB} rows.
            </Text>
          ) : (
            <>
              {filteredRows.length > 0 && (
                <Box mb="3">
                  <Heading size="2" mb="2">Rows</Heading>
                  {filteredRows.map((row, i) => (
                    <DiffItem key={i} label={row.label} sublabel={`in "${type.label}"`} status={row.status} fieldDiffs={row.fieldDiffs} />
                  ))}
                </Box>
              )}

              {filteredTotals.length > 0 && (
                <Box>
                  <Heading size="2" mb="2">Record Totals</Heading>
                  {filteredTotals.map((tot, i) => (
                    <DiffItem key={i} label={tot.label} sublabel={`in "${type.label}"`} status={tot.status} fieldDiffs={tot.fieldDiffs} />
                  ))}
                </Box>
              )}

              {filteredRows.length === 0 && filteredTotals.length === 0 && (
                <Text size="2" color="green">Identical configuration</Text>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  )
}

function ScheduleItem({ schedule }: { schedule: ScheduleComparison }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const hasConfigDiffs = schedule.configDiffs && schedule.configDiffs.length > 0

  return (
    <Box py="2" px="3" style={{ borderBottom: '1px solid var(--gray-3)' }}>
      <Flex
        gap="2"
        align="center"
        style={{ cursor: hasConfigDiffs ? 'pointer' : 'default' }}
        onClick={() => { if (hasConfigDiffs) setExpanded(!expanded) }}
      >
        <StatusBadge status={schedule.status} />
        <Text size="2" weight="medium" style={{ flex: 1 }}>{schedule.name}</Text>
        {schedule.status === 'shared' && (
          <Text size="1" color="gray">
            {schedule.entryCountA}/{schedule.entryCountB} entries
          </Text>
        )}
        {hasConfigDiffs && (
          <Text size="1" style={{ fontFamily: 'monospace', color: 'var(--gray-9)' }}>
            {expanded ? '\u25BC' : '\u25B6'}
          </Text>
        )}
      </Flex>
      {expanded && schedule.configDiffs && <FieldDiffTable diffs={schedule.configDiffs} />}
    </Box>
  )
}

function DebtScheduleItem({ schedule }: { schedule: DebtScheduleComparison }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const hasConfigDiffs = schedule.configDiffs && schedule.configDiffs.length > 0

  return (
    <Box py="2" px="3" style={{ borderBottom: '1px solid var(--gray-3)' }}>
      <Flex
        gap="2"
        align="center"
        style={{ cursor: hasConfigDiffs ? 'pointer' : 'default' }}
        onClick={() => { if (hasConfigDiffs) setExpanded(!expanded) }}
      >
        <StatusBadge status={schedule.status} />
        <Text size="2" weight="medium" style={{ flex: 1 }}>{schedule.name}</Text>
        {schedule.status === 'shared' && (
          <Text size="1" color="gray">{schedule.debtCountA}/{schedule.debtCountB} debts</Text>
        )}
        {hasConfigDiffs && (
          <Text size="1" style={{ fontFamily: 'monospace', color: 'var(--gray-9)' }}>
            {expanded ? '\u25BC' : '\u25B6'}
          </Text>
        )}
      </Flex>
      {expanded && schedule.configDiffs && <FieldDiffTable diffs={schedule.configDiffs} />}
    </Box>
  )
}

function Section({ title, count, children, defaultCollapsed = false }: {
  title: string
  count: number
  children: React.ReactNode
  defaultCollapsed?: boolean
}): React.ReactElement {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  if (count === 0) return <React.Fragment />

  return (
    <Box style={{ border: '1px solid var(--gray-5)', borderRadius: 'var(--radius-2)', overflow: 'hidden' }}>
      <Flex
        p="3"
        align="center"
        justify="between"
        style={{ background: 'var(--gray-2)', cursor: 'pointer' }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <Flex gap="2" align="center">
          <Text size="1" style={{ fontFamily: 'monospace', minWidth: 16 }}>
            {collapsed ? '\u25B6' : '\u25BC'}
          </Text>
          <Heading size="3">{title}</Heading>
        </Flex>
        <Badge variant="soft">{count}</Badge>
      </Flex>
      {!collapsed && children}
    </Box>
  )
}

export default function CompareResultsStep({ filePathA, filePathB, onBack, onStartOver, onCompared }: Props): React.ReactElement {
  const [comparison, setComparison] = useState<BundleComparison | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [search, setSearch] = useState('')
  const [exportPath, setExportPath] = useState('')
  const [expandAll, setExpandAll] = useState<boolean | null>(null)

  useEffect(() => {
    window.api.compareBundles(filePathA, filePathB)
      .then((result) => {
        setComparison(result)
        setLoading(false)
        if (onCompared) {
          let total = result.topLevel.length
          for (const st of result.statementTypes) {
            if (st.status !== 'shared') total++
            total += st.rowDifferences.length + st.totalDifferences.length
          }
          for (const sc of result.schedules) { if (sc.status !== 'shared' || sc.configDiffs) total++ }
          for (const ds of result.debtSchedules) { if (ds.status !== 'shared' || ds.configDiffs) total++ }
          onCompared(total, result.summary.identical)
        }
      })
      .catch((err) => { setError(err instanceof Error ? err.message : String(err)); setLoading(false) })
  }, [filePathA, filePathB])

  const handleExport = async (format: 'md' | 'csv' = 'md'): Promise<void> => {
    if (!comparison) return
    try {
      const path = format === 'csv'
        ? await window.api.exportCompareCsv(comparison)
        : await window.api.exportCompareReport(comparison)
      setExportPath(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const counts = useMemo(() => {
    if (!comparison) return { total: 0, configDiffs: 0, onlyInA: 0, onlyInB: 0 }
    const c = comparison
    let onlyInA = 0
    let onlyInB = 0
    let configDiffs = 0

    for (const st of c.statementTypes) {
      if (st.status === 'only-in-a') onlyInA++
      if (st.status === 'only-in-b') onlyInB++
      for (const r of st.rowDifferences) {
        if (r.status === 'only-in-a') onlyInA++
        if (r.status === 'only-in-b') onlyInB++
        if (r.status === 'config-different') configDiffs++
      }
      for (const t of st.totalDifferences) {
        if (t.status === 'only-in-a') onlyInA++
        if (t.status === 'only-in-b') onlyInB++
        if (t.status === 'config-different') configDiffs++
      }
    }
    for (const sc of c.schedules) {
      if (sc.status === 'only-in-a') onlyInA++
      if (sc.status === 'only-in-b') onlyInB++
      if (sc.configDiffs) configDiffs++
    }
    for (const ds of c.debtSchedules) {
      if (ds.status === 'only-in-a') onlyInA++
      if (ds.status === 'only-in-b') onlyInB++
      if (ds.configDiffs) configDiffs++
    }

    return { total: onlyInA + onlyInB + configDiffs + c.topLevel.length, configDiffs, onlyInA, onlyInB }
  }, [comparison])

  const structurallySimilar = useMemo(() => {
    if (!comparison) return false
    const s = comparison.summary
    return !s.identical && s.totalStatementTypes > 0 && s.sharedStatementTypes / s.totalStatementTypes >= 0.7
  }, [comparison])

  const filteredSchedules = useMemo(() => {
    if (!comparison) return []
    return comparison.schedules.filter((sc) => {
      if (filter === 'only-in-a' && sc.status !== 'only-in-a') return false
      if (filter === 'only-in-b' && sc.status !== 'only-in-b') return false
      if (filter === 'config-different' && !sc.configDiffs) return false
      if (search && !sc.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [comparison, filter, search])

  const filteredDebtSchedules = useMemo(() => {
    if (!comparison) return []
    return comparison.debtSchedules.filter((ds) => {
      if (filter === 'only-in-a' && ds.status !== 'only-in-a') return false
      if (filter === 'only-in-b' && ds.status !== 'only-in-b') return false
      if (filter === 'config-different' && !ds.configDiffs) return false
      if (search && !ds.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [comparison, filter, search])

  const filteredTopLevel = useMemo(() => {
    if (!comparison) return []
    return comparison.topLevel.filter((d) => {
      if (severityFilter !== 'all' && d.severity !== severityFilter) return false
      if (search && !d.label.toLowerCase().includes(search.toLowerCase()) && !d.description.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [comparison, severityFilter, search])

  const filteredStatementTypeCount = useMemo(() => {
    if (!comparison) return 0
    return comparison.statementTypes.filter((type) => {
      if (filter === 'only-in-a' && type.status !== 'only-in-a') return false
      if (filter === 'only-in-b' && type.status !== 'only-in-b') return false
      if (filter === 'config-different' && !type.hasDifferences) return false
      const searchLower = search.toLowerCase()
      if (search && !type.label.toLowerCase().includes(searchLower)
        && !type.rowDifferences.some((r) => r.label.toLowerCase().includes(searchLower))
        && !type.totalDifferences.some((t) => t.label.toLowerCase().includes(searchLower))) return false
      return true
    }).length
  }, [comparison, filter, search])

  const noVisibleResults = !!(comparison && !comparison.summary.identical
    && filteredStatementTypeCount === 0 && filteredSchedules.length === 0
    && filteredDebtSchedules.length === 0 && filteredTopLevel.length === 0)

  if (loading) {
    return <Text size="2" color="gray">Comparing bundles...</Text>
  }

  if (error) {
    return (
      <Flex direction="column" gap="4">
        <Heading size="5">Compare Error</Heading>
        <Box p="3" style={{ background: 'var(--red-3)', borderRadius: 'var(--radius-2)' }}>
          <Text color="red" size="2">{error}</Text>
        </Box>
        <Button variant="soft" onClick={onBack}>&larr; Back</Button>
      </Flex>
    )
  }

  if (!comparison) return <React.Fragment />

  const s = comparison.summary

  const filterBtn = (label: string, value: StatusFilter): React.ReactElement => (
    <Button size="1" variant={filter === value ? 'solid' : 'soft'} onClick={() => setFilter(value)}>
      {label}
    </Button>
  )

  const sevBtn = (label: string, value: SeverityFilter): React.ReactElement => (
    <Button size="1" variant={severityFilter === value ? 'solid' : 'soft'} onClick={() => setSeverityFilter(value)}>
      {label}
    </Button>
  )

  return (
    <Flex direction="column" gap="4">
      <Heading size="5">Comparison Results</Heading>

      <Flex gap="4">
        <Box flexGrow="1" p="3" style={{ background: 'var(--blue-2)', borderRadius: 'var(--radius-2)', borderLeft: '3px solid var(--blue-8)' }}>
          <Text size="1" weight="bold" color="blue" style={{ display: 'block', marginBottom: 2 }}>Bundle A</Text>
          <Text size="2" weight="bold" style={{ display: 'block' }}>{comparison.bundleAName}</Text>
          <Text size="1" color="gray" style={{ display: 'block' }}>
            Extracted {new Date(comparison.bundleAExtractedAt).toLocaleDateString()} &middot; {comparison.bundleARecordCount.toLocaleString()} records
          </Text>
        </Box>
        <Box flexGrow="1" p="3" style={{ background: 'var(--orange-2)', borderRadius: 'var(--radius-2)', borderLeft: '3px solid var(--orange-8)' }}>
          <Text size="1" weight="bold" color="orange" style={{ display: 'block', marginBottom: 2 }}>Bundle B</Text>
          <Text size="2" weight="bold" style={{ display: 'block' }}>{comparison.bundleBName}</Text>
          <Text size="1" color="gray" style={{ display: 'block' }}>
            Extracted {new Date(comparison.bundleBExtractedAt).toLocaleDateString()} &middot; {comparison.bundleBRecordCount.toLocaleString()} records
          </Text>
        </Box>
      </Flex>

      {s.identical ? (
        <Box p="4" style={{ background: 'var(--green-3)', borderRadius: 'var(--radius-2)' }}>
          <Text color="green" size="3" weight="bold">These bundles are identical in configuration</Text>
        </Box>
      ) : (
        <>
          {structurallySimilar && (
            <Box p="4" style={{ background: 'var(--green-3)', borderRadius: 'var(--radius-2)' }}>
              <Text color="green" size="3" weight="bold">These bundles are structurally similar</Text>
            </Box>
          )}

          <Box p="4" style={{ background: 'var(--gray-2)', borderRadius: 'var(--radius-2)' }}>
            <Flex direction="column" gap="2">
              <Text size="3" weight="bold">
                {counts.total} difference{counts.total !== 1 ? 's' : ''} found between &ldquo;{comparison.bundleAName}&rdquo; and &ldquo;{comparison.bundleBName}&rdquo;
              </Text>
              <Flex gap="2">
                <Badge color="blue">{counts.onlyInA} only in A</Badge>
                <Badge color="orange">{counts.onlyInB} only in B</Badge>
                <Badge color="yellow">{counts.configDiffs} config difference{counts.configDiffs !== 1 ? 's' : ''}</Badge>
              </Flex>
            </Flex>
          </Box>
        </>
      )}

      {!s.identical && (
        <Flex gap="4" align="center" wrap="wrap">
          <Flex gap="1" align="center">
            <Text size="1" weight="medium">Type:</Text>
            {filterBtn('All', 'all')}
            {filterBtn('Only in A', 'only-in-a')}
            {filterBtn('Only in B', 'only-in-b')}
            {filterBtn('Config Diff', 'config-different')}
          </Flex>
          <Flex gap="1" align="center" title="Filters the Other Differences section only">
            <Text size="1" weight="medium" color="gray">Severity (Other):</Text>
            {sevBtn('All', 'all')}
            {sevBtn('High', 'high')}
            {sevBtn('Medium', 'medium')}
            {sevBtn('Low', 'low')}
          </Flex>
          <Box style={{ flex: 1, minWidth: 150 }}>
            <TextField.Root
              size="1"
              placeholder="Search differences..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Box>
          <Flex gap="1" align="center">
            <Button size="1" variant="ghost" onClick={() => setExpandAll(true)}>Expand All</Button>
            <Button size="1" variant="ghost" onClick={() => setExpandAll(false)}>Collapse All</Button>
          </Flex>
        </Flex>
      )}

      {/* Statement Types */}
      <Section title="Statement Types" count={comparison.statementTypes.length}>
        <Flex direction="column" gap="2" p="2">
          {comparison.statementTypes.map((type) => (
            <StatementTypeCard
              key={type.label}
              type={type}
              filter={filter}
              search={search}
              defaultExpanded={type.status === 'shared' && type.hasDifferences}
              expandOverride={expandAll}
            />
          ))}
        </Flex>
      </Section>

      {/* Schedules */}
      <Section title="Schedules" count={filteredSchedules.length}>
        {filteredSchedules.map((sc) => <ScheduleItem key={sc.name} schedule={sc} />)}
      </Section>

      {/* Debt Schedules */}
      <Section title="Debt Schedules" count={filteredDebtSchedules.length}>
        {filteredDebtSchedules.map((ds) => <DebtScheduleItem key={ds.name} schedule={ds} />)}
      </Section>

      {/* Top-level / Other Differences */}
      {filteredTopLevel.length > 0 && (
        <Section title="Other Differences" count={filteredTopLevel.length}>
          {filteredTopLevel.map((d, i) => (
            <Box key={i} py="2" px="3" style={{ borderBottom: '1px solid var(--gray-3)' }}>
              <Flex gap="2" align="center">
                <SeverityBadge severity={d.severity} />
                <Heading size="2">{d.label}</Heading>
              </Flex>
              <Text size="2" ml="5">{d.description}</Text>
            </Box>
          ))}
        </Section>
      )}

      {noVisibleResults && (
        <Box p="4" style={{ background: 'var(--gray-2)', borderRadius: 'var(--radius-2)', textAlign: 'center' }}>
          <Text size="2" color="gray">No differences match the current filter.</Text>
        </Box>
      )}

      {exportPath && (
        <Box p="3" style={{ background: 'var(--green-3)', borderRadius: 'var(--radius-2)' }}>
          <Text size="2" color="green">
            Report exported to: <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{exportPath}</span>
          </Text>
        </Box>
      )}

      <Flex gap="3">
        <Button variant="soft" onClick={onBack}>&larr; Back</Button>
        {!s.identical && (
          <>
            <Button variant="soft" onClick={() => handleExport('md')}>Export Markdown</Button>
            <Button variant="soft" onClick={() => handleExport('csv')}>Export CSV</Button>
          </>
        )}
        <Button onClick={onStartOver}>Start Over</Button>
      </Flex>
    </Flex>
  )
}
