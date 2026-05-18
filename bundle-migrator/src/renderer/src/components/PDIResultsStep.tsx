import React, { useState } from 'react'
import { Box, Flex, Heading, Text, Button, Badge } from '@radix-ui/themes'
import type { PDIAnalysisResult } from '../../../shared/types'

interface Props {
  result: PDIAnalysisResult
  pdiDescription: string
  jiraUrl: string
  onAnalyzeAnother: () => void
  onStartOver: () => void
}

type Verdict = 'likely' | 'possibly' | 'unlikely'

function parseVerdict(analysis: string): Verdict {
  const firstLines = analysis.slice(0, 200).toUpperCase()
  if (firstLines.includes('LIKELY NOT TEMPLATE RELATED')) return 'unlikely'
  if (firstLines.includes('POSSIBLY TEMPLATE RELATED')) return 'possibly'
  if (firstLines.includes('LIKELY TEMPLATE RELATED')) return 'likely'
  return 'possibly'
}

function VerdictBadge({ verdict }: { verdict: Verdict }): React.ReactElement {
  const config: Record<Verdict, { color: 'red' | 'yellow' | 'green'; label: string }> = {
    likely: { color: 'red', label: 'Likely Template Related' },
    possibly: { color: 'yellow', label: 'Possibly Template Related' },
    unlikely: { color: 'green', label: 'Likely Not Template Related' }
  }
  const { color, label } = config[verdict]
  return <Badge size="2" color={color}>{label}</Badge>
}

export default function PDIResultsStep({
  result,
  pdiDescription,
  jiraUrl,
  onAnalyzeAnother,
  onStartOver
}: Props): React.ReactElement {
  const [exportPath, setExportPath] = useState('')
  const [exportError, setExportError] = useState('')

  const verdict = parseVerdict(result.analysis)

  const handleExport = async (): Promise<void> => {
    try {
      const path = await window.api.exportPDIAnalysis(
        result,
        pdiDescription,
        jiraUrl || undefined
      )
      setExportPath(path)
      setExportError('')
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err))
    }
  }

  const analysisWithoutVerdict = result.analysis.replace(
    /^VERDICT:\s*(LIKELY NOT TEMPLATE RELATED|POSSIBLY TEMPLATE RELATED|LIKELY TEMPLATE RELATED)\s*\n*/i,
    ''
  )

  return (
    <Flex direction="column" gap="4">
      <Flex justify="between" align="center">
        <Heading size="5">PDI Analysis</Heading>
        <VerdictBadge verdict={verdict} />
      </Flex>

      <Box p="3" style={{ background: 'var(--gray-2)', borderRadius: 'var(--radius-2)' }}>
        <Text size="1" weight="bold" color="gray" style={{ display: 'block', marginBottom: 4 }}>
          Template
        </Text>
        <Text size="2" weight="bold">{result.templateName}</Text>
        <Text size="1" color="gray" ml="2">
          Analyzed {new Date(result.analyzedAt).toLocaleString()}
        </Text>
      </Box>

      {jiraUrl && (
        <Flex align="center" gap="2">
          <Text size="2" weight="bold" color="blue">Jira:</Text>
          <Text size="2">{jiraUrl}</Text>
        </Flex>
      )}

      <Box p="4" style={{
        border: '1px solid var(--purple-6)',
        borderRadius: 'var(--radius-3)',
        background: 'var(--purple-2)'
      }}>
        <Flex align="center" gap="2" mb="3">
          <Text size="2" weight="bold" color="purple">AI Analysis</Text>
        </Flex>

        <Box style={{ fontSize: 13, lineHeight: 1.6 }}>
          {analysisWithoutVerdict.split('\n').map((line, i) =>
            line.trim() === ''
              ? <br key={i} />
              : <Text key={i} as="p" size="2" mb="2">{line}</Text>
          )}
        </Box>

        <Flex gap="2" mt="3">
          <Button
            variant="ghost"
            size="1"
            onClick={() => navigator.clipboard.writeText(result.analysis)}
          >
            Copy Analysis
          </Button>
        </Flex>

        <Text size="1" color="gray" mt="2">
          AI analysis is advisory only. Always verify findings in Salesforce.
        </Text>
      </Box>

      {exportPath && (
        <Box p="3" style={{ background: 'var(--green-3)', borderRadius: 'var(--radius-2)' }}>
          <Text size="2" color="green">
            Exported to: <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{exportPath}</span>
          </Text>
        </Box>
      )}

      {exportError && (
        <Box p="3" style={{ background: 'var(--red-2)', borderRadius: 'var(--radius-2)' }}>
          <Text size="2" color="red">Export failed: {exportError}</Text>
        </Box>
      )}

      <Flex gap="3">
        <Button variant="soft" onClick={onAnalyzeAnother}>&larr; Analyze Another PDI</Button>
        <Button variant="soft" onClick={handleExport}>Export Analysis</Button>
        <Button onClick={onStartOver}>Start Over</Button>
      </Flex>
    </Flex>
  )
}
