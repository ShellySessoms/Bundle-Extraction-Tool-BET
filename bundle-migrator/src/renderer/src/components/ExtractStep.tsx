import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Flex, Heading, Text, Button, TextField, Checkbox } from '@radix-ui/themes'
import { Virtuoso } from 'react-virtuoso'
import type { BundleListItem, BundleExport, ProgressEvent } from '../../../shared/types'

const BASE_PROGRESS_EVENTS = 25
const PROVISIONING_EXTRA_EVENTS = 2
const DEFAULT_OUTPUT_DIR = '~/Documents/bundle-migrator/'

interface LogEntry {
  timestamp: string
  object: string
  count: number
  status: 'success' | 'error' | 'partial'
  message?: string
}

type BundleStatus = 'pending' | 'extracting' | 'done' | 'failed'

interface BundleProgress {
  name: string
  status: BundleStatus
  filePath?: string
}

interface Props {
  bundles: BundleListItem[]
  onNext: (exports: BundleExport[]) => void
  onBack: () => void
}

export default function ExtractStep({ bundles, onNext, onBack }: Props): React.ReactElement {
  const isMulti = bundles.length > 1
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completed, setCompleted] = useState(0)
  const [currentObject, setCurrentObject] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [totalRecords, setTotalRecords] = useState(0)
  const [outputDir, setOutputDir] = useState(DEFAULT_OUTPUT_DIR)
  const [includeProvisioning, setIncludeProvisioning] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [perBundleStatus, setPerBundleStatus] = useState<BundleProgress[]>(
    bundles.map((b) => ({ name: b.name, status: 'pending' }))
  )
  const extractedRef = useRef<BundleExport[]>([])
  const startedRef = useRef(false)

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

  const expectedEvents = bundles.length * (
    includeProvisioning ? BASE_PROGRESS_EVENTS + PROVISIONING_EXTRA_EVENTS : BASE_PROGRESS_EVENTS
  )

  const updateBundleStatus = (index: number, status: BundleStatus, filePath?: string): void => {
    setPerBundleStatus((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], status, filePath }
      return next
    })
  }

  const startExtraction = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    setExtracting(true)
    setError('')

    const dir = outputDir === DEFAULT_OUTPUT_DIR ? undefined : outputDir
    const results: BundleExport[] = []

    for (let i = 0; i < bundles.length; i++) {
      setCurrentIndex(i)
      updateBundleStatus(i, 'extracting')

      if (isMulti) {
        setLogs((prev) => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          object: `── ${i + 1}/${bundles.length}: ${bundles[i].name} ──`,
          count: 0,
          status: 'success'
        }])
      }

      try {
        const result = await window.api.extractBundle({
          bundleId: bundles[i].id,
          outputDirectory: dir,
          includeProvisioningData: includeProvisioning
        })
        results.push(result)
        updateBundleStatus(i, 'done', result.exportFilePath)
      } catch (err) {
        updateBundleStatus(i, 'failed')
        const msg = err instanceof Error ? err.message : String(err)
        setLogs((prev) => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          object: bundles[i].name,
          count: 0,
          status: 'error',
          message: msg
        }])
        if (!isMulti) {
          setExtracting(false)
          startedRef.current = false
          setError(msg)
          return
        }
      }
    }

    extractedRef.current = results
    setCompleted(expectedEvents)
    setDone(true)
  }, [bundles, outputDir, includeProvisioning, expectedEvents, isMulti])

  const browseDirectory = async (): Promise<void> => {
    const dir = await window.api.selectDirectory()
    if (dir) setOutputDir(dir)
  }

  const progress = Math.min(100, Math.round((completed / expectedEvents) * 100))
  const hasErrors = logs.some((l) => l.status === 'error')
  const successCount = perBundleStatus.filter((s) => s.status === 'done').length
  const failCount = perBundleStatus.filter((s) => s.status === 'failed').length

  return (
    <Flex direction="column" gap="4">
      <Heading size="5">
        {isMulti ? `Extracting ${bundles.length} Bundles` : 'Extracting Bundle'}
      </Heading>

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

      {/* Provisioning data checkbox */}
      <Box>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: extracting || done ? 'default' : 'pointer' }}>
          <Checkbox
            checked={includeProvisioning}
            onCheckedChange={(checked) => setIncludeProvisioning(checked === true)}
            disabled={extracting || done}
            style={{ marginTop: 2 }}
          />
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">Include state provisioning data</Text>
            <Text size="1" color="gray">
              Extracts feature flags, feature processes, and custom field requirements needed for scratch org or QA org provisioning.
            </Text>
          </Flex>
        </label>
      </Box>

      {/* Multi-bundle status list */}
      {isMulti && extracting && (
        <Box p="3" style={{ border: '1px solid var(--gray-4)', borderRadius: 'var(--radius-2)' }}>
          <Flex direction="column" gap="1">
            {perBundleStatus.map((item, i) => (
              <Text key={i} size="2" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {item.status === 'pending' && '○ '}
                {item.status === 'extracting' && '⟳ '}
                {item.status === 'done' && '✓ '}
                {item.status === 'failed' && '✗ '}
                <span style={{
                  fontWeight: item.status === 'extracting' ? 600 : 400,
                  color: item.status === 'failed' ? 'var(--red-11)' : item.status === 'done' ? 'var(--green-11)' : undefined
                }}>
                  {item.name}
                </span>
                {item.status === 'extracting' && ' (extracting...)'}
                {item.status === 'failed' && ' (failed)'}
              </Text>
            ))}
          </Flex>
        </Box>
      )}

      {/* Progress bar */}
      <Box>
        <Flex justify="between" mb="1">
          <Text size="2" weight="medium">
            {done
              ? isMulti ? `Extraction complete — ${successCount} of ${bundles.length} succeeded` : 'Extraction complete'
              : extracting
                ? isMulti
                  ? `Extracting ${currentIndex + 1}/${bundles.length}: ${currentObject}`
                  : `Extracting ${currentObject}...`
                : 'Ready to extract'}
          </Text>
          <Text size="2" color="gray">{extracting || done ? `${progress}%` : ''}</Text>
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
          <Flex align="center" justify="between">
            <Text color="green" size="2" weight="medium">
              {isMulti
                ? `${successCount} template${successCount !== 1 ? 's' : ''} extracted — ${totalRecords.toLocaleString()} total records`
                : `Extraction complete — ${totalRecords.toLocaleString()} total records`}
              {failCount > 0 && ` (${failCount} failed)`}
            </Text>
            {outputDir !== DEFAULT_OUTPUT_DIR && (
              <Button variant="ghost" size="1" onClick={() => window.api.openFolder(outputDir)}>
                Show in Finder
              </Button>
            )}
          </Flex>
        </Box>
      )}

      <Flex gap="3">
        <Button variant="soft" onClick={onBack} disabled={extracting && !done && !error}>
          &larr; Back
        </Button>
        {error && !done && (
          <Button variant="soft" color="red" onClick={() => { startedRef.current = false; startExtraction() }}>
            Retry
          </Button>
        )}
        {done && extractedRef.current.length > 0 && (
          <Button onClick={() => onNext(extractedRef.current)}>
            Next &rarr;
          </Button>
        )}
      </Flex>
    </Flex>
  )
}
