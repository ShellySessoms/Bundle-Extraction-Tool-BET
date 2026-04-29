import React, { useState } from 'react'
import { Box, Flex, Heading, Text, Button, Badge, TextField, IconButton } from '@radix-ui/themes'
import type { AppMode, OrgStatus, OrgCredentials, AllCredentials, BedrockCredentials } from '../../../shared/types'

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'
type AuthMethod = 'credentials' | 'session'

const EMPTY_CREDS: OrgCredentials = {
  username: '',
  password: '',
  token: '',
  loginUrl: 'https://login.salesforce.com',
  accessToken: '',
  instanceUrl: ''
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

function detectAuthMethod(creds: OrgCredentials): AuthMethod {
  return creds.accessToken && creds.instanceUrl ? 'session' : 'credentials'
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
  const [authMethod, setAuthMethod] = useState<AuthMethod>(detectAuthMethod(creds))

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

  const canConnect = authMethod === 'session'
    ? !!(creds.accessToken && creds.instanceUrl)
    : !!creds.username

  return (
    <Box flexGrow="1" p="4" style={{ border: '1px solid var(--gray-6)', borderRadius: 'var(--radius-3)' }}>
      <Flex direction="column" gap="3">
        <Flex align="center" justify="between">
          <Heading size="4">{title}</Heading>
          {statusBadge()}
        </Flex>
        <Flex gap="2">
          <Button
            size="1"
            variant={authMethod === 'credentials' ? 'solid' : 'soft'}
            onClick={() => setAuthMethod('credentials')}
          >
            Username / Password
          </Button>
          <Button
            size="1"
            variant={authMethod === 'session' ? 'solid' : 'soft'}
            onClick={() => setAuthMethod('session')}
          >
            Access Token
          </Button>
        </Flex>

        {authMethod === 'credentials' ? (
          <>
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
          </>
        ) : (
          <>
            <CredentialField
              label="Access Token"
              value={creds.accessToken ?? ''}
              onChange={(v) => onChange({ ...creds, accessToken: v })}
              isSecret
            />
            <CredentialField
              label="Instance URL"
              value={creds.instanceUrl ?? ''}
              onChange={(v) => onChange({ ...creds, instanceUrl: v })}
            />
            <Text size="1" color="gray">
              Run &quot;sf org display&quot; to get these values from your scratch org.
            </Text>
          </>
        )}
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
            disabled={status === 'connecting' || !canConnect}
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
  const [jiraEmail, setJiraEmail] = useState('')
  const [jiraApiToken, setJiraApiToken] = useState('')
  const [jiraLoaded, setJiraLoaded] = useState(false)
  const [bedrockArn, setBedrockArn] = useState('')
  const [bedrockRegion, setBedrockRegion] = useState('us-east-1')
  const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState('')
  const [bedrockSecretKey, setBedrockSecretKey] = useState('')
  const [bedrockSessionToken, setBedrockSessionToken] = useState('')

  React.useEffect(() => {
    if (!jiraLoaded) {
      window.api.getCredentials().then((creds) => {
        if (creds.jira) {
          setJiraEmail(creds.jira.email)
          setJiraApiToken(creds.jira.apiToken)
        }
        if (creds.bedrock) {
          setBedrockArn(creds.bedrock.inferenceProfileArn ?? '')
          setBedrockRegion(creds.bedrock.awsRegion ?? 'us-east-1')
          setBedrockAccessKeyId(creds.bedrock.awsAccessKeyId ?? '')
          setBedrockSecretKey(creds.bedrock.awsSecretAccessKey ?? '')
          setBedrockSessionToken(creds.bedrock.awsSessionToken ?? '')
        }
        setJiraLoaded(true)
      })
    }
  }, [jiraLoaded])

  const saveCredentials = async (): Promise<void> => {
    setSaving(true)
    try {
      const all: AllCredentials = {
        source: sourceCreds,
        target: targetCreds,
        ...(jiraEmail || jiraApiToken
          ? { jira: { email: jiraEmail, apiToken: jiraApiToken } }
          : {}),
        ...(bedrockArn
          ? {
              bedrock: {
                inferenceProfileArn: bedrockArn,
                awsRegion: bedrockRegion || 'us-east-1',
                awsAccessKeyId: bedrockAccessKeyId || undefined,
                awsSecretAccessKey: bedrockSecretKey || undefined,
                awsSessionToken: bedrockSessionToken || undefined
              }
            }
          : {})
      }
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

      <Box p="4" style={{ border: '1px solid var(--gray-4)', borderRadius: 'var(--radius-2)' }}>
        <Flex direction="column" gap="2">
          <Heading size="3">Jira Integration (Optional)</Heading>
          <Text size="2" color="gray">
            Enables fetching Jira ticket details in PDI Insight for richer AI analysis.
          </Text>
          <CredentialField
            label="Atlassian Email"
            value={jiraEmail}
            onChange={setJiraEmail}
          />
          <CredentialField
            label="Atlassian API Token"
            value={jiraApiToken}
            onChange={setJiraApiToken}
            isSecret
          />
          <Text size="1" color="gray">
            Generate at: id.atlassian.com/manage-profile/security/api-tokens
          </Text>
          {jiraEmail && jiraApiToken && (
            <Text size="1" color="green">Jira integration configured</Text>
          )}
        </Flex>
      </Box>

      <Box p="4" style={{ border: '1px solid var(--gray-4)', borderRadius: 'var(--radius-2)' }}>
        <Flex direction="column" gap="3">
          <Heading size="3">AI Features (AWS Bedrock)</Heading>
          <Text size="2" color="gray">
            Required for AI Analysis on bundle comparisons and PDI Insight.
            Request an inference profile at bedrock-self-service.ncino.ai
            then run genailogin in your terminal to authenticate.
          </Text>

          <CredentialField
            label="Inference Profile ARN *"
            value={bedrockArn}
            onChange={setBedrockArn}
          />
          <Text size="1" color="gray">
            Required. Get yours at bedrock-self-service.ncino.ai
          </Text>

          <CredentialField
            label="AWS Region"
            value={bedrockRegion}
            onChange={setBedrockRegion}
          />
          <Text size="1" color="gray">Default: us-east-1</Text>

          <Box>
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 13 }}>
                Advanced: Explicit AWS Credentials (optional)
              </summary>
              <Text size="1" color="gray" style={{ display: 'block', marginTop: 8, marginBottom: 8 }}>
                Leave blank to use your AWS SSO session (recommended).
                Only needed if you cannot use genailogin.
              </Text>
              <Flex direction="column" gap="2">
                <CredentialField
                  label="AWS Access Key ID"
                  value={bedrockAccessKeyId}
                  onChange={setBedrockAccessKeyId}
                />
                <CredentialField
                  label="AWS Secret Access Key"
                  value={bedrockSecretKey}
                  onChange={setBedrockSecretKey}
                  isSecret
                />
                <CredentialField
                  label="AWS Session Token"
                  value={bedrockSessionToken}
                  onChange={setBedrockSessionToken}
                  isSecret
                />
              </Flex>
            </details>
          </Box>

          {bedrockArn && (
            <Flex align="center" gap="2">
              <Text size="1" color="green">
                Inference profile configured - AI features enabled
              </Text>
              <Button
                variant="ghost"
                size="1"
                color="gray"
                onClick={() => {
                  setBedrockArn('')
                  setBedrockRegion('us-east-1')
                  setBedrockAccessKeyId('')
                  setBedrockSecretKey('')
                  setBedrockSessionToken('')
                }}
              >
                Clear
              </Button>
            </Flex>
          )}
          {!bedrockArn && (
            <Text size="1" color="gray">
              AI features disabled until inference profile ARN is added.
            </Text>
          )}
        </Flex>
      </Box>

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
