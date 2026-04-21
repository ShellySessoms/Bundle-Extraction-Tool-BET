import type { Connection } from '@jsforce/jsforce-node'
import log from 'electron-log/main'
import type {
  SfRecord,
  ReferenceData,
  ResolvedReferences,
  ProgressEvent
} from '../shared/types'

function logInfo(message: string): void {
  log.info(`[referenceResolver] ${message}`)
}

function logWarn(message: string): void {
  log.warn(`[referenceResolver] ${message}`)
}

/** Chunk an array into groups of `size` */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

async function queryAll<T extends SfRecord>(
  conn: Connection,
  soql: string
): Promise<T[]> {
  const result = await conn
    .query<T>(soql)
    .maxFetch(50_000)
    .autoFetch(true)
  return result.records as T[]
}

export async function resolveReferences(
  conn: Connection,
  referenceData: ReferenceData,
  emitProgress: (e: ProgressEvent) => void
): Promise<ResolvedReferences> {
  const resolved: ResolvedReferences = {
    classificationsByName: new Map(),
    projectionsTemplatesByKey: new Map()
  }

  // ─── 1. Financial Consolidation ────────────────────────────────────────────

  if (referenceData.financialConsolidationName) {
    const name = referenceData.financialConsolidationName.replace(/'/g, "\\'")
    const existing = await queryAll<SfRecord>(
      conn,
      `SELECT Id, Name FROM LLC_BI__Financial_Consolidation__c WHERE Name = '${name}' LIMIT 1`
    )

    if (existing.length > 0) {
      resolved.financialConsolidationId = existing[0].Id
      logInfo(`Financial Consolidation resolved: ${name} → ${existing[0].Id}`)
    } else {
      logWarn(`Financial Consolidation '${name}' not found in target — creating`)
      const insertResult = await conn
        .sobject('LLC_BI__Financial_Consolidation__c')
        .create({ Name: name } as Record<string, unknown>)
      if (insertResult.success) {
        resolved.financialConsolidationId = insertResult.id
        logInfo(`Financial Consolidation created: ${name} → ${insertResult.id}`)
      } else {
        const errMsg = insertResult.errors.map((e) => e.message).join('; ')
        logWarn(`Failed to create Financial Consolidation: ${errMsg}`)
      }
    }

    emitProgress({
      stage: 'resolve',
      object: 'LLC_BI__Financial_Consolidation__c',
      count: 1,
      status: resolved.financialConsolidationId ? 'success' : 'error',
      message: resolved.financialConsolidationId
        ? `Resolved to ${resolved.financialConsolidationId}`
        : 'Could not resolve or create'
    })
  }

  // ─── 2. Classifications ────────────────────────────────────────────────────

  if (referenceData.classificationNames.length > 0) {
    const allNames = referenceData.classificationNames
    const foundNames = new Set<string>()

    for (const nameChunk of chunk(allNames, 500)) {
      const inClause = nameChunk.map((n) => `'${n.replace(/'/g, "\\'")}'`).join(',')
      const rows = await queryAll<SfRecord>(
        conn,
        `SELECT Id, Name FROM LLC_BI__Classification__c WHERE Name IN (${inClause})`
      )
      for (const row of rows) {
        const rowName = row.Name as string
        resolved.classificationsByName.set(rowName, row.Id)
        foundNames.add(rowName)
      }
    }

    const missing = allNames.filter((n) => !foundNames.has(n))
    if (missing.length > 0) {
      logWarn(`Classifications not found in target: ${missing.join(', ')}`)
    }
    logInfo(`Classifications resolved: ${foundNames.size}/${allNames.length}`)

    emitProgress({
      stage: 'resolve',
      object: 'LLC_BI__Classification__c',
      count: foundNames.size,
      total: allNames.length,
      status: missing.length > 0 ? 'partial' : 'success'
    })
  }

  // ─── 3. Projections Templates ──────────────────────────────────────────────

  if (referenceData.projectionsTemplateLookupKeys.length > 0) {
    const allKeys = referenceData.projectionsTemplateLookupKeys
    const foundKeys = new Set<string>()

    for (const keyChunk of chunk(allKeys, 500)) {
      const inClause = keyChunk.map((k) => `'${k.replace(/'/g, "\\'")}'`).join(',')
      const rows = await queryAll<SfRecord>(
        conn,
        `SELECT Id, LLC_BI__lookupKey__c FROM LLC_BI__Spread_Projections_Template__c WHERE LLC_BI__lookupKey__c IN (${inClause})`
      )
      for (const row of rows) {
        const key = row.LLC_BI__lookupKey__c as string
        resolved.projectionsTemplatesByKey.set(key, row.Id)
        foundKeys.add(key)
      }
    }

    const missing = allKeys.filter((k) => !foundKeys.has(k))
    if (missing.length > 0) {
      logWarn(`Projections Templates not found in target: ${missing.join(', ')}`)
    }
    logInfo(`Projections Templates resolved: ${foundKeys.size}/${allKeys.length}`)

    emitProgress({
      stage: 'resolve',
      object: 'LLC_BI__Spread_Projections_Template__c',
      count: foundKeys.size,
      total: allKeys.length,
      status: missing.length > 0 ? 'partial' : 'success'
    })
  }

  return resolved
}
