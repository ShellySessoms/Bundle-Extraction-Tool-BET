import React, { useState } from 'react'
import { Box, Flex, Heading, Text, Button, TextArea, TextField, Select } from '@radix-ui/themes'
import type { BundleExport, JiraTicketContext } from '../../../shared/types'

const AFFECTED_AREAS = [
  'Any',
  'Income Statement',
  'Balance Sheet',
  'Cash Flow',
  'Ratios',
  'Debt Schedule',
  'Schedules',
  'Projections'
]

interface Props {
  onAnalyze: (
    bundle: BundleExport,
    pdiDescription: string,
    affectedArea: string,
    errorMessage: string,
    jiraTicket: JiraTicketContext | null
  ) => void
  onBack: () => void
}

export default function PDIInsightStep({ onAnalyze, onBack }: Props): React.ReactElement {
  const [bundle, setBundle] = useState<BundleExport | null>(null)
  const [filePath, setFilePath] = useState('')
  const [loadError, setLoadError] = useState('')
  const [pdiDescription, setPdiDescription] = useState('')
  const [affectedArea, setAffectedArea] = useState('Any')
  const [errorMessage, setErrorMessage] = useState('')
  const [jiraUrl, setJiraUrl] = useState('')
  const [jiraTicket, setJiraTicket] = useState<JiraTicketContext | null>(null)
  const [fetchingJira, setFetchingJira] = useState(false)
  const [jiraError, setJiraError] = useState<string | null>(null)

  const handleBrowse = async (): Promise<void> => {
    try {
      const path = await window.api.selectBundleFile()
      if (!path) return
      const data = await window.api.readBundleFile(path)
      setBundle(data)
      setFilePath(path)
      setLoadError('')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleFetchJira = async (): Promise<void> => {
    if (!jiraUrl.trim()) return
    setFetchingJira(true)
    setJiraError(null)
    try {
      const ticket = await window.api.fetchJiraTicket(jiraUrl)
      setJiraTicket(ticket)
      if (!pdiDescription.trim()) {
        setPdiDescription(ticket.summary)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('JIRA_NOT_CONFIGURED')) {
        setJiraError('Jira not configured. Add your Atlassian credentials in the credentials screen.')
      } else if (msg.includes('JIRA_AUTH_FAILED')) {
        setJiraError('Invalid Jira credentials. Check your email and API token in credentials.')
      } else if (msg.includes('JIRA_NOT_FOUND')) {
        setJiraError('Ticket not found. Check the URL or ticket key.')
      } else {
        setJiraError(msg)
      }
    } finally {
      setFetchingJira(false)
    }
  }

  const canAnalyze = bundle && (pdiDescription.trim().length >= 10 || jiraTicket)

  const recordCount = bundle
    ? Object.values(bundle.records).reduce((sum, arr) => sum + arr.length, 0)
    : 0
  const objectCount = bundle ? Object.keys(bundle.records).length : 0

  return (
    <Flex direction="column" gap="4">
      <Heading size="5">PDI Insight</Heading>
      <Text size="2" color="gray">
        Load a template and describe the issue. AI will analyze whether it might be template-related.
      </Text>

      {/* File picker */}
      <Box p="4" style={{ border: '1px solid var(--gray-5)', borderRadius: 'var(--radius-3)' }}>
        <Heading size="3" mb="2">Template</Heading>
        {!bundle ? (
          <Flex direction="column" gap="2" align="center" py="3">
            <Text size="2" color="gray">Select a bundle export JSON file</Text>
            <Button variant="soft" onClick={handleBrowse}>Browse...</Button>
          </Flex>
        ) : (
          <Flex direction="column" gap="2">
            <Flex justify="between" align="center">
              <Text size="3" weight="bold">{bundle.bundleName}</Text>
              <Button variant="ghost" size="1" onClick={handleBrowse}>Change File...</Button>
            </Flex>
            <Flex gap="4">
              <Text size="1" color="gray">Objects: {objectCount}</Text>
              <Text size="1" color="gray">Records: {recordCount.toLocaleString()}</Text>
              <Text size="1" color="gray">
                Extracted: {new Date(bundle.extractedAt).toLocaleDateString()}
              </Text>
            </Flex>
            <Text size="1" color="gray" style={{ fontFamily: 'monospace' }}>
              {filePath.split('/').pop()}
            </Text>
          </Flex>
        )}
        {loadError && (
          <Text size="2" color="red" mt="2">{loadError}</Text>
        )}
      </Box>

      {/* Jira Ticket */}
      <Box>
        <Text size="2" weight="medium" mb="1" as="label" style={{ display: 'block' }}>
          Jira Ticket (optional)
        </Text>
        <Flex gap="2" align="end">
          <Box style={{ flex: 1 }}>
            <TextField.Root
              size="2"
              placeholder="https://ncinodev.atlassian.net/browse/COMM-67578 or COMM-67578"
              value={jiraUrl}
              onChange={(e) => setJiraUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleFetchJira() }}
            />
          </Box>
          <Button
            variant="soft"
            onClick={handleFetchJira}
            disabled={!jiraUrl.trim() || fetchingJira}
          >
            {fetchingJira ? 'Fetching...' : 'Fetch Ticket'}
          </Button>
        </Flex>

        {jiraTicket && (
          <Box mt="2" p="3" style={{
            background: 'var(--blue-2)',
            border: '1px solid var(--blue-6)',
            borderRadius: 'var(--radius-2)'
          }}>
            <Flex justify="between" align="start">
              <Box>
                <Flex align="center" gap="2">
                  <Text size="2" weight="bold" color="blue">{jiraTicket.key}</Text>
                  <Text size="2">{jiraTicket.summary}</Text>
                </Flex>
                <Flex gap="2" mt="1">
                  <Text size="1" color="gray">Status: {jiraTicket.status}</Text>
                  <Text size="1" color="gray">Priority: {jiraTicket.priority}</Text>
                  {jiraTicket.components.length > 0 && (
                    <Text size="1" color="gray">Components: {jiraTicket.components.join(', ')}</Text>
                  )}
                </Flex>
              </Box>
              <Button variant="ghost" size="1" onClick={() => setJiraTicket(null)}>
                Remove
              </Button>
            </Flex>
            <Text size="1" color="green" mt="1">
              Ticket details will be included in AI analysis
            </Text>
          </Box>
        )}

        {jiraError && (
          <Text size="1" color="red" mt="1">{jiraError}</Text>
        )}
      </Box>

      {/* Affected area and error message */}
      <Flex gap="4" wrap="wrap">
        <Box style={{ flex: '1 1 200px' }}>
          <Text size="2" weight="medium" mb="1" as="label" style={{ display: 'block' }}>
            Affected area (optional)
          </Text>
          <Select.Root value={affectedArea} onValueChange={setAffectedArea}>
            <Select.Trigger style={{ width: '100%' }} />
            <Select.Content>
              {AFFECTED_AREAS.map((area) => (
                <Select.Item key={area} value={area}>{area}</Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Box>

        <Box style={{ flex: '2 1 300px' }}>
          <Text size="2" weight="medium" mb="1" as="label" style={{ display: 'block' }}>
            Error message (optional)
          </Text>
          <TextField.Root
            size="2"
            placeholder="Paste any Salesforce error message here..."
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
          />
        </Box>
      </Flex>

      {/* PDI Description */}
      <Box>
        <Text size="2" weight="medium" mb="1" as="label" style={{ display: 'block' }}>
          {jiraTicket
            ? 'Additional context (optional — Jira ticket loaded)'
            : 'Describe the PDI or issue being reported'}
        </Text>
        <TextArea
          size="3"
          rows={5}
          placeholder="e.g. When creating a spread with this template, the Cash Flow statement shows incorrect totals. The EBITDA row appears to be calculating from the wrong source rows..."
          value={pdiDescription}
          onChange={(e) => setPdiDescription(e.target.value)}
        />
        {!jiraTicket && pdiDescription.length > 0 && pdiDescription.trim().length < 10 && (
          <Text size="1" color="red" mt="1">Please provide at least 10 characters</Text>
        )}
      </Box>

      {/* Actions */}
      <Flex gap="3">
        <Button variant="soft" onClick={onBack}>&larr; Back</Button>
        <Button
          disabled={!canAnalyze}
          onClick={() => {
            if (bundle) onAnalyze(bundle, pdiDescription, affectedArea, errorMessage, jiraTicket)
          }}
        >
          Analyze with AI &rarr;
        </Button>
      </Flex>
    </Flex>
  )
}
