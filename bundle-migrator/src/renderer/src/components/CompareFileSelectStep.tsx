import React, { useState } from 'react'
import { Box, Flex, Heading, Text, Button } from '@radix-ui/themes'
import type { BundleExport } from '../../../shared/types'

interface FileSummary {
  path: string
  bundleName: string
  extractedAt: string
  objectCount: number
  totalRecords: number
}

interface Props {
  onNext: (filePathA: string, filePathB: string) => void
  onBack: () => void
}

function parseBundleFile(data: BundleExport, path: string): FileSummary {
  const totalRecords = Object.values(data.records).reduce((sum, recs) => sum + recs.length, 0)
  return {
    path,
    bundleName: data.bundleName,
    extractedAt: data.extractedAt,
    objectCount: Object.keys(data.records).length,
    totalRecords
  }
}

function FileSummaryCard({ label, summary }: { label: string; summary: FileSummary | null }): React.ReactElement {
  if (!summary) return <React.Fragment />
  return (
    <Box p="3" style={{ background: 'var(--gray-2)', borderRadius: 'var(--radius-2)' }}>
      <Text size="1" weight="bold" style={{ display: 'block', marginBottom: 4 }}>{label}</Text>
      <Text size="2" style={{ display: 'block' }}><strong>Name:</strong> {summary.bundleName}</Text>
      <Text size="2" style={{ display: 'block' }}><strong>Extracted:</strong> {new Date(summary.extractedAt).toLocaleString()}</Text>
      <Text size="2" style={{ display: 'block' }}><strong>Objects:</strong> {summary.objectCount} | <strong>Records:</strong> {summary.totalRecords.toLocaleString()}</Text>
    </Box>
  )
}

export default function CompareFileSelectStep({ onNext, onBack }: Props): React.ReactElement {
  const [fileA, setFileA] = useState<FileSummary | null>(null)
  const [fileB, setFileB] = useState<FileSummary | null>(null)
  const [errorA, setErrorA] = useState('')
  const [errorB, setErrorB] = useState('')

  const loadFileFromPath = async (side: 'a' | 'b', path: string): Promise<void> => {
    const setFile = side === 'a' ? setFileA : setFileB
    const setError = side === 'a' ? setErrorA : setErrorB
    setError('')

    try {
      const data = await window.api.readBundleFile(path)
      setFile(parseBundleFile(data, path))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setFile(null)
    }
  }

  const loadFile = async (side: 'a' | 'b'): Promise<void> => {
    const path = await window.api.selectBundleFile()
    if (!path) return
    await loadFileFromPath(side, path)
  }

  const handleDrop = (e: React.DragEvent, side: 'a' | 'b'): void => {
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!file.name.endsWith('.json')) {
      const setError = side === 'a' ? setErrorA : setErrorB
      setError('Please drop a .json bundle export file.')
      return
    }
    loadFileFromPath(side, file.path)
  }

  return (
    <Flex direction="column" gap="5">
      <Heading size="5">Select Bundles to Compare</Heading>
      <Text size="2" color="gray">
        Pick two bundle export JSON files. We'll show what's different between them.
      </Text>

      <Flex gap="4" align="start">
        <Box flexGrow="1" p="4" style={{ border: '1px solid var(--gray-6)', borderRadius: 'var(--radius-3)' }}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--blue-8)' }}
          onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--gray-6)' }}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--gray-6)'; handleDrop(e, 'a') }}
        >
          <Flex direction="column" gap="3">
            <Heading size="4">Your Template (A)</Heading>
            <Button size="2" onClick={() => loadFile('a')}>
              {fileA ? 'Change File...' : 'Browse...'}
            </Button>
            <Text size="1" color="gray" style={{ textAlign: 'center' }}>or drag a .json file here</Text>
            {errorA && <Text size="1" color="red">{errorA}</Text>}
            {fileA && (
              <>
                <Text size="1" color="gray" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{fileA.path}</Text>
                <FileSummaryCard label="Bundle A" summary={fileA} />
              </>
            )}
          </Flex>
        </Box>

        {(fileA || fileB) && (
          <Flex direction="column" justify="center" style={{ alignSelf: 'center' }}>
            <Button
              variant="ghost"
              size="1"
              onClick={() => { setFileA(fileB); setFileB(fileA); setErrorA(''); setErrorB('') }}
              title="Swap files A and B"
              style={{ fontSize: 18, padding: '4px 8px' }}
            >
              &#8644;
            </Button>
          </Flex>
        )}

        <Box flexGrow="1" p="4" style={{ border: '1px solid var(--gray-6)', borderRadius: 'var(--radius-3)' }}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--orange-8)' }}
          onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--gray-6)' }}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--gray-6)'; handleDrop(e, 'b') }}
        >
          <Flex direction="column" gap="3">
            <Heading size="4">Customer/Client Template (B)</Heading>
            <Button size="2" onClick={() => loadFile('b')}>
              {fileB ? 'Change File...' : 'Browse...'}
            </Button>
            <Text size="1" color="gray" style={{ textAlign: 'center' }}>or drag a .json file here</Text>
            {errorB && <Text size="1" color="red">{errorB}</Text>}
            {fileB && (
              <>
                <Text size="1" color="gray" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{fileB.path}</Text>
                <FileSummaryCard label="Bundle B" summary={fileB} />
              </>
            )}
          </Flex>
        </Box>
      </Flex>

      {fileA && fileB && (
        <Text size="2" color="gray" style={{ textAlign: 'center' }}>
          We'll show what B has that A doesn't, and vice versa.
        </Text>
      )}

      <Flex gap="3">
        <Button variant="soft" onClick={onBack}>&larr; Back</Button>
        <Button
          onClick={() => { if (fileA && fileB) onNext(fileA.path, fileB.path) }}
          disabled={!fileA || !fileB}
        >
          Compare &rarr;
        </Button>
      </Flex>
    </Flex>
  )
}
