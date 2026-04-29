import React from 'react'
import { Box, Flex, Heading, Text, Button } from '@radix-ui/themes'
import type { AppMode } from '../../../shared/types'

interface Props {
  onNext: (mode: AppMode) => void
  hasAIEnabled?: boolean
}

const MODES: { mode: AppMode; icon: string; title: string; description: string }[] = [
  {
    mode: 'extract-only',
    icon: '📤',
    title: 'Extract Only',
    description: 'Extract a bundle from the source org and save it as a JSON file. No import to a target org.'
  },
  {
    mode: 'extract-upsert',
    icon: '🔄',
    title: 'Extract & Upsert',
    description: 'Extract a bundle from the source org, then immediately upsert it into the target org.'
  },
  {
    mode: 'upsert-only',
    icon: '📥',
    title: 'Upsert Only',
    description: 'Load a previously exported JSON file and upsert it into the target org.'
  },
  {
    mode: 'compare',
    icon: '🔍',
    title: 'Compare Bundles',
    description: 'Load two bundle JSON files and see a plain-English diff of what configuration is different.'
  },
  {
    mode: 'pdi-insight',
    icon: '🧠',
    title: 'PDI Insight',
    description: 'Load a template and describe an issue to get AI analysis on whether it might be template-related.'
  }
]

export default function ModeStep({ onNext, hasAIEnabled }: Props): React.ReactElement {
  return (
    <Flex direction="column" gap="5">
      <Flex direction="column" gap="1">
        <Heading size="7">Bundle Migrator</Heading>
        <Text size="2" color="gray">
          Migrate Salesforce LLC_BI underwriting bundles between orgs
        </Text>
      </Flex>

      <Text size="2" color="gray">
        Choose how you want to work with underwriting bundles.
      </Text>

      <Flex gap="4" wrap="wrap">
        {MODES.map(({ mode, icon, title, description }) => (
          <Box
            key={mode}
            p="5"
            onClick={() => onNext(mode)}
            style={{
              flex: '1 1 calc(50% - 8px)',
              minWidth: 220,
              border: '1px solid var(--gray-6)',
              borderRadius: 'var(--radius-3)',
              cursor: 'pointer',
              transition: 'border-color 0.15s, box-shadow 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--blue-8)'
              e.currentTarget.style.boxShadow = '0 0 0 1px var(--blue-8)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--gray-6)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <Flex direction="column" gap="2" align="center" style={{ textAlign: 'center' }}>
              <Text size="6">{icon}</Text>
              <Heading size="3">{title}</Heading>
              <Text size="2" color="gray">{description}</Text>
              {mode === 'pdi-insight' && !hasAIEnabled && (
                <Text size="1" color="orange">
                  Requires Bedrock inference profile setup
                </Text>
              )}
              {mode === 'compare' && !hasAIEnabled && (
                <Text size="1" color="gray">
                  AI Analysis available after Bedrock setup
                </Text>
              )}
            </Flex>
          </Box>
        ))}
      </Flex>

    </Flex>
  )
}
