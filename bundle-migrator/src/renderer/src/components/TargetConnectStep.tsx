import React, { useState } from 'react'
import { Flex, Heading, Text, Button } from '@radix-ui/themes'
import { OrgPanel, EMPTY_CREDS, type ConnectionStatus } from './OrgConnectStep'
import type { OrgStatus, OrgCredentials } from '../../../shared/types'

interface Props {
  targetOrg: OrgStatus | null
  initialCreds: OrgCredentials
  onTargetConnected: (status: OrgStatus) => void
  onNext: () => void
  onBack: () => void
}

export default function TargetConnectStep({
  targetOrg,
  initialCreds,
  onTargetConnected,
  onNext,
  onBack
}: Props): React.ReactElement {
  const [status, setStatus] = useState<ConnectionStatus>(
    targetOrg?.connected ? 'connected' : 'idle'
  )
  const [error, setError] = useState('')
  const [creds, setCreds] = useState<OrgCredentials>(
    initialCreds.username ? { ...initialCreds } : { ...EMPTY_CREDS }
  )

  const connectTarget = async (): Promise<void> => {
    setStatus('connecting')
    setError('')
    try {
      const result = await window.api.connectTarget(creds)
      if (result.connected) {
        onTargetConnected(result)
        setStatus('connected')
      } else {
        setStatus('error')
        setError(result.error || 'Target org not configured. Check credentials.')
      }
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Flex direction="column" gap="5">
      <Heading size="5">Connect Target Org</Heading>
      <Text size="2" color="gray">
        Confirm the target org credentials before upserting. The target org must connect before proceeding.
      </Text>

      <Flex gap="4" justify="center">
        <OrgPanel
          title="Target Org"
          creds={creds}
          onChange={setCreds}
          status={status}
          orgInfo={targetOrg}
          onConnect={connectTarget}
          errorMessage={error}
        />
      </Flex>

      <Flex gap="3">
        <Button variant="soft" onClick={onBack}>&larr; Back</Button>
        <Button
          onClick={() => { if (targetOrg?.connected) onNext() }}
          disabled={!targetOrg?.connected}
        >
          Next &rarr;
        </Button>
      </Flex>
    </Flex>
  )
}
