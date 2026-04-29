import { Connection } from '@jsforce/jsforce-node'
import log from 'electron-log/main'
import dotenv from 'dotenv'
import { resolve, join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { app } from 'electron'
import type { BedrockCredentials } from '../shared/types'

export interface SessionIdentity {
  username: string
  organization_id: string
}

export const envFilePath = resolve(app.getAppPath(), '.env')
export const credentialsFilePath = join(app.getPath('userData'), 'credentials.json')

dotenv.config({ path: envFilePath })

export interface SfCredentials {
  username: string
  password: string
  token: string
  loginUrl: string
  accessToken?: string
  instanceUrl?: string
}

export interface JiraCreds {
  email: string
  apiToken: string
}

let inMemorySourceCreds: SfCredentials | null = null
let inMemoryTargetCreds: SfCredentials | null = null
let inMemoryJiraCreds: JiraCreds | null = null
let inMemoryBedrockCreds: BedrockCredentials | null = null

function loadSavedCredentials(): void {
  if (existsSync(credentialsFilePath)) {
    try {
      const data = JSON.parse(readFileSync(credentialsFilePath, 'utf-8'))
      if (data.source) inMemorySourceCreds = data.source
      if (data.target) inMemoryTargetCreds = data.target
      if (data.jira) inMemoryJiraCreds = data.jira
      if (data.bedrock) inMemoryBedrockCreds = data.bedrock
      log.info(`Loaded saved credentials from ${credentialsFilePath}`)
    } catch (err) {
      log.warn('Failed to read credentials.json, falling back to .env', err)
    }
  }
}

loadSavedCredentials()

function getSourceCredentials(): SfCredentials {
  if (inMemorySourceCreds) return { ...inMemorySourceCreds }
  return {
    username: process.env.SOURCE_SF_USERNAME ?? '',
    password: process.env.SOURCE_SF_PASSWORD ?? '',
    token: process.env.SOURCE_SF_TOKEN ?? '',
    loginUrl: process.env.SOURCE_SF_LOGIN_URL ?? 'https://login.salesforce.com',
    accessToken: process.env.SOURCE_SF_ACCESS_TOKEN ?? '',
    instanceUrl: process.env.SOURCE_SF_INSTANCE_URL ?? ''
  }
}

function getTargetCredentials(): SfCredentials {
  if (inMemoryTargetCreds) return { ...inMemoryTargetCreds }
  return {
    username: process.env.TARGET_SF_USERNAME ?? '',
    password: process.env.TARGET_SF_PASSWORD ?? '',
    token: process.env.TARGET_SF_TOKEN ?? '',
    loginUrl: process.env.TARGET_SF_LOGIN_URL ?? 'https://login.salesforce.com',
    accessToken: process.env.TARGET_SF_ACCESS_TOKEN ?? '',
    instanceUrl: process.env.TARGET_SF_INSTANCE_URL ?? ''
  }
}

export function updateSourceCredentials(creds: SfCredentials): void {
  inMemorySourceCreds = { ...creds }
  sourceConnection = null
}

export function updateTargetCredentials(creds: SfCredentials): void {
  inMemoryTargetCreds = { ...creds }
  targetConnection = null
}

export function updateJiraCredentials(creds: JiraCreds): void {
  inMemoryJiraCreds = { ...creds }
}

export function getJiraCredentials(): JiraCreds | null {
  return inMemoryJiraCreds ? { ...inMemoryJiraCreds } : null
}

export function updateBedrockCredentials(creds: BedrockCredentials): void {
  inMemoryBedrockCreds = { ...creds }
}

export function getBedrockCredentials(): BedrockCredentials | null {
  return inMemoryBedrockCreds ? { ...inMemoryBedrockCreds } : null
}

export function getAllCredentials(): { source: SfCredentials; target: SfCredentials; jira?: JiraCreds; bedrock?: BedrockCredentials } {
  const jira = getJiraCredentials()
  const bedrock = getBedrockCredentials()
  return {
    source: getSourceCredentials(),
    target: getTargetCredentials(),
    ...(jira ? { jira } : {}),
    ...(bedrock ? { bedrock } : {})
  }
}

async function connect(creds: SfCredentials): Promise<Connection> {
  if (creds.accessToken && creds.instanceUrl) {
    const token = creds.accessToken.trim()
    const instance = creds.instanceUrl.trim().replace(/\/+$/, '')
    const conn = new Connection({
      instanceUrl: instance,
      accessToken: token,
      version: '62.0'
    })
    // Validate the session with a lightweight REST call instead of identity(),
    // which appends the token as a query param that some orgs reject.
    await conn.request({ method: 'GET', url: `${instance}/services/data/v62.0/limits` })
    log.info(`Authenticated via access token on ${instance}`)
    return conn
  }
  const conn = new Connection({ loginUrl: creds.loginUrl })
  await conn.login(creds.username, creds.password + creds.token)
  log.info(`Authenticated as ${creds.username} on ${creds.loginUrl}`)
  return conn
}

let sourceConnection: Connection | null = null
let targetConnection: Connection | null = null

export async function connectSource(creds?: SfCredentials): Promise<Connection> {
  if (creds) {
    updateSourceCredentials(creds)
  }
  if (!sourceConnection) {
    sourceConnection = await connect(getSourceCredentials())
  }
  return sourceConnection
}

export async function connectTarget(creds?: SfCredentials): Promise<Connection | null> {
  if (creds) {
    updateTargetCredentials(creds)
  }
  const resolved = getTargetCredentials()
  if (!resolved.username && !(resolved.accessToken && resolved.instanceUrl)) {
    log.info('Target credentials not set — skipping target connection')
    return null
  }
  if (!targetConnection) {
    targetConnection = await connect(resolved)
  }
  return targetConnection
}

export async function resolveIdentity(conn: Connection): Promise<SessionIdentity> {
  const res = await conn.request({ method: 'GET', url: '/services/oauth2/userinfo' }) as Record<string, unknown>
  return {
    username: (res.preferred_username ?? res.email ?? '') as string,
    organization_id: (res.organization_id ?? '') as string
  }
}

export function disconnectAll(): void {
  sourceConnection = null
  targetConnection = null
  log.info('All Salesforce connections cleared')
}
