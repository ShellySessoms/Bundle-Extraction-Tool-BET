import React, { useState } from 'react'
import { Box, Flex, Text, Button, TextField } from '@radix-ui/themes'
import type { BedrockCredentials } from '../../../shared/types'

interface Props {
  mode: 'required' | 'optional'
  currentArn: string
  onSaved: (creds: BedrockCredentials) => void
}

export default function BedrockSetupBanner({ mode, currentArn, onSaved }: Props): React.ReactElement {
  const [arn, setArn] = useState(currentArn)
  const [region, setRegion] = useState('us-east-1')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expanded, setExpanded] = useState(mode === 'required')

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      const existingCreds = await window.api.getCredentials()
      await window.api.saveCredentials({
        ...existingCreds,
        bedrock: {
          inferenceProfileArn: arn.trim(),
          awsRegion: region.trim() || 'us-east-1'
        }
      })
      setSaved(true)
      onSaved({
        inferenceProfileArn: arn.trim(),
        awsRegion: region.trim() || 'us-east-1'
      })
    } catch (err) {
      console.error('Failed to save Bedrock credentials', err)
    } finally {
      setSaving(false)
    }
  }

  const fields = (
    <Flex direction="column" gap="2">
      <Box>
        <Text size="2" weight="medium">Inference Profile ARN</Text>
        <TextField.Root
          placeholder="arn:aws:bedrock:us-east-1:714322698969:application-inference-profile/xxxxxxxxxx"
          value={arn}
          onChange={(e) => setArn(e.target.value)}
        />
      </Box>
      <Box>
        <Text size="2" weight="medium">AWS Region</Text>
        <TextField.Root
          placeholder="us-east-1"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        />
      </Box>
      <Button
        disabled={!arn.trim() || saving}
        onClick={handleSave}
        style={{ alignSelf: 'flex-start' }}
      >
        {saving ? 'Saving...' : 'Save & Continue'}
      </Button>
      {saved && (
        <Text size="1" color="green">
          Saved - AI features enabled
        </Text>
      )}
    </Flex>
  )

  if (mode === 'required') {
    return (
      <Box p="4" style={{
        border: '1px solid var(--orange-6)',
        borderRadius: 'var(--radius-3)',
        background: 'var(--orange-2)'
      }}>
        <Text size="2" weight="bold" color="orange" mb="2" style={{ display: 'block' }}>
          One-time AI Setup Required
        </Text>
        <Text size="2" mb="3" style={{ display: 'block' }}>
          PDI Insight uses AWS Bedrock for AI analysis.
          You need a Bedrock inference profile ARN — request one at{' '}
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.api.openExternal('https://bedrock-self-service.ncino.ai') }}
            style={{ color: 'var(--blue-9)' }}
          >
            bedrock-self-service.ncino.ai
          </a>
          {' '}then run genailogin in your terminal.
        </Text>
        {fields}
      </Box>
    )
  }

  if (!expanded) {
    return (
      <Box p="3" style={{
        border: '1px solid var(--purple-4)',
        borderRadius: 'var(--radius-2)',
        background: 'var(--purple-1)'
      }}>
        <Flex justify="between" align="center">
          <Text size="2" color="purple">
            Enable AI Analysis for this comparison
          </Text>
          <Button variant="ghost" size="1" onClick={() => setExpanded(true)}>
            Set up
          </Button>
        </Flex>
      </Box>
    )
  }

  return (
    <Box p="4" style={{
      border: '1px solid var(--purple-6)',
      borderRadius: 'var(--radius-3)',
      background: 'var(--purple-2)'
    }}>
      <Flex justify="between" align="start" mb="2">
        <Text size="2" weight="bold" color="purple">
          Set Up AI Analysis (Optional)
        </Text>
        <Button variant="ghost" size="1" onClick={() => setExpanded(false)}>
          Skip
        </Button>
      </Flex>
      <Text size="2" color="gray" mb="3" style={{ display: 'block' }}>
        Add your Bedrock inference profile ARN to enable
        AI-powered analysis of comparison results.
        Request one at bedrock-self-service.ncino.ai
      </Text>
      {fields}
    </Box>
  )
}
