import React, { useState } from 'react'
import { Box, Flex, Heading, Text, Button, TextField } from '@radix-ui/themes'
import type { AppMode, BundleExport } from '../../../shared/types'

interface Props {
  bundleExport: BundleExport
  mode: AppMode
  onNext: () => void
  onBack: () => void
  onStartOver: () => void
  onFileRenamed?: (newPath: string) => void
}

function CollapsibleList({
  label,
  items,
  collapseThreshold
}: {
  label: string
  items: string[]
  collapseThreshold: number
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) {
    return (
      <Text size="2">
        <strong>{label}:</strong> <em>None</em>
      </Text>
    )
  }

  if (items.length <= collapseThreshold) {
    return (
      <Text size="2">
        <strong>{label}:</strong> {items.join(', ')}
      </Text>
    )
  }

  return (
    <Flex direction="column" gap="1">
      <Text
        size="2"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ display: 'inline-block', width: 16, fontFamily: 'monospace' }}>
          {expanded ? '▼' : '▶'}
        </span>
        <strong>{label}:</strong> {items.length} items
      </Text>
      {expanded && (
        <Box pl="4">
          {items.map((item) => (
            <Text key={item} size="1" style={{ display: 'block', fontFamily: 'monospace', padding: '1px 0' }}>
              {item}
            </Text>
          ))}
        </Box>
      )}
    </Flex>
  )
}

