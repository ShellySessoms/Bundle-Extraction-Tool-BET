import React, { useState } from 'react'
import { Box, Flex, Heading, Text, Button } from '@radix-ui/themes'
import type { BundleExport } from '../../../shared/types'

interface Props {
  preloadedPath?: string
  onNext: (bundleExport: BundleExport, filePath: string) => void
  onBack: () => void
}

export default function FileSelectStep({ preloadedPath, onNext, onBack }: Props): React.ReactElement {
  const [filePath, setFilePath] = useState(preloadedPath ?? '')
  const [bundleExport, setBundleExport] = useState<BundleExport | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const selectAndLoad = React.useCallback(async (path?: string): Promise<void> => {
    const targetPath = path ?? (await window.api.selectBundleFile())
    if (!targetPath) return

    setFilePath(targetPath)
    setLoading(true)
    setError('')
    setBundleExport(null)

    try {
      const data = await window.api.readBundleFile(targetPath)
      setBundleExport(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (preloadedPath) {
      selectAndLoad(preloadedPath)
    }
  }, [preloadedPath, selectAndLoad])

  const totalRecords = bundleExport
    ? Object.values(bundleExport.records).reduce((sum, recs) => sum + recs.length, 0)
    : 0

  return (
    <Flex direction="column" gap="5">
      <Heading size="5">Select Bundle File</Heading>
      <Text size="2" color="gray">
        Choose a previously exported bundle JSON file to upsert.
      </Text>

      <Flex gap="2" align="center">
        <Button onClick={() => selectAndLoad()} disabled={loading}>
          {filePath ? 'Choose Different File...' : 'Browse...'}
        </Button>
        {filePath && (
          <Text size="2" style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {filePath}
          </Text>
        )}
      </Flex>

      {loading && (
        <Text size="2" color="gray">Loading file...</Text>
      )}

      {error && (
        <Box p="3" style={{ background: 'var(--red-3)', borderRadius: 'var(--radius-2)' }}>
          <Text color="red" size="2">{error}</Text>
        </Box>
      )}

      {bundleExport && (
        <Box p="4" style={{ border: '1px solid var(--gray-5)', borderRadius: 'var(--radius-3)' }}>
          <Flex direction="column" gap="2">
            <Text size="2"><strong>Bundle Name:</strong> {bundleExport.bundleName}</Text>
            <Text size="2"><strong>Bundle ID:</strong> {bundleExport.bundleId}</Text>
            <Text size="2"><strong>Extracted At:</strong> {new Date(bundleExport.extractedAt).toLocaleString()}</Text>
            <Text size="2"><strong>Objects:</strong> {Object.keys(bundleExport.records).length}</Text>
            <Text size="2"><strong>Total Records:</strong> {totalRecords.toLocaleString()}</Text>
          </Flex>
        </Box>
      )}

      <Flex gap="3">
        <Button variant="soft" onClick={onBack}>&larr; Back</Button>
        <Button
          onClick={() => { if (bundleExport) onNext(bundleExport, filePath) }}
          disabled={!bundleExport}
        >
          Next &rarr;
        </Button>
      </Flex>
    </Flex>
  )
}
