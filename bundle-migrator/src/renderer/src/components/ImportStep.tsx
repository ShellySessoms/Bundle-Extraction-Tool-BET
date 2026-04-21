import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Flex, Heading, Text, Button } from '@radix-ui/themes'
import { Virtuoso } from 'react-virtuoso'
import type { ImportSummary, ProgressEvent } from '../../../shared/types'

interface LogEntry {
  timestamp: string
  stage: string
  object: string
  phase: string
  total: number
  succeeded: number
  failed: number
  status: 'success' | 'error' | 'partial'
  message?: string
}

interface Props {
  exportFilePath: string
  onNext: (summary: ImportSummary) => void
  onBack: () => void
}

const PHASE_LABELS: Record<string, string> = {
  resolve: 'Resolving references',
  import: 'Inserting records',
  backfill: 'Backfilling circular references',
  complete: 'Complete'
}

export default function ImportStep({ exportFilePath, onNext, onBack }: Props): React.ReactElement {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [currentPhase, setCurrentPhase] = useState('resolve')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const summaryRef = useRef<ImportSummary | null>(null)

  const handleProgress = useCallback((event: ProgressEvent) => {
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      stage: event.stage,
      object: event.object ?? '',
      phase: event.phase ?? '',
      total: event.total ?? event.count ?? 0,
      succeeded: event.succeeded ?? event.count ?? 0,
      failed: event.failed ?? 0,
      status: event.status,
      message: event.message
    }
    setLogs((prev) => [...prev, entry])
    setCurrentPhase(event.stage)

    if (event.stage === 'complete') {
      setDone(true)
    }
  }, [])

  useEffect(() => {
    window.api.onProgress(handleProgress)

    window.api
      .importBundle(exportFilePath)
      .then((result) => {
        summaryRef.current = result
        setDone(true)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      window.api.removeAllListeners('progress')
    }
  }, [exportFilePath, handleProgress])

  const phases = ['resolve', 'import', 'backfill', 'complete']
  const phaseIndex = phases.indexOf(currentPhase)
  const progress = done ? 100 : Math.round(((phaseIndex + 1) / phases.length) * 100)
  const hasErrors = logs.some((l) => l.status === 'error')
  const hasPartial = logs.some((l) => l.status === 'partial')

  return (
    <Flex direction="column" gap="4">
      <Heading size="5">Importing Bundle</Heading>

      {/* Phase label */}
      <Box>
        <Flex justify="between" mb="1">
          <Text size="2" weight="medium">
            {PHASE_LABELS[currentPhase] ?? currentPhase}
          </Text>
          <Text size="2" color="gray">{progress}%</Text>
        </Flex>
        <Box style={{ height: 8, background: 'var(--gray-4)', borderRadius: 4, overflow: 'hidden' }}>
          <Box
            style={{
              height: '100%',
              width: `${progress}%`,
              background: hasErrors ? 'var(--red-9)' : hasPartial ? 'var(--yellow-9)' : 'var(--blue-9)',
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
          itemContent={(_index, entry) => {
            let color = 'var(--gray-12)'
            if (entry.status === 'error') color = 'var(--red-11)'
            else if (entry.status === 'partial') color = 'var(--yellow-11)'

            return (
              <Box px="3" py="1" style={{
                fontFamily: 'monospace',
                fontSize: 12,
                borderBottom: '1px solid var(--gray-3)',
                color
              }}>
                <Text size="1">
                  [{entry.timestamp}] [{entry.stage}]{' '}
                  {entry.object || entry.phase}
                  {entry.total > 0 && ` — ${entry.succeeded}/${entry.total}`}
                  {entry.failed > 0 && ` (${entry.failed} failed)`}
                  {entry.message ? ` — ${entry.message}` : ''}
                </Text>
              </Box>
            )
          }}
        />
      </Box>

      {done && !error && (
        <Box p="3" style={{ background: 'var(--green-3)', borderRadius: 'var(--radius-2)' }}>
          <Text color="green" size="2" weight="medium">
            Import complete
          </Text>
        </Box>
      )}

      <Flex gap="3">
        <Button variant="soft" onClick={onBack} disabled={!done && !error}>
          &larr; Back
        </Button>
        {done && summaryRef.current && (
          <Button onClick={() => onNext(summaryRef.current!)}>
            Next &rarr;
          </Button>
        )}
      </Flex>
    </Flex>
  )
}