export default function ReviewStep({ bundleExport, mode, onNext, onBack, onStartOver, onFileRenamed }: Props): React.ReactElement {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const [renaming, setRenaming] = useState(false)

  const currentFileName = bundleExport.exportFilePath.split('/').pop() ?? ''
  const fileNameWithoutExt = currentFileName.replace(/\.json$/, '')

  const startRename = (): void => {
    setRenameValue(fileNameWithoutExt)
    setRenameError('')
    setIsRenaming(true)
  }

  const cancelRename = (): void => {
    setIsRenaming(false)
    setRenameError('')
  }

  const confirmRename = async (): Promise<void> => {
    const trimmed = renameValue.trim()
    if (!trimmed) {
      setRenameError('File name cannot be empty.')
      return
    }
    if (trimmed === fileNameWithoutExt) {
      setIsRenaming(false)
      return
    }
    setRenaming(true)
    setRenameError('')
    try {
      const newPath = await window.api.renameExportFile(bundleExport.exportFilePath, trimmed)
      onFileRenamed?.(newPath)
      setIsRenaming(false)
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : String(err))
    } finally {
      setRenaming(false)
    }
  }

  const objectEntries = Object.entries(bundleExport.records)
  const totalRecords = objectEntries.reduce((sum, [, recs]) => sum + recs.length, 0)
  const emptyObjects = objectEntries.filter(([, recs]) => recs.length === 0)
  const ref = bundleExport.referenceData

  const scheduleCount = (bundleExport.records['LLC_BI__Schedule__c'] ?? []).length
  const scheduleEntryCount = (bundleExport.records['LLC_BI__Schedule_Entry__c'] ?? []).length
  const allSections = bundleExport.records['LLC_BI__Schedule_Section__c'] ?? []
  const scheduleSectionCount = allSections.filter((r) => !!r.LLC_BI__Schedule__c).length
  const debtScheduleSectionCount = allSections.filter((r) => !!r.LLC_BI__Debt_Schedule__c).length

  const debtScheduleCount = (bundleExport.records['LLC_BI__Debt_Schedule__c'] ?? []).length
  const debtCount = (bundleExport.records['LLC_BI__Debt__c'] ?? []).length
  const internalDebtCount = (bundleExport.records['LLC_BI__Debt_Internal__c'] ?? []).length
  const loanAssumptionCount = (bundleExport.records['LLC_BI__Loan_Assumptions__c'] ?? []).length

  const hasScheduleData = scheduleCount > 0 || scheduleEntryCount > 0 || scheduleSectionCount > 0
  const hasDebtScheduleData = debtScheduleCount > 0 || debtCount > 0 || internalDebtCount > 0 || debtScheduleSectionCount > 0 || loanAssumptionCount > 0
  const isTemplate = (bundleExport.records['LLC_BI__Spread_Statement_Period__c']?.length ?? 0) === 0

  return (
    <Flex direction="column" gap="4">
      <Heading size="5">Review {mode === 'upsert-only' ? 'Bundle Data' : 'Extraction'}</Heading>

      <Text size="2" color="gray">
        {mode === 'upsert-only'
          ? 'Review the loaded bundle data before upserting to the target org.'
          : mode === 'extract-only'
            ? 'Review the extracted data.'
            : 'Review the extracted data before upserting to the target org.'}
      </Text>

      {mode === 'upsert-only' && (
        <Box p="3" style={{ background: 'var(--blue-3)', borderRadius: 'var(--radius-2)' }}>
          <Text size="2">
            <strong>Source:</strong> Loaded from file
          </Text>
        </Box>
      )}

      {emptyObjects.length > 0 && (
        <Box p="3" style={{ background: 'var(--yellow-3)', borderRadius: 'var(--radius-2)' }}>
          <Text color="yellow" size="2">
            {emptyObjects.length} object(s) have 0 records:{' '}
            {emptyObjects.map(([name]) => name).join(', ')}
          </Text>
        </Box>
      )}

      {isTemplate && (
        <Box p="3" style={{ background: 'var(--blue-3)', borderRadius: 'var(--radius-2)' }}>
          <Text size="2" color="blue">
            Periods and period data (Record Values, Period Totals) are created when a bundle is instantiated from this template. Template extraction captures the structure and row configuration only.
          </Text>
        </Box>
      )}

      {/* Summary table */}
      <Box style={{ border: '1px solid var(--gray-5)', borderRadius: 'var(--radius-2)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 12px', background: 'var(--gray-2)', borderBottom: '1px solid var(--gray-5)' }}>
                Object API Name
              </th>
              <th style={{ textAlign: 'right', padding: '8px 12px', background: 'var(--gray-2)', borderBottom: '1px solid var(--gray-5)' }}>
                Record Count
              </th>
            </tr>
          </thead>
          <tbody>
            {objectEntries.map(([name, recs]) => (
              <tr key={name}>
                <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--gray-3)', fontFamily: 'monospace', fontSize: 12 }}>
                  {name}
                </td>
                <td style={{
                  padding: '6px 12px',
                  borderBottom: '1px solid var(--gray-3)',
                  textAlign: 'right',
                  color: recs.length === 0 ? 'var(--yellow-11)' : undefined
                }}>
                  {recs.length.toLocaleString()}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: '8px 12px', fontWeight: 600 }}>Total</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                {totalRecords.toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </Box>

      {/* Reference data */}
      <Box p="4" style={{ border: '1px solid var(--gray-5)', borderRadius: 'var(--radius-3)' }}>
        <Heading size="3" mb="2">Reference Data (will resolve in target)</Heading>
        <Flex direction="column" gap="2">
          <Text size="2">
            <strong>Financial Consolidation:</strong>{' '}
            {ref.financialConsolidationName || <em>None</em>}
          </Text>
          <CollapsibleList
            label="Classifications"
            items={ref.classificationNames}
            collapseThreshold={3}
          />
          <CollapsibleList
            label="Projections Templates"
            items={ref.projectionsTemplateLookupKeys}
            collapseThreshold={3}
          />
        </Flex>
      </Box>

      {/* Schedules */}
      <Box p="4" style={{ border: '1px solid var(--gray-5)', borderRadius: 'var(--radius-3)' }}>
        <Heading size="3" mb="2">Schedules</Heading>
        {hasScheduleData ? (
          <Flex direction="column" gap="1">
            <Text size="2"><strong>LLC_BI__Schedule__c:</strong> {scheduleCount}</Text>
            <Text size="2"><strong>LLC_BI__Schedule_Entry__c:</strong> {scheduleEntryCount}</Text>
            <Text size="2"><strong>LLC_BI__Schedule_Section__c (Schedule):</strong> {scheduleSectionCount}</Text>
          </Flex>
        ) : (
          <Box p="2" style={{ background: 'var(--blue-2)', borderRadius: 'var(--radius-2)' }}>
            <Text size="2" color="blue">
              {isTemplate
                ? 'Template has no schedule configuration yet.'
                : 'No schedule data found on this bundle.'}
            </Text>
          </Box>
        )}
      </Box>

      {/* Debt Schedules */}
      <Box p="4" style={{ border: '1px solid var(--gray-5)', borderRadius: 'var(--radius-3)' }}>
        <Heading size="3" mb="2">Debt Schedules</Heading>
        {hasDebtScheduleData ? (
          <Flex direction="column" gap="1">
            <Text size="2"><strong>LLC_BI__Debt_Schedule__c:</strong> {debtScheduleCount}</Text>
            <Text size="2"><strong>LLC_BI__Debt__c (parent):</strong> {debtCount}</Text>
            <Text size="2"><strong>LLC_BI__Debt__c (internal):</strong> {internalDebtCount}</Text>
            <Text size="2"><strong>LLC_BI__Schedule_Section__c (Debt Schedule):</strong> {debtScheduleSectionCount}</Text>
            <Text size="2"><strong>LLC_BI__Loan_Assumptions__c:</strong> {loanAssumptionCount}</Text>
          </Flex>
        ) : (
          <Box p="2" style={{ background: 'var(--blue-2)', borderRadius: 'var(--radius-2)' }}>
            <Text size="2" color="blue">
              {isTemplate
                ? 'Template has no debt schedule configuration yet.'
                : 'No debt schedule data found on this bundle.'}
            </Text>
          </Box>
        )}
      </Box>

      {/* Export file path */}
      <Box p="3" style={{ background: 'var(--gray-2)', borderRadius: 'var(--radius-2)' }}>
        {!isRenaming ? (
          <Flex align="center" gap="2">
            <Text size="2" style={{ flex: 1 }}>
              <strong>Export file:</strong>{' '}
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {bundleExport.exportFilePath}
              </span>
            </Text>
            <Button variant="ghost" size="1" onClick={startRename} style={{ flexShrink: 0 }}>
              Rename
            </Button>
          </Flex>
        ) : (
          <Flex direction="column" gap="2">
            <Text size="2"><strong>Rename export file:</strong></Text>
            <Flex align="center" gap="2">
              <TextField.Root
                size="2"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmRename()
                  if (e.key === 'Escape') cancelRename()
                }}
                disabled={renaming}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
              />
              <Text size="2" color="gray">.json</Text>
              <Button size="1" onClick={confirmRename} disabled={renaming}>
                {renaming ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="soft" size="1" onClick={cancelRename} disabled={renaming}>
                Cancel
              </Button>
            </Flex>
            {renameError && (
              <Text size="1" color="red">{renameError}</Text>
            )}
          </Flex>
        )}
      </Box>

      {mode === 'extract-only' && (
        <Box p="4" style={{ background: 'var(--green-3)', borderRadius: 'var(--radius-2)' }}>
          <Flex direction="column" gap="2">
            <Heading size="3" style={{ color: 'var(--green-11)' }}>Extraction Complete</Heading>
            <Text size="2">
              The bundle has been extracted and saved to the file above.
            </Text>
          </Flex>
        </Box>
      )}

      {mode !== 'extract-only' && (
        <Box p="3" style={{ background: 'var(--blue-3)', borderRadius: 'var(--radius-2)' }}>
          <Text size="2" color="blue">
            Records with matching lookupKey__c values will be updated in place. New records will be created. No duplicates will be created.
          </Text>
        </Box>
      )}

      <Flex gap="3">
        <Button variant="soft" onClick={onBack}>&larr; Back</Button>
        {mode === 'extract-only' ? (
          <>
            <Button
              variant="soft"
              onClick={() => window.api.openFile(bundleExport.exportFilePath)}
            >
              Open File
            </Button>
            <Button onClick={onStartOver}>Start Over</Button>
          </>
        ) : (
          <Button onClick={onNext}>
            Proceed with Upsert &rarr;
          </Button>
        )}
      </Flex>
    </Flex>
  )
}
