import type { Connection } from '@jsforce/jsforce-node'
import type { Field } from '@jsforce/jsforce-node/lib/types/common'
import log from 'electron-log/main'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type {
  SfRecord,
  BundleExport,
  ProgressEvent,
  ReferenceData,
  BackfillData
} from '../shared/types'
import { FIELD_REGISTRY, getRegistryFieldsForExtraction } from './fieldRegistry'

// ─── SOQL helpers ────────────────────────────────────────────────────────────

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

function queryAllStreaming<T extends SfRecord>(
  conn: Connection,
  soql: string
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const records: T[] = []
    const query = conn.query<T>(soql)
      .maxFetch(50_000)
      .autoFetch(true)
    query
      .on('record', (record: T) => {
        records.push(record)
      })
      .on('end', () => {
        resolve(records)
      })
      .on('error', (err: Error) => {
        reject(err)
      })
      .run()
  })
}

async function queryAllStreamingChunked<T extends SfRecord>(
  conn: Connection,
  fields: string[],
  objectApiName: string,
  filterField: string,
  ids: string[]
): Promise<T[]> {
  if (ids.length === 0) return []
  const results: T[] = []
  for (const idChunk of chunk(ids, 500)) {
    const inClause = idChunk.map((id) => `'${id}'`).join(',')
    const soql = `SELECT ${fields.join(', ')} FROM ${objectApiName} WHERE ${filterField} IN (${inClause})`
    const records = await queryAllStreaming<T>(conn, soql)
    results.push(...records)
  }
  return results
}

async function queryAllChunked<T extends SfRecord>(
  conn: Connection,
  fields: string[],
  objectApiName: string,
  filterField: string,
  ids: string[]
): Promise<T[]> {
  if (ids.length === 0) return []
  const results: T[] = []
  for (const idChunk of chunk(ids, 500)) {
    const inClause = idChunk.map((id) => `'${id}'`).join(',')
    const soql = `SELECT ${fields.join(', ')} FROM ${objectApiName} WHERE ${filterField} IN (${inClause})`
    const records = await queryAll<T>(conn, soql)
    results.push(...records)
  }
  return results
}

// ─── Field resolution ───────────────────────────────────────────────────────

const describeCache = new Map<string, Set<string>>()

async function getOrgFields(conn: Connection, objectApiName: string): Promise<Set<string>> {
  const cached = describeCache.get(objectApiName)
  if (cached) return cached
  const desc = await conn.describe(objectApiName)
  const fieldNames = new Set(
    desc.fields
      .filter((f: Field) => !f.calculated)
      .map((f: Field) => f.name)
  )
  describeCache.set(objectApiName, fieldNames)
  return fieldNames
}

