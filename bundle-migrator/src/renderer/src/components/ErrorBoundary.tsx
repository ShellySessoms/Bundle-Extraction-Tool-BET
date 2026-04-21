import React from 'react'
import { Box, Flex, Heading, Text, Button } from '@radix-ui/themes'

interface State {
  hasError: boolean
  error: string
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Flex direction="column" gap="4" p="6">
          <Heading size="5" color="red">Something went wrong</Heading>
          <Box p="4" style={{ background: 'var(--red-3)', borderRadius: 'var(--radius-2)' }}>
            <Text color="red" size="2" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              {this.state.error}
            </Text>
          </Box>
          <Text size="2" color="gray">
            Check the log file for more details. Click &quot;Open Log File&quot; to view.
          </Text>
          <Flex gap="3">
            <Button variant="soft" onClick={() => window.api.openLogFile()}>
              Open Log File
            </Button>
            <Button onClick={() => this.setState({ hasError: false, error: '' })}>
              Try Again
            </Button>
          </Flex>
        </Flex>
      )
    }
    return this.props.children
  }
}
