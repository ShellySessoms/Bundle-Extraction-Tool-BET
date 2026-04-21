import React from 'react'
import { Box, Flex, Heading, Text, Button } from '@radix-ui/themes'
import type { AppMode, ImportSummary } from '../../../shared/types'

interface Props {
  summary: ImportSummary
  mode: AppMode
  exportFilePath?: string
  onStartOver: () => void
  onUpsertFile?: (filePath: string) => void
}

export default function SummaryStep({ summary, mode, exportFilePath, onStartOver, onUpsertFile }: Props): React.ReactElement {
  const overallStatus = summary.failed === 0
    ? 'success'
    : summary.succeeded > 0
      ? 'partial'
      : 'failed'

  const bannerStyle: Record<string, { bg: string; color: 'green' | 'yellow' | 'red'; label: string }> = {
    success: { bg: 'var(--green-3)', color: 'green', label: 'Upsert Complete' },
    partial: { bg: 'var(--yellow-3)', color: 'yellow', label: 'Partial Success' },
    failed: { bg: 'var(--red-3)', color: 'red', label: 'Upsert Failed' }
  }

  const banner = bannerStyle[overallStatus]
  const objectEntries = Object.entries(summary.byObject)

  const handleExportErrors = (): void => {
    const rows = summary.failedRecords.map((r) => {
      const lookupKey = (r.record.LLC_BI__lookupKey__c as string) ?? r.sourceId
      const escapedError = r.error.replace(/"/g, '""')
      return `"${r.objectName}","${lookupKey}","${escapedError}"`
    })
    const csv = ['Object,LookupKey,Error', ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `errors_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Flex direction="column" gap="4">
      <Heading size="5">Summary</Heading>

      <Box p="4" style={{ background: banner.bg, borderRadius: 'var(--radius-2)' }}>
        <Text color={banner.color} size="4" weight="bold">{banner.label}</Text>
      </Box>

      {/* Summary table */}
      <Box style={{ border: '1px solid var(--gray-5)', borderRadius: 'var(--radius-2)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 12px', background: 'var(--gray-2)', borderBottom: '1px solid var(--gray-5)' }}>
                Object
              </th>
              <th style={{ textAlign: 'right', padding: '8px 12px', background: 'var(--gray-2)', borderBottom: '1px solid var(--gray-5)' }}>
                Succeeded
              </th>
              <th style={{ textAlign: 'right', padding: '8px 12px', background: 'var(--gray-2)', borderBottom: '1px solid var(--gray-5)' }}>
                Failed
              </th>
            </tr>
          </thead>
          <tbody>
            {objectEntries.map(([name, counts]) => (
              <tr key={name}>
                <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--gray-3)', fontFamily: 'monospace', fontSize: 12 }}>
                  {name}
                </td>
                <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--gray-3)', textAlign: 'right' }}>
                  {counts.created}
                </td>
                <td style={{
                  padding: '6px 12px',
                  borderBottom: '1px solid var(--gray-3)',
                  textAlign: 'right',
                  color: counts.failed > 0 ? 'var(--red-11)' : undefined,
                  fontWeight: counts.failed > 0 ? 600 : undefined
                }}>
                  {counts.failed}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: '8px 12px', fontWeight: 600 }}>Total</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                {summary.succeeded}
              </td>
              <td style={{
                padding: '8px 12px',
                textAlign: 'right',
                fontWeight: 600,
                color: summary.failed > 0 ? 'var(--red-11)' : undefined
              }}>
                {summary.failed}
              </td>
            </tr>
          </tbody>
        </table>
      </Box>

      <Flex gap="3">
        <Button variant="soft" onClick={() => window.api.openLogFile()}>
          Open Log File
        </Button>
        {summary.failedRecords.length > 0 && (
          <Button variant="soft" color="red" onClick={handleExportErrors}>
            Export Error Report
          </Button>
        )}
        {mode === 'extract-upsert' && exportFilePath && onUpsertFile && (
          <Button variant="soft" onClick={() => onUpsertFile(exportFilePath)}>
            Upsert this file again &rarr;
          </Button>
        )}
        <Button onClick={onStartOver}>Start Over</Button>
      </Flex>
    </Flex>
  )
}
