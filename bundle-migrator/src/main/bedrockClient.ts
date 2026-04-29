import {
  BedrockRuntimeClient,
  ConverseCommand
} from '@aws-sdk/client-bedrock-runtime'
import type { BedrockCredentials } from '../shared/types'
import log from 'electron-log/main'

export async function invokeBedrockModel(
  bedrockCreds: BedrockCredentials,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 2000
): Promise<string> {
  const clientConfig: Record<string, unknown> = {
    region: bedrockCreds.awsRegion || 'us-east-1'
  }

  if (bedrockCreds.awsAccessKeyId && bedrockCreds.awsSecretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: bedrockCreds.awsAccessKeyId,
      secretAccessKey: bedrockCreds.awsSecretAccessKey,
      sessionToken: bedrockCreds.awsSessionToken
    }
  }

  const client = new BedrockRuntimeClient(clientConfig)

  const command = new ConverseCommand({
    modelId: bedrockCreds.inferenceProfileArn,
    system: [{ text: systemPrompt }],
    messages: [
      { role: 'user', content: [{ text: userMessage }] }
    ],
    inferenceConfig: {
      maxTokens,
      temperature: 0.3
    }
  })

  log.info('Invoking Bedrock model', {
    profileArn: bedrockCreds.inferenceProfileArn,
    region: bedrockCreds.awsRegion || 'us-east-1'
  })

  try {
    const response = await client.send(command)

    const outputMessage = response.output?.message
    if (!outputMessage?.content?.[0]) {
      throw new Error('No content in Bedrock response')
    }

    const content = outputMessage.content[0]
    if (!('text' in content) || typeof content.text !== 'string') {
      throw new Error('Unexpected response format from Bedrock')
    }

    log.info('Bedrock response received', { length: content.text.length })
    return content.text
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string }
    log.error('Bedrock invocation failed', err)

    if (error.name === 'AccessDeniedException' ||
        error.message?.includes('not authorized')) {
      throw new Error(
        'BEDROCK_ACCESS_DENIED: Your AWS credentials do not have ' +
        'permission to invoke this inference profile. Run genailogin ' +
        'to refresh your session and ensure your profile has ' +
        'bedrock:InvokeModel permission.'
      )
    }
    if (error.name === 'ResourceNotFoundException') {
      throw new Error(
        'BEDROCK_PROFILE_NOT_FOUND: The inference profile ARN was not ' +
        'found. Verify your ARN is correct at bedrock-self-service.ncino.ai'
      )
    }
    if (error.name === 'ExpiredTokenException' ||
        error.message?.includes('expired')) {
      throw new Error(
        'BEDROCK_TOKEN_EXPIRED: Your AWS SSO session has expired. ' +
        'Run genailogin to refresh your credentials and try again.'
      )
    }
    if (error.name === 'ValidationException') {
      throw new Error(
        'BEDROCK_VALIDATION_ERROR: Invalid request to Bedrock. ' +
        'Check that your inference profile ARN is correct. ' +
        'Error: ' + error.message
      )
    }

    throw new Error(
      'BEDROCK_ERROR: ' + (error.message || String(err))
    )
  }
}

export function getBedrockErrorMessage(err: string): string {
  if (err.includes('BEDROCK_NOT_CONFIGURED'))
    return 'AI features need setup. Add your Bedrock inference profile ARN ' +
           'in the credentials screen. Request a profile at ' +
           'bedrock-self-service.ncino.ai'
  if (err.includes('BEDROCK_ACCESS_DENIED'))
    return 'AWS permission error. Run genailogin in your terminal to ' +
           'refresh your session, then try again.'
  if (err.includes('BEDROCK_TOKEN_EXPIRED'))
    return 'AWS session expired. Run genailogin in your terminal to ' +
           'refresh your credentials and try again.'
  if (err.includes('BEDROCK_PROFILE_NOT_FOUND'))
    return 'Inference profile not found. Verify your ARN in the ' +
           'credentials screen at bedrock-self-service.ncino.ai'
  if (err.includes('BEDROCK_VALIDATION_ERROR'))
    return 'Invalid Bedrock configuration. Check your inference ' +
           'profile ARN in the credentials screen.'
  return err
}
