import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Flex, Heading, Text, Button, TextField } from '@radix-ui/themes'
import { Virtuoso } from 'react-virtuoso'
import type { BundleExport, ProgressEvent } from '../../../shared/types'

const EXPECTED_PROGRESS_EVENTS = 25
const DEFAULT_OUTPUT_DIR = '~/Documents/bundle-migrator/'

interface LogEntry {
  timestamp: string
  object: string
  count: number
  status: 'success' | 'error' | 'partial'
  message?: string
}

interface Props {
  bundleId: string
  existingExport: BundleExport | null
  onNext: (bundleExport: BundleExport) => void
  onBack: () => void
}

export default function ExtractStep({ bundleId, existingExport, onNext, onBack }: Props): React.ReactElement {
  const alreadyDone = existingExport !== null
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [completed, setCompleted] = useState(alreadyDone ? EXPECTED_PROGRESS_EVENTS : 0)
  const [currentObject, setCurrentObject] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(alreadyDone)
  const [totalRecords, setTotalRecords] = useState(0)
  const [outputDir, setOutputDir] = useState(DEFAULT_OUTPUT_DIR)
  const [extracting, setExtracting] = useState(alreadyDone)
  const exportRef = useRef<BundleExport | null>(existingExport)
  const startedRef = useRef(alreadyDone)

  const handleProgress = useCallback((event: ProgressEvent) => {
    if (event.stage !== 'extract') return
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      object: event.object ?? '',
      count: event.count ?? 0,
      status: event.status,
      message: event.message
    }
    setLogs((prev) => [...prev, entry])
    setCurrentObject(event.object ?? '')
    if (event.status === 'success') {
      setCompleted((prev) => prev + 1)
      setTotalRecords((prev) => prev + (event.count ?? 0))
    }
  }, [])

  useEffect(() => {
    window.api.onProgress(handleProgress)
    return () => {
      window.api.removeAllListeners('progress')
    }
  }, [handleProgress])

  const startExtraction = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    setExtracting(true)
    setError('')
    const dir = outputDir === DEFAULT_OUTPUT_DIR ? undefined : outputDir
    window.api
      .extractBundle(bundleId, dir)
      .then((result) => {
        exportRef.current = result
        setCompleted(EXPECTED_PROGRESS_EVENTS)
        setDone(true)
      })
      .catch((err) => {
        setExtracting(false)
        startedRef.current = false
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [bundleId, outputDir])

  const browseDirectory = async (): Promise<void> => {
    const dir = await window.api.selectDirectory()
    if (dir) setOutputDir(dir)
  }

  const progress = Math.min(100, Math.round((completed / EXPECTED_PROGRESS_EVENTS) * 100))
  const hasErrors = logs.some((l) => l.status === 'error')

  return (
    <Flex direction="column" gap="4">
      <Heading size="5">Extracting Bundle</Heading>

      {/* Save location */}
      <Flex gap="2" align="end">
        <Box flexGrow="1">
          <Text size="1" weight="medium" mb="1" style={{ display: 'block' }}>Save Location</Text>
          <TextField.Root
            size="2"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            disabled={extracting || done}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </Box>
        <Button variant="soft" size="2" onClick={browseDirectory} disabled={extracting || done}>
          Browse...
        </Button>
        {!extracting && !done && (
          <Button size="2" onClick={startExtraction}>
            Start Extraction
          </Button>
        )}
      </Flex>

      {/* Progress bar */}
      <Box>
        <Flex justify="between" mb="1">
          <Text size="2" weight="medium">
            {done ? 'Extraction complete' : `Extracting ${currentObject}...`}
          </Text>
          <Text size="2" color="gray">{progress}%</Text>
        </Flex>
        <Box style={{ height: 8, background: 'var(--gray-4)', borderRadius: 4, overflow: 'hidden' }}>
          <Box
            style={{
              height: '100%',
              width: `${progress}%`,
              background: hasErrors ? 'var(--red-9)' : 'var(--blue-9)',
              transition: 'width 0.3s ease'
            }}
          />
        </Box>
      </Box>

      {error && (
        <Box p="3" style={{ background: 'var(--red-3)', borderRadius: 'var(--radius-2)' }}>
          <Text color="red" size="2">{error}</Text>
        </Box>
      )}

      {/* Virtualized log */}
      <Box style={{
        height: 340,
        border: '1px solid var(--gray-5)',
        borderRadius: 'var(--radius-2)',
        background: 'var(--gray-1)'
      }}>
        <Virtuoso
          data={logs}
          followOutput="smooth"
          itemContent={(_index, entry) => (
            <Box px="3" py="1" style={{
              fontFamily: 'monospace',
              fontSize: 12,
              borderBottom: '1px solid var(--gray-3)',
              color: entry.status === 'error' ? 'var(--red-11)' : 'var(--gray-12)'
            }}>
              <Text size="1">
                [{entry.timestamp}]{' '}
                {entry.status === 'success' ? 'OK ' : 'ERR '}
                {entry.object} — {entry.count} records
                {entry.message ? ` — ${entry.message}` : ''}
              </Text>
            </Box>
          )}
        />
      </Box>

      {done && (
        <Box p="3" style={{ background: 'var(--green-3)', borderRadius: 'var(--radius-2)' }}>
          <Text color="green" size="2" weight="medium">
            Extraction complete — {totalRecords.toLocaleString()} total records
          </Text>
        </Box>
      )}

      <Flex gap="3">
        <Button variant="soft" onClick={onBack} disabled={extracting && !done && !error}>
          &larr; Back
        </Button>
        {error && !done && (
          <Button variant="soft" color="red" onClick={startExtraction}>
            Retry
          </Button>
        )}
        {done && exportRef.current && (
          <Button onClick={() => onNext(exportRef.current!)}>
            Next &rarr;
          </Button>
        )}
      </Flex>
    </Flex>
  )
}