async function resolveFields(
  conn: Connection,
  objectApiName: string
): Promise<string[]> {
  const registryFields = getRegistryFieldsForExtraction(objectApiName)
  if (!registryFields) {
    throw new Error(`No field registry entry for ${objectApiName}`)
  }
  const orgFields = await getOrgFields(conn, objectApiName)
  const resolved: string[] = []
  for (const f of registryFields) {
    if (orgFields.has(f)) {
      resolved.push(f)
    } else {
      log.debug(`[extractor] Field ${f} not found in org for ${objectApiName} — skipping`)
    }
  }
  return resolved
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pluckIds(records: SfRecord[]): string[] {
  return records.map((r) => r.Id)
}

function logInfo(message: string): void {
  log.info(`[extractor] ${message}`)
}

// ─── Main extractor ─────────────────────────────────────────────────────────

export async function extractBundle(
  conn: Connection,
  bundleId: string,
  emitProgress: (e: ProgressEvent) => void,
  outputDirectory?: string
): Promise<BundleExport> {
  const records: { [objectApiName: string]: SfRecord[] } = {}
  const referenceData: ReferenceData = {
    classificationNames: [],
    projectionsTemplateLookupKeys: []
  }
  const backfillData: BackfillData = {
    records: {},
    statementTypes: {}
  }

  async function extract(
    objectApiName: string,
    soql: string
  ): Promise<SfRecord[]> {
    try {
      const rows = await queryAll<SfRecord>(conn, soql)
      records[objectApiName] = rows
      emitProgress({
        stage: 'extract',
        object: objectApiName,
        count: rows.length,
        status: 'success'
      })
      logInfo(`${objectApiName}: ${rows.length} records`)
      return rows
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      emitProgress({
        stage: 'extract',
        object: objectApiName,
        status: 'error',
        message
      })
      logInfo(`${objectApiName}: ERROR — ${message}`)
      throw err
    }
  }

  async function extractStreaming(
    objectApiName: string,
    fields: string[],
    filterField: string,
    ids: string[]
  ): Promise<SfRecord[]> {
    try {
      const rows = await queryAllStreamingChunked<SfRecord>(
        conn,
        fields,
        objectApiName,
        filterField,
        ids
      )
      records[objectApiName] = rows
      emitProgress({
        stage: 'extract',
        object: objectApiName,
        count: rows.length,
        status: 'success'
      })
      logInfo(`${objectApiName}: ${rows.length} records (streamed)`)
      return rows
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      emitProgress({
        stage: 'extract',
        object: objectApiName,
        status: 'error',
        message
      })
      logInfo(`${objectApiName}: ERROR — ${message}`)
      throw err
    }
  }

  async function extractChunked(
    objectApiName: string,
    fields: string[],
    filterField: string,
    ids: string[]
  ): Promise<SfRecord[]> {
    try {
      const rows = await queryAllChunked<SfRecord>(
        conn,
        fields,
        objectApiName,
        filterField,
        ids
      )
      records[objectApiName] = rows
      emitProgress({
        stage: 'extract',
        object: objectApiName,
        count: rows.length,
        status: 'success'
      })
      logInfo(`${objectApiName}: ${rows.length} records`)
      return rows
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      emitProgress({
        stage: 'extract',
        object: objectApiName,
        status: 'error',
        message
      })
      logInfo(`${objectApiName}: ERROR — ${message}`)
      throw err
    }
  }

  // ─── Phase 1: Reference data ──────────────────────────────────────────────

  logInfo('Phase 1 — Reference data')

  const bundlePreQuery = await queryAll<SfRecord>(
    conn,
    `SELECT Id, Name, LLC_BI__lookupKey__c, LLC_BI__Financial_Consolidation__c, LLC_BI__Source_Template__c
     FROM LLC_BI__Underwriting_Bundle__c
     WHERE Id = '${bundleId}'
     LIMIT 1`
  )
  const bundlePre = bundlePreQuery[0]
  if (!bundlePre) {
    throw new Error(`Bundle not found: ${bundleId}`)
  }

  // Financial Consolidation
  const financialConsolidationId = bundlePre.LLC_BI__Financial_Consolidation__c as string | null
  if (financialConsolidationId) {
    const finCons = await queryAll<SfRecord>(
      conn,
      `SELECT Id, Name FROM LLC_BI__Financial_Consolidation__c WHERE Id = '${financialConsolidationId}' LIMIT 1`
    )
    if (finCons.length > 0) {
      referenceData.financialConsolidationName = finCons[0].Name as string
    }
    emitProgress({ stage: 'extract', object: 'LLC_BI__Financial_Consolidation__c', count: finCons.length, status: 'success' })
    logInfo(`LLC_BI__Financial_Consolidation__c: ${finCons.length} records`)
  } else {
    emitProgress({ stage: 'extract', object: 'LLC_BI__Financial_Consolidation__c', count: 0, status: 'success' })
    logInfo('LLC_BI__Financial_Consolidation__c: skipped (no consolidation reference)')
  }

  // Classifications — exclude nCino Standard Tags per registry
  const classificationFields = await resolveFields(conn, 'LLC_BI__Classification__c')
  const classExclude = FIELD_REGISTRY['LLC_BI__Classification__c'].excludeFilter
  const classFilter = classExclude ? ` WHERE ${classExclude}` : ''
  const classifications = await queryAll<SfRecord>(
    conn,
    `SELECT ${classificationFields.join(', ')} FROM LLC_BI__Classification__c${classFilter}`
  )
  referenceData.classificationNames = classifications
    .map((c) => c.Name as string)
    .filter(Boolean)
  records['LLC_BI__Classification__c'] = classifications
  emitProgress({ stage: 'extract', object: 'LLC_BI__Classification__c', count: classifications.length, status: 'success' })
  logInfo(`LLC_BI__Classification__c: ${classifications.length} records`)

  // Projection junctions → template IDs
  const projectionJunctions = await queryAll<SfRecord>(
    conn,
    `SELECT Id, LLC_BI__Projection_Template__c
     FROM LLC_BI__Projection_Bundle_Junction__c
     WHERE LLC_BI__Bundle__c = '${bundleId}'`
  )
  const projTemplateIds = projectionJunctions
    .map((j) => j.LLC_BI__Projection_Template__c as string)
    .filter(Boolean)

  if (projTemplateIds.length > 0) {
    const ptFields = await resolveFields(conn, 'LLC_BI__Spread_Projections_Template__c')
    const projTemplates = await queryAllChunked<SfRecord>(
      conn,
      ptFields,
      'LLC_BI__Spread_Projections_Template__c',
      'Id',
      projTemplateIds
    )
    records['LLC_BI__Spread_Projections_Template__c'] = projTemplates
    referenceData.projectionsTemplateLookupKeys = projTemplates
      .map((t) => (t.LLC_BI__lookupKey__c as string) ?? '')
      .filter(Boolean)
    emitProgress({ stage: 'extract', object: 'LLC_BI__Spread_Projections_Template__c', count: projTemplates.length, status: 'success' })
    logInfo(`LLC_BI__Spread_Projections_Template__c: ${projTemplates.length} records`)
  } else {
    records['LLC_BI__Spread_Projections_Template__c'] = []
    emitProgress({ stage: 'extract', object: 'LLC_BI__Spread_Projections_Template__c', count: 0, status: 'success' })
    logInfo('LLC_BI__Spread_Projections_Template__c: skipped (no projection junctions)')
  }

  // ─── Phase 2: Root bundle ─────────────────────────────────────────────────

  logInfo('Phase 2 — Root bundle')

  const bundleFields = await resolveFields(conn, 'LLC_BI__Underwriting_Bundle__c')
  const bundleRecords = await extract(
    'LLC_BI__Underwriting_Bundle__c',
    `SELECT ${bundleFields.join(', ')} FROM LLC_BI__Underwriting_Bundle__c WHERE Id = '${bundleId}' LIMIT 1`
  )
  const bundleRecord = bundleRecords[0]
  const bundleName = (bundleRecord?.Name as string) ?? ''
  const bundleLookupKey = (bundleRecord?.LLC_BI__lookupKey__c as string) ?? ''

  // Store backfill: LLC_BI__Source_Template__c
  const sourceTemplate = bundleRecord?.LLC_BI__Source_Template__c as string | undefined
  if (sourceTemplate) {
    backfillData.bundleSourceTemplate = sourceTemplate
  }
  if (bundleRecord) {
    delete bundleRecord.LLC_BI__Source_Template__c
  }

  // ─── Phase 3: Statement Types ─────────────────────────────────────────────

  logInfo('Phase 3 — Statement Types')

  const stFields = await resolveFields(conn, 'LLC_BI__Spread_Statement_Type__c')
  const stExclude = FIELD_REGISTRY['LLC_BI__Spread_Statement_Type__c'].excludeFilter
  const stFilter = stExclude ? ` AND ${stExclude}` : ''
  const statementTypes = await extract(
    'LLC_BI__Spread_Statement_Type__c',
    `SELECT ${stFields.join(', ')} FROM LLC_BI__Spread_Statement_Type__c WHERE LLC_BI__Bundle__c = '${bundleId}'${stFilter}`
  )

  // Store backfill per statement type, then null in main records
  for (const st of statementTypes) {
    const lookupKey = (st.LLC_BI__lookupKey__c as string) ?? st.Id
    const backfill: { [fieldName: string]: string } = {}

    const calcCommonSizingRecord = st.LLC_BI__Calc_Common_Sizing_Record__c as string | undefined
    if (calcCommonSizingRecord) {
      backfill['LLC_BI__Calc_Common_Sizing_Record__c'] = calcCommonSizingRecord
    }
    delete st.LLC_BI__Calc_Common_Sizing_Record__c

    const calcCommonSizingTotalGroup = st.LLC_BI__Calc_Common_Sizing_Total_Group__c as string | undefined
    if (calcCommonSizingTotalGroup) {
      backfill['LLC_BI__Calc_Common_Sizing_Total_Group__c'] = calcCommonSizingTotalGroup
    }
    delete st.LLC_BI__Calc_Common_Sizing_Total_Group__c

    if (Object.keys(backfill).length > 0) {
      backfillData.statementTypes[lookupKey] = backfill
    }
  }

  const typeIds = pluckIds(statementTypes)

  // ─── Phase 4: Record Totals & Periods ─────────────────────────────────────

  logInfo('Phase 4 — Record Totals & Periods')

  const rtFields = await resolveFields(conn, 'LLC_BI__Spread_Statement_Record_Total__c')
  await extractChunked(
    'LLC_BI__Spread_Statement_Record_Total__c',
    rtFields,
    'LLC_BI__Spread_Statement_Type__c',
    typeIds
  )
  const totalIds = pluckIds(records['LLC_BI__Spread_Statement_Record_Total__c'] ?? [])

  const periodFields = await resolveFields(conn, 'LLC_BI__Spread_Statement_Period__c')
  logInfo(`Querying periods: typeIds=${typeIds.length}`)
  await extractChunked(
    'LLC_BI__Spread_Statement_Period__c',
    periodFields,
    'LLC_BI__Spread_Statement_Type__c',
    typeIds
  )
  const periodIds = pluckIds(records['LLC_BI__Spread_Statement_Period__c'] ?? [])
  logInfo(`Period result: ${periodIds.length} periodIds`)

  // ─── Phase 5: Records ─────────────────────────────────────────────────────

  logInfo('Phase 5 — Records')

  const recFields = await resolveFields(conn, 'LLC_BI__Spread_Statement_Record__c')
  const statementRecords = await extractChunked(
    'LLC_BI__Spread_Statement_Record__c',
    recFields,
    'LLC_BI__Spread_Statement_Type__c',
    typeIds
  )

  // Store backfill per record, then null in main records
  for (const rec of statementRecords) {
    const lookupKey = (rec.LLC_BI__lookupKey__c as string) ?? rec.Id
    const backfill: { [fieldName: string]: string } = {}

    const linkedRecord = rec.LLC_BI__Linked_Spread_Statement_Record__c as string | undefined
    if (linkedRecord) {
      backfill['LLC_BI__Linked_Spread_Statement_Record__c'] = linkedRecord
    }
    rec.LLC_BI__Linked_Spread_Statement_Record__c = null

    const linkedTotalGroup = rec.LLC_BI__Linked_Spread_Statement_Total_Group__c as string | undefined
    if (linkedTotalGroup) {
      backfill['LLC_BI__Linked_Spread_Statement_Total_Group__c'] = linkedTotalGroup
    }
    rec.LLC_BI__Linked_Spread_Statement_Total_Group__c = null

    const associatedParent = rec.LLC_BI__Associated_Parent_Record__c as string | undefined
    if (associatedParent) {
      backfill['LLC_BI__Associated_Parent_Record__c'] = associatedParent
    }
    rec.LLC_BI__Associated_Parent_Record__c = null

    if (Object.keys(backfill).length > 0) {
      backfillData.records[lookupKey] = backfill
    }
  }

  const recordIds = pluckIds(statementRecords)

  logInfo(`ID summary: typeIds=${typeIds.length}, totalIds=${totalIds.length}, periodIds=${periodIds.length}, recordIds=${recordIds.length}`)

  // ─── Phase 6: Junctions and leaves ────────────────────────────────────────

  logInfo('Phase 6 — Junctions and leaves')

  // Record Values — streaming (high volume)
  const rvFields = await resolveFields(conn, 'LLC_BI__Spread_Statement_Record_Value__c')
  await extractStreaming(
    'LLC_BI__Spread_Statement_Record_Value__c',
    rvFields,
    'LLC_BI__Spread_Statement_Period__c',
    periodIds
  )

  // Period Totals — streaming (high volume)
  const ptFields = await resolveFields(conn, 'LLC_BI__Spread_Statement_Period_Total__c')
  await extractStreaming(
    'LLC_BI__Spread_Statement_Period_Total__c',
    ptFields,
    'LLC_BI__Spread_Statement_Period__c',
    periodIds
  )

  // Record Groups
  const rgFields = await resolveFields(conn, 'LLC_BI__Spread_Statement_Record_Group__c')
  logInfo(`Querying record groups: recordIds=${recordIds.length}`)
  await extractChunked(
    'LLC_BI__Spread_Statement_Record_Group__c',
    rgFields,
    'LLC_BI__Spread_Statement_Record__c',
    recordIds
  )

  // Build set of excluded Classification IDs (nCino Standard Tags)
  const nCinoStdTags = await queryAll<SfRecord>(
    conn,
    `SELECT Id FROM LLC_BI__Classification__c WHERE LLC_BI__Category__c = 'nCino Standard Tags'`
  )
  const nCinoStdTagIds = new Set(nCinoStdTags.map((c) => c.Id as string))
  logInfo(`nCino Standard Tags classifications: ${nCinoStdTagIds.size} IDs (will be excluded from junction records)`)

  // Record Classifications — filter out junctions referencing excluded classifications
  const rcFields = await resolveFields(conn, 'LLC_BI__Spread_Record_Classification__c')
  const allRecordClassifications = await extractChunked(
    'LLC_BI__Spread_Record_Classification__c',
    rcFields,
    'LLC_BI__Spread_Statement_Record__c',
    recordIds
  )
  const filteredRC = allRecordClassifications.filter((r) => {
    const classId = r.LLC_BI__Classification__c as string | undefined
    return !classId || !nCinoStdTagIds.has(classId)
  })
  if (filteredRC.length < allRecordClassifications.length) {
    const excluded = allRecordClassifications.length - filteredRC.length
    logInfo(`LLC_BI__Spread_Record_Classification__c: filtered out ${excluded} records referencing nCino Standard Tags`)
    records['LLC_BI__Spread_Record_Classification__c'] = filteredRC
    emitProgress({ stage: 'extract', object: 'LLC_BI__Spread_Record_Classification__c', count: filteredRC.length, status: 'success', message: `${excluded} nCino Standard Tags junctions excluded` })
  }

  // Record Total Classifications — filter out junctions referencing excluded classifications
  const rtcFields = await resolveFields(conn, 'LLC_BI__Spread_Record_Total_Classification__c')
  const allTotalClassifications = await extractChunked(
    'LLC_BI__Spread_Record_Total_Classification__c',
    rtcFields,
    'LLC_BI__Spread_Statement_Total_Group__c',
    totalIds
  )
  const filteredRTC = allTotalClassifications.filter((r) => {
    const classId = r.LLC_BI__Classification__c as string | undefined
    return !classId || !nCinoStdTagIds.has(classId)
  })
  if (filteredRTC.length < allTotalClassifications.length) {
    const excluded = allTotalClassifications.length - filteredRTC.length
    logInfo(`LLC_BI__Spread_Record_Total_Classification__c: filtered out ${excluded} records referencing nCino Standard Tags`)
    records['LLC_BI__Spread_Record_Total_Classification__c'] = filteredRTC
    emitProgress({ stage: 'extract', object: 'LLC_BI__Spread_Record_Total_Classification__c', count: filteredRTC.length, status: 'success', message: `${excluded} nCino Standard Tags junctions excluded` })
  }

  // Row Mappings
  const rmFields = await resolveFields(conn, 'LLC_BI__Spread_Statement_Row_Mapping__c')
  await extract(
    'LLC_BI__Spread_Statement_Row_Mapping__c',
    `SELECT ${rmFields.join(', ')} FROM LLC_BI__Spread_Statement_Row_Mapping__c WHERE LLC_BI__Underwriting_Bundle__c = '${bundleId}'`
  )

  // Projection Bundle Junctions
  const pbjFields = await resolveFields(conn, 'LLC_BI__Projection_Bundle_Junction__c')
  await extract(
    'LLC_BI__Projection_Bundle_Junction__c',
    `SELECT ${pbjFields.join(', ')} FROM LLC_BI__Projection_Bundle_Junction__c WHERE LLC_BI__Bundle__c = '${bundleId}'`
  )

  // Period Consolidations (may not exist if feature disabled)
  try {
    const pcFields = await resolveFields(conn, 'LLC_BI__Period_Consolidation__c')
    await extractChunked(
      'LLC_BI__Period_Consolidation__c',
      pcFields,
      'LLC_BI__Source_Period__c',
      periodIds
    )
  } catch (err) {
    log.warn('[extractor] LLC_BI__Period_Consolidation__c not available in this org — skipping',
      err instanceof Error ? err.message : String(err))
    records['LLC_BI__Period_Consolidation__c'] = []
    emitProgress({ stage: 'extract', object: 'LLC_BI__Period_Consolidation__c', count: 0, status: 'success', message: 'Not available in this org — skipped' })
  }

  // Projections Drivers — streaming (high volume, may not exist in older orgs)
  try {
    const pdFields = await resolveFields(conn, 'LLC_BI__Spread_Projections_Driver__c')
    await extractStreaming(
      'LLC_BI__Spread_Projections_Driver__c',
      pdFields,
      'LLC_BI__Spread_Statement_Record__c',
      recordIds
    )
  } catch (err) {
    log.warn('[extractor] LLC_BI__Spread_Projections_Driver__c not available in this org — skipping',
      err instanceof Error ? err.message : String(err))
    records['LLC_BI__Spread_Projections_Driver__c'] = []
    emitProgress({ stage: 'extract', object: 'LLC_BI__Spread_Projections_Driver__c', count: 0, status: 'success', message: 'Not available in this org — skipped' })
  }

  // Tenant Information (may not exist in all orgs)
  try {
    const tiFields = await resolveFields(conn, 'LLC_BI__Tenant_Information__c')
    await extractChunked(
      'LLC_BI__Tenant_Information__c',
      tiFields,
      'LLC_BI__Spread_Statement_Template__c',
      typeIds
    )
  } catch (err) {
    log.warn('[extractor] LLC_BI__Tenant_Information__c not available in this org — skipping',
      err instanceof Error ? err.message : String(err))
    records['LLC_BI__Tenant_Information__c'] = []
    emitProgress({ stage: 'extract', object: 'LLC_BI__Tenant_Information__c', count: 0, status: 'success', message: 'Not available in this org — skipped' })
  }

  // Sensitivity Analysis (may not exist in all orgs)
  try {
    const saFields = await resolveFields(conn, 'LLC_BI__Sensitivity_Analysis__c')
    await extract(
      'LLC_BI__Sensitivity_Analysis__c',
      `SELECT ${saFields.join(', ')} FROM LLC_BI__Sensitivity_Analysis__c WHERE LLC_BI__Bundle__c = '${bundleId}'`
    )
  } catch (err) {
    log.warn('[extractor] LLC_BI__Sensitivity_Analysis__c not available in this org — skipping',
      err instanceof Error ? err.message : String(err))
    records['LLC_BI__Sensitivity_Analysis__c'] = []
    emitProgress({ stage: 'extract', object: 'LLC_BI__Sensitivity_Analysis__c', count: 0, status: 'success', message: 'Not available in this org — skipped' })
  }

  // ─── Phase 7: Schedules ───────────────────────────────────────────────────

  logInfo('Phase 7 — Schedules')

  const schedFields = await resolveFields(conn, 'LLC_BI__Schedule__c')
  const schedules = await extract(
    'LLC_BI__Schedule__c',
    `SELECT ${schedFields.join(', ')} FROM LLC_BI__Schedule__c WHERE LLC_BI__Bundle__c = '${bundleId}'`
  )
  const scheduleIds = pluckIds(schedules)

  // Schedule Entries
  if (scheduleIds.length > 0) {
    const seFields = await resolveFields(conn, 'LLC_BI__Schedule_Entry__c')
    await extractChunked(
      'LLC_BI__Schedule_Entry__c',
      seFields,
      'LLC_BI__Schedule__c',
      scheduleIds
    )
  } else {
    records['LLC_BI__Schedule_Entry__c'] = []
    emitProgress({ stage: 'extract', object: 'LLC_BI__Schedule_Entry__c', count: 0, status: 'success' })
    logInfo('LLC_BI__Schedule_Entry__c: 0 records (no schedules)')
  }

  // Schedule Sections (Schedule-owned)
  const sectionFields = await resolveFields(conn, 'LLC_BI__Schedule_Section__c')
  if (scheduleIds.length > 0) {
    await extractChunked(
      'LLC_BI__Schedule_Section__c',
      sectionFields,
      'LLC_BI__Schedule__c',
      scheduleIds
    )
  } else {
    records['LLC_BI__Schedule_Section__c'] = []
    emitProgress({ stage: 'extract', object: 'LLC_BI__Schedule_Section__c', count: 0, status: 'success' })
    logInfo('LLC_BI__Schedule_Section__c: 0 records (no schedules)')
  }

  // ─── Phase 8: Debt Schedules ──────────────────────────────────────────────

  logInfo('Phase 8 — Debt Schedules')

  const dsFields = await resolveFields(conn, 'LLC_BI__Debt_Schedule__c')
  const debtSchedules = await extract(
    'LLC_BI__Debt_Schedule__c',
    `SELECT ${dsFields.join(', ')} FROM LLC_BI__Debt_Schedule__c WHERE LLC_BI__Bundle__c = '${bundleId}'`
  )
  const debtScheduleIds = pluckIds(debtSchedules)

  if (debtScheduleIds.length > 0) {
    // Debts (parent — no Internal_Debt)
    const debtFields = await resolveFields(conn, 'LLC_BI__Debt__c')
    const allDebts = await queryAllChunked<SfRecord>(
      conn,
      debtFields,
      'LLC_BI__Debt__c',
      'LLC_BI__Debt_Schedule__c',
      debtScheduleIds
    )
    const parentDebtsOnly = allDebts.filter((r) => !r.LLC_BI__Internal_Debt__c)
    records['LLC_BI__Debt__c'] = parentDebtsOnly
    emitProgress({ stage: 'extract', object: 'LLC_BI__Debt__c', count: parentDebtsOnly.length, status: 'success' })
    logInfo(`LLC_BI__Debt__c (parent): ${parentDebtsOnly.length} records`)

    // Debts (internal)
    const internalDebts = allDebts.filter((r) => !!r.LLC_BI__Internal_Debt__c)
    records['LLC_BI__Debt_Internal__c'] = internalDebts
    emitProgress({ stage: 'extract', object: 'LLC_BI__Debt_Internal__c', count: internalDebts.length, status: 'success' })
    logInfo(`LLC_BI__Debt__c (internal): ${internalDebts.length} records`)

    // Schedule Sections (Debt-owned) — merge into existing
    const debtScheduleSections = await queryAllChunked<SfRecord>(
      conn,
      sectionFields,
      'LLC_BI__Schedule_Section__c',
      'LLC_BI__Debt_Schedule__c',
      debtScheduleIds
    )
    const existing = records['LLC_BI__Schedule_Section__c'] ?? []
    records['LLC_BI__Schedule_Section__c'] = [...existing, ...debtScheduleSections]
    emitProgress({ stage: 'extract', object: 'LLC_BI__Schedule_Section__c (Debt Schedule)', count: debtScheduleSections.length, status: 'success' })
    logInfo(`LLC_BI__Schedule_Section__c (debt schedule): ${debtScheduleSections.length} records`)
  } else {
    records['LLC_BI__Debt__c'] = []
    emitProgress({ stage: 'extract', object: 'LLC_BI__Debt__c', count: 0, status: 'success' })
    logInfo('LLC_BI__Debt__c: 0 records (no debt schedules)')

    records['LLC_BI__Debt_Internal__c'] = []
    emitProgress({ stage: 'extract', object: 'LLC_BI__Debt_Internal__c', count: 0, status: 'success' })
    logInfo('LLC_BI__Debt_Internal__c: 0 records (no debt schedules)')

    emitProgress({ stage: 'extract', object: 'LLC_BI__Schedule_Section__c (Debt Schedule)', count: 0, status: 'success' })
    logInfo('LLC_BI__Schedule_Section__c (debt schedule): 0 records (no debt schedules)')
  }

  // ─── Phase 9: Loan Assumptions ────────────────────────────────────────────

  logInfo('Phase 9 — Loan Assumptions')

  const laFields = await resolveFields(conn, 'LLC_BI__Loan_Assumptions__c')
  await extract(
    'LLC_BI__Loan_Assumptions__c',
    `SELECT ${laFields.join(', ')} FROM LLC_BI__Loan_Assumptions__c WHERE LLC_BI__Bundle__c = '${bundleId}'`
  )

  // ─── Build export ─────────────────────────────────────────────────────────

  const outDir = outputDirectory ?? join(homedir(), 'Documents', 'bundle-migrator')
  mkdirSync(outDir, { recursive: true })
  const safeName = bundleName.replace(/[^a-zA-Z0-9_-]/g, '_')
  const outPath = join(outDir, `${safeName}_${Date.now()}.json`)

  const bundleExport: BundleExport = {
    bundleId,
    bundleName,
    bundleLookupKey,
    extractedAt: new Date().toISOString(),
    exportFilePath: outPath,
    referenceData,
    records,
    backfillData
  }

  writeFileSync(outPath, JSON.stringify(bundleExport, null, 2), 'utf-8')
  logInfo(`Export written to ${outPath}`)

  return bundleExport
}
