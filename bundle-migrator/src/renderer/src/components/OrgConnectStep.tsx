import React, { useState } from 'react'
import { Box, Flex, Heading, Text, Button, Badge, TextField, IconButton } from '@radix-ui/themes'
import type { AppMode, OrgStatus, OrgCredentials, AllCredentials } from '../../../shared/types'

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

const EMPTY_CREDS: OrgCredentials = {
  username: '',
  password: '',
  token: '',
  loginUrl: 'https://login.salesforce.com'
}

interface Props {
  mode: AppMode
  sourceOrg: OrgStatus | null
  targetOrg: OrgStatus | null
  initialSourceCreds: OrgCredentials
  initialTargetCreds: OrgCredentials
  onSourceConnected: (status: OrgStatus) => void
  onTargetConnected: (status: OrgStatus) => void
  onCredsSaved: (creds: AllCredentials) => void
  onNext: () => void
  onBack: () => void
}

function CredentialField({
  label,
  value,
  onChange,
  isSecret
}: {
  label: string
  value: string
  onChange: (v: string) => void
  isSecret?: boolean
}): React.ReactElement {
  const [visible, setVisible] = useState(false)

  return (
    <Flex direction="column" gap="1">
      <Text size="1" weight="medium">{label}</Text>
      <Flex gap="1" align="center">
        <Box flexGrow="1">
          <TextField.Root
            size="1"
            type={isSecret && !visible ? 'password' : 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </Box>
        {isSecret && (
          <IconButton
            size="1"
            variant="ghost"
            onClick={() => setVisible(!visible)}
            style={{ cursor: 'pointer', fontSize: 12, minWidth: 24 }}
          >
            {visible ? '◉' : '○'}
          </IconButton>
        )}
      </Flex>
    </Flex>
  )
}

function OrgPanel({
  title,
  creds,
  onChange,
  status,
  orgInfo,
  onConnect,
  errorMessage,
  optional
}: {
  title: string
  creds: OrgCredentials
  onChange: (c: OrgCredentials) => void
  status: ConnectionStatus
  orgInfo: OrgStatus | null
  onConnect?: () => void
  errorMessage?: string
  optional?: boolean
}): React.ReactElement {
  const statusBadge = (): React.ReactElement => {
    switch (status) {
      case 'idle':
        return <Badge color="gray">{optional ? 'Optional' : 'Idle'}</Badge>
      case 'connecting':
        return <Badge color="yellow">Connecting...</Badge>
      case 'connected':
        return <Badge color="green">Connected</Badge>
      case 'error':
        return <Badge color="red">Failed</Badge>
    }
  }

  return (
    <Box flexGrow="1" p="4" style={{ border: '1px solid var(--gray-6)', borderRadius: 'var(--radius-3)' }}>
      <Flex direction="column" gap="3">
        <Flex align="center" justify="between">
          <Heading size="4">{title}</Heading>
          {statusBadge()}
        </Flex>
        <CredentialField
          label="Username"
          value={creds.username}
          onChange={(v) => onChange({ ...creds, username: v })}
        />
        <CredentialField
          label="Password"
          value={creds.password}
          onChange={(v) => onChange({ ...creds, password: v })}
          isSecret
        />
        <CredentialField
          label="Security Token"
          value={creds.token}
          onChange={(v) => onChange({ ...creds, token: v })}
          isSecret
        />
        <CredentialField
          label="Login URL"
          value={creds.loginUrl}
          onChange={(v) => onChange({ ...creds, loginUrl: v })}
        />
        {errorMessage && status === 'error' && (
          <Text size="1" color="red">{errorMessage}</Text>
        )}
        {orgInfo && status === 'connected' && (
          <Text size="1" color="gray">Org ID: {orgInfo.orgId}</Text>
        )}
        {onConnect && (
          <Button
            size="2"
            onClick={onConnect}
            disabled={status === 'connecting' || !creds.username}
          >
            {status === 'connecting' ? 'Connecting...' : 'Connect'}
          </Button>
        )}
      </Flex>
    </Box>
  )
}

export { OrgPanel, CredentialField, type ConnectionStatus, EMPTY_CREDS }

export default function OrgConnectStep({
  mode,
  sourceOrg,
  targetOrg,
  initialSourceCreds,
  initialTargetCreds,
  onSourceConnected,
  onTargetConnected,
  onCredsSaved,
  onNext,
  onBack
}: Props): React.ReactElement {
  const needsSource = mode === 'extract-only' || mode === 'extract-upsert'
  const needsTarget = mode === 'upsert-only' || mode === 'extract-upsert'

  const [sourceConnStatus, setSourceConnStatus] = useState<ConnectionStatus>(
    sourceOrg?.connected ? 'connected' : 'idle'
  )
  const [targetConnStatus, setTargetConnStatus] = useState<ConnectionStatus>(
    targetOrg?.connected ? 'connected' : 'idle'
  )
  const [sourceError, setSourceError] = useState('')
  const [targetError, setTargetError] = useState('')
  const [sourceCreds, setSourceCreds] = useState<OrgCredentials>({ ...initialSourceCreds })
  const [targetCreds, setTargetCreds] = useState<OrgCredentials>({ ...initialTargetCreds })
  const [saving, setSaving] = useState(false)

  const saveCredentials = async (): Promise<void> => {
    setSaving(true)
    try {
      const all = { source: sourceCreds, target: targetCreds }
      await window.api.saveCredentials(all)
      onCredsSaved(all)
    } finally {
      setSaving(false)
    }
  }

  const connectSourceOrg = async (): Promise<void> => {
    setSourceConnStatus('connecting')
    setSourceError('')
    try {
      const result = await window.api.connectSource(sourceCreds)
      if (result.connected) {
        onSourceConnected(result)
        setSourceConnStatus('connected')
      } else {
        setSourceConnStatus('error')
        setSourceError(result.error ?? '')
      }
    } catch (err) {
      setSourceConnStatus('error')
      setSourceError(err instanceof Error ? err.message : String(err))
    }
  }

  const connectTargetOrg = async (): Promise<void> => {
    setTargetConnStatus('connecting')
    setTargetError('')
    try {
      const result = await window.api.connectTarget(targetCreds)
      if (result.connected) {
        onTargetConnected(result)
        setTargetConnStatus('connected')
      } else {
        setTargetConnStatus('error')
        setTargetError(result.error ?? '')
      }
    } catch (err) {
      setTargetConnStatus('error')
      setTargetError(err instanceof Error ? err.message : String(err))
    }
  }

  const heading = mode === 'upsert-only'
    ? 'Connect to Target Org'
    : 'Connect to Salesforce Orgs'

  const description = mode === 'upsert-only'
    ? 'Enter credentials for the org you want to upsert into.'
    : needsTarget
      ? 'Enter credentials and connect to both source and target orgs.'
      : 'Enter credentials and connect to the source org.'

  const canProceed = needsSource && needsTarget
    ? sourceOrg?.connected && targetOrg?.connected
    : needsSource
      ? sourceOrg?.connected
      : targetOrg?.connected

  return (
    <Flex direction="column" gap="5">
      <Heading size="5">{heading}</Heading>
      <Text size="2" color="gray">{description}</Text>

      <Flex gap="4">
        {needsSource && (
          <OrgPanel
            title="Source Org"
            creds={sourceCreds}
            onChange={setSourceCreds}
            status={sourceConnStatus}
            orgInfo={sourceOrg}
            onConnect={connectSourceOrg}
            errorMessage={sourceError}
          />
        )}
        {needsTarget ? (
          <OrgPanel
            title="Target Org"
            creds={targetCreds}
            onChange={setTargetCreds}
            status={targetConnStatus}
            orgInfo={targetOrg}
            onConnect={connectTargetOrg}
            errorMessage={targetError}
          />
        ) : (
          <OrgPanel
            title="Target Org (optional)"
            creds={targetCreds}
            onChange={setTargetCreds}
            status={targetConnStatus}
            orgInfo={targetOrg}
            onConnect={connectTargetOrg}
            errorMessage={targetError}
            optional
          />
        )}
      </Flex>

      <Flex gap="3">
        <Button variant="soft" onClick={onBack}>&larr; Back</Button>
        <Button
          variant="soft"
          onClick={saveCredentials}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Credentials'}
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
        >
          Next &rarr;
        </Button>
      </Flex>
    </Flex>
  )
}
