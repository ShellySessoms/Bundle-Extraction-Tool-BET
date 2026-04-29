import React, { useState } from 'react'
import { Box, Flex, Heading, Text, Button } from '@radix-ui/themes'
import type { AppMode, BundleExport, ImportSummary, ManifestPackage } from '../../../shared/types'

interface Props {
  summary: ImportSummary
  mode: AppMode
  exportFilePath?: string
  bundleExport?: BundleExport
  hasProvisioningData?: boolean
  onStartOver: () => void
  onUpsertFile?: (filePath: string) => void
}

export default function SummaryStep({ summary, mode, exportFilePath, bundleExport, hasProvisioningData, onStartOver, onUpsertFile }: Props): React.ReactElement {
  const isWindows = navigator.userAgent.includes('Windows')
  const finderLabel = isWindows ? 'Show in Explorer' : 'Show in Finder'

  const fileName = exportFilePath?.split('/').pop() ?? ''
  const folderPath = exportFilePath?.substring(0, exportFilePath.lastIndexOf('/')) ?? ''

  const [copied, setCopied] = useState(false)
  const copyPath = (): void => {
    if (!exportFilePath) return
    navigator.clipboard.writeText(exportFilePath)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const [manifestState, setManifestState] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [manifestResult, setManifestResult] = useState<ManifestPackage | null>(null)
  const [manifestError, setManifestError] = useState('')
  const [manifestCopied, setManifestCopied] = useState(false)

  const handleGenerateManifest = async (): Promise<void> => {
    if (!bundleExport || !exportFilePath) return

    const outputDir = folderPath || await window.api.selectDirectory()
    if (!outputDir) return

    setManifestState('generating')
    setManifestError('')
    try {
      const result = await window.api.generateManifest(bundleExport, outputDir)
      setManifestResult(result)
      setManifestState('done')
    } catch (err) {
      setManifestError(err instanceof Error ? err.message : String(err))
      setManifestState('error')
    }
  }

  const copyManifestPath = (): void => {
    if (!manifestResult) return
    navigator.clipboard.writeText(manifestResult.manifestDir)
    setManifestCopied(true)
    setTimeout(() => setManifestCopied(false), 2000)
  }

  const overallStatus = summary.aborted
    ? 'aborted'
    : summary.failed === 0
      ? 'success'
      : summary.succeeded > 0
        ? 'partial'
        : 'failed'

  const bannerStyle: Record<string, { bg: string; color: 'green' | 'yellow' | 'red'; label: string }> = {
    success: { bg: 'var(--green-3)', color: 'green', label: 'Upsert Complete' },
    partial: { bg: 'var(--yellow-3)', color: 'yellow', label: 'Partial Success' },
    failed: { bg: 'var(--red-3)', color: 'red', label: 'Upsert Failed' },
    aborted: { bg: 'var(--red-3)', color: 'red', label: 'Import Aborted' }
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
        {summary.abortReason && (
          <Box mt="2">
            <Text color="red" size="2">{summary.abortReason}</Text>
            <Box mt="1">
              <Text color="red" size="2">Fix the failed phase and try the import again.</Text>
            </Box>
          </Box>
        )}
      </Box>

      {/* File location card */}
      {exportFilePath && overallStatus === 'success' && (
        <Box p="4" style={{ border: '1px solid var(--green-6)', borderRadius: 'var(--radius-3)', background: 'var(--green-2)' }}>
          <Flex direction="column" gap="2">
            <Text size="2" color="green" weight="bold">Saved to:</Text>
            <Text size="3" weight="medium" style={{ fontFamily: 'monospace' }}>{fileName}</Text>
            <Text size="1" color="gray" style={{ fontFamily: 'monospace' }}>{folderPath}/</Text>
            <Flex gap="2" mt="1">
              <Button variant="soft" size="1" onClick={() => window.api.showInFinder(exportFilePath)}>
                {finderLabel}
              </Button>
              <Button variant="soft" size="1" onClick={() => window.api.openFolder(folderPath)}>
                Open folder
              </Button>
              <Button variant="soft" size="1" onClick={copyPath}>
                {copied ? 'Copied!' : 'Copy path'}
              </Button>
            </Flex>
          </Flex>
        </Box>
      )}

      {exportFilePath && overallStatus !== 'success' && (
        <Box p="3" style={{ background: 'var(--gray-2)', borderRadius: 'var(--radius-2)' }}>
          <Flex direction="column" gap="1">
            <Text size="2">
              <strong>Source file:</strong>{' '}
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{fileName}</span>
            </Text>
            <Flex gap="2">
              <Button variant="ghost" size="1" onClick={() => window.api.showInFinder(exportFilePath)}>
                {finderLabel}
              </Button>
              <Button variant="ghost" size="1" onClick={copyPath}>
                {copied ? 'Copied!' : 'Copy path'}
              </Button>
            </Flex>
          </Flex>
        </Box>
      )}

      {/* Summary table */}
      <Box style={{ border: '1px solid var(--gray-5)', borderRadius: 'var(--radius-2)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 12px', background: 'var(--gray-2)', borderBottom: '1px solid var(--gray-5)' }}>
                Object
              </th>
              <th style={{ textAlign: 'right', padding: '8px 12px', background: 'var(--gray-2)', borderBottom: '1px solid var(--gray-5)' }}>
                Created
              </th>
              <th style={{ textAlign: 'right', padding: '8px 12px', background: 'var(--gray-2)', borderBottom: '1px solid var(--gray-5)' }}>
                Updated
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
                <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--gray-3)', textAlign: 'right' }}>
                  {counts.updated}
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
                {objectEntries.reduce((sum, [, c]) => sum + c.created, 0)}
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                {objectEntries.reduce((sum, [, c]) => sum + c.updated, 0)}
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

      {/* Manifest results panel */}
      {manifestState === 'done' && manifestResult && (
        <Box p="4" style={{ border: '1px solid var(--blue-6)', borderRadius: 'var(--radius-3)', background: 'var(--blue-2)' }}>
          <Flex direction="column" gap="3">
            <Text size="3" weight="bold" color="blue">Manifest generated successfully</Text>
            <Flex align="center" gap="2">
              <Text size="2">
                <strong>Location:</strong>{' '}
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{manifestResult.manifestDir}</span>
              </Text>
              <Button variant="ghost" size="1" onClick={() => window.api.showInFinder(manifestResult.manifestDir)}>
                {finderLabel}
              </Button>
            </Flex>
            <Text size="2">
              <strong>Mode:</strong> {manifestResult.mode === 'full' ? 'Full (org-connected)' : 'Offline'}
            </Text>

            <Box style={{ border: '1px solid var(--gray-5)', borderRadius: 'var(--radius-2)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 10px', background: 'var(--gray-2)', borderBottom: '1px solid var(--gray-5)' }}>File</th>
                    <th style={{ textAlign: 'center', padding: '6px 10px', background: 'var(--gray-2)', borderBottom: '1px solid var(--gray-5)' }}>Required</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', background: 'var(--gray-2)', borderBottom: '1px solid var(--gray-5)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {manifestResult.files.map((f) => (
                    <tr key={f.relativePath}>
                      <td style={{ padding: '4px 10px', borderBottom: '1px solid var(--gray-3)', fontFamily: 'monospace', fontSize: 12 }}>
                        {f.relativePath.replace('./', '')}
                      </td>
                      <td style={{ padding: '4px 10px', borderBottom: '1px solid var(--gray-3)', textAlign: 'center' }}>
                        {f.alwaysRequired ? 'Always' : 'Optional'}
                      </td>
                      <td style={{ padding: '4px 10px', borderBottom: '1px solid var(--gray-3)', fontSize: 12 }}>
                        {f.incomplete
                          ? <Text size="1" color="yellow">Incomplete — needs org</Text>
                          : <Text size="1" color="green">Complete{f.itemCount !== undefined ? ` (${f.itemCount})` : ''}</Text>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>

            {manifestResult.summary.warnings.length > 0 && (
              <Box p="2" style={{ background: 'var(--yellow-3)', borderRadius: 'var(--radius-2)' }}>
                <Text size="1" color="yellow" weight="bold">Warnings:</Text>
                {manifestResult.summary.warnings.map((w, i) => (
                  <Text key={i} size="1" color="yellow" style={{ display: 'block' }}>{w}</Text>
                ))}
              </Box>
            )}

            <Flex gap="2">
              <Button variant="soft" size="1" onClick={() => window.api.openFolder(manifestResult.manifestDir)}>
                Open folder
              </Button>
              <Button variant="soft" size="1" onClick={copyManifestPath}>
                {manifestCopied ? 'Copied!' : 'Copy manifest path'}
              </Button>
            </Flex>
          </Flex>
        </Box>
      )}

      {manifestState === 'error' && (
        <Box p="3" style={{ background: 'var(--red-3)', borderRadius: 'var(--radius-2)' }}>
          <Text color="red" size="2">Manifest generation failed: {manifestError}</Text>
        </Box>
      )}

      <Flex gap="3" wrap="wrap">
        <Button variant="soft" onClick={() => window.api.openLogFile()}>
          Open Log File
        </Button>
        {exportFilePath && (
          <Button variant="soft" onClick={() => window.api.showInFinder(exportFilePath)}>
            {finderLabel}
          </Button>
        )}
        {summary.failedRecords.length > 0 && (
          <Button variant="soft" color="red" onClick={handleExportErrors}>
            Export Error Report
          </Button>
        )}
        <Button
          variant="soft"
          disabled={manifestState === 'generating' || !bundleExport}
          title={!bundleExport
            ? 'No bundle data available'
            : !hasProvisioningData
              ? "Re-extract with 'Include state provisioning data' for complete manifest — offline mode will generate what it can"
              : undefined}
          onClick={handleGenerateManifest}
        >
          {manifestState === 'generating' ? 'Generating manifest...' : 'Generate Manifest'}
        </Button>
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
