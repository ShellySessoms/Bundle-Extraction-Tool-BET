import { Connection } from '@jsforce/jsforce-node'
import log from 'electron-log/main'
import dotenv from 'dotenv'
import { resolve, join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { app } from 'electron'

export const envFilePath = resolve(app.getAppPath(), '.env')
export const credentialsFilePath = join(app.getPath('userData'), 'credentials.json')

dotenv.config({ path: envFilePath })

export interface SfCredentials {
  username: string
  password: string
  token: string
  loginUrl: string
}

let inMemorySourceCreds: SfCredentials | null = null
let inMemoryTargetCreds: SfCredentials | null = null

function loadSavedCredentials(): void {
  if (existsSync(credentialsFilePath)) {
    try {
      const data = JSON.parse(readFileSync(credentialsFilePath, 'utf-8'))
      if (data.source) inMemorySourceCreds = data.source
      if (data.target) inMemoryTargetCreds = data.target
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
    loginUrl: process.env.SOURCE_SF_LOGIN_URL ?? 'https://login.salesforce.com'
  }
}

function getTargetCredentials(): SfCredentials {
  if (inMemoryTargetCreds) return { ...inMemoryTargetCreds }
  return {
    username: process.env.TARGET_SF_USERNAME ?? '',
    password: process.env.TARGET_SF_PASSWORD ?? '',
    token: process.env.TARGET_SF_TOKEN ?? '',
    loginUrl: process.env.TARGET_SF_LOGIN_URL ?? 'https://login.salesforce.com'
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

export function getAllCredentials(): { source: SfCredentials; target: SfCredentials } {
  return { source: getSourceCredentials(), target: getTargetCredentials() }
}

async function connect(creds: SfCredentials): Promise<Connection> {
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
  if (!resolved.username) {
    log.info('Target username not set — skipping target connection')
    return null
  }
  if (!targetConnection) {
    targetConnection = await connect(resolved)
  }
  return targetConnection
}

export function disconnectAll(): void {
  sourceConnection = null
  targetConnection = null
  log.info('All Salesforce connections cleared')
}
