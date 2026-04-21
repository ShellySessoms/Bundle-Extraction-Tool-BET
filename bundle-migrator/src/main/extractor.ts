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

// ─── Field exclusion sets ────────────────────────────────────────────────────

const SYSTEM_FIELDS = new Set([
  'IsDeleted',
  'CreatedDate',
  'CreatedById',
  'LastModifiedDate',
  'LastModifiedById',
  'SystemModstamp',
  'LastActivityDate',
  'LastViewedDate',
  'LastReferencedDate'
])

// ─── SOQL helpers ────────────────────────────────────────────────────────────

/** Chunk an array into groups of `size` */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/**
 * Generic query helper with auto-pagination.
 * For IN clauses, caller must chunk IDs into groups of 500 max beforehand.
 */
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

/**
 * Query with chunked IN clause — splits ids into groups of 500 and merges results.
 */
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

/**
 * Streaming query for high-volume objects (>10k records possible).
 * Uses the jsforce event-based streaming API.
 */
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

/**
 * Streaming query with chunked IN clause.
 */
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

// ─── Field discovery ─────────────────────────────────────────────────────────

async function getQueryableFields(
  conn: Connection,
  objectApiName: string
): Promise<string[]> {
  const desc = await conn.describe(objectApiName)
  return desc.fields
    .filter((f: Field) => {
      if (f.calculated) return false
      if (f.type === 'id' && f.name !== 'Id' && f.name !== 'LLC_BI__lookupKey__c') return false
      if (SYSTEM_FIELDS.has(f.name)) return false
      return true
    })
    .map((f: Field) => f.name)
}

/**
 * Find the lookup/master-detail field on childObject that points to parentObject.
 * Uses the Describe API so we don't have to hardcode relationship field names.
 */
async function discoverRelationshipField(
  conn: Connection,
  childObject: string,
  parentObject: string
): Promise<string> {
  const desc = await conn.describe(childObject)
  const field = desc.fields.find(
    (f: Field) =>
      (f.type === 'reference') &&
      Array.isArray(f.referenceTo) &&
      f.referenceTo.includes(parentObject)
  )
  if (!field) {
    throw new Error(
      `No relationship field found on ${childObject} pointing to ${parentObject}`
    )
  }
  logInfo(`Discovered ${childObject} → ${parentObject} via field ${field.name}`)
  return field.name
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pluckIds(records: SfRecord[]): string[] {
  return records.map((r) => r.Id)
}

function logInfo(message: string): void {
  log.info(`[extractor] ${message}`)
}

// ─── Main extractor ──────────────────────────────────────────────────────────

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

  /** Query an object, emit progress, store in records map, and return the results. */
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

  /** Same as extract but uses streaming for high-volume objects. */
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

  /** Query with chunked IN clause, emit progress, store, return. */
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

  // ─── Phase 1: Reference data ────────────────────────────────────────────────

  logInfo('Phase 1 — Reference data')

  // First get bundle to find its Financial_Consolidation__c
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

  const financialConsolidationId = bundlePre.LLC_BI__Financial_Consolidation__c as string | null
  if (financialConsolidationId) {
    const finCons = await queryAll<SfRecord>(
      conn,
      `SELECT Id, Name FROM LLC_BI__Financial_Consolidation__c WHERE Id = '${financialConsolidationId}' LIMIT 1`
    )
    if (finCons.length > 0) {
      referenceData.financialConsolidationName = finCons[0].Name as string
    }
    emitProgress({
      stage: 'extract',
      object: 'LLC_BI__Financial_Consolidation__c',
      count: finCons.length,
      status: 'success'
    })
    logInfo(`LLC_BI__Financial_Consolidation__c: ${finCons.length} records`)
  } else {
    emitProgress({
      stage: 'extract',
      object: 'LLC_BI__Financial_Consolidation__c',
      count: 0,
      status: 'success'
    })
    logInfo('LLC_BI__Financial_Consolidation__c: skipped (no consolidation reference)')
  }

  // Classifications — all (pre-existing reference data)
  const classifications = await queryAll<SfRecord>(
    conn,
    'SELECT Id, Name FROM LLC_BI__Classification__c'
  )
  referenceData.classificationNames = classifications
    .map((c) => c.Name as string)
    .filter(Boolean)
  emitProgress({
    stage: 'extract',
    object: 'LLC_BI__Classification__c',
    count: classifications.length,
    status: 'success'
  })
  logInfo(`LLC_BI__Classification__c: ${classifications.length} records`)

  // Projection junctions — need them to find template IDs
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
    const projTemplates = await queryAllChunked<SfRecord>(
      conn,
      ['Id', 'Name', 'LLC_BI__lookupKey__c'],
      'LLC_BI__Spread_Projections_Template__c',
      'Id',
      projTemplateIds
    )
    referenceData.projectionsTemplateLookupKeys = projTemplates
      .map((t) => (t.LLC_BI__lookupKey__c as string) ?? '')
      .filter(Boolean)
    emitProgress({
      stage: 'extract',
      object: 'LLC_BI__Spread_Projections_Template__c',
      count: projTemplates.length,
      status: 'success'
    })
    logInfo(`LLC_BI__Spread_Projections_Template__c: ${projTemplates.length} records`)
  } else {
    emitProgress({
      stage: 'extract',
      object: 'LLC_BI__Spread_Projections_Template__c',
      count: 0,
      status: 'success'
    })
    logInfo('LLC_BI__Spread_Projections_Template__c: skipped (no projection junctions)')
  }

  // ─── Phase 2: Root bundle ───────────────────────────────────────────────────

  logInfo('Phase 2 — Root bundle')

  const bundleFields = await getQueryableFields(conn, 'LLC_BI__Underwriting_Bundle__c')
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
  // Exclude from main record
  if (bundleRecord) {
    delete bundleRecord.LLC_BI__Source_Template__c
  }

  // ─── Phase 3: Statement Types ───────────────────────────────────────────────

  logInfo('Phase 3 — Statement Types')

  const stFields = await getQueryableFields(conn, 'LLC_BI__Spread_Statement_Type__c')
  // Exclude LLC_BI__Source_Statement__c entirely
  const stFieldsFiltered = stFields.filter(
    (f) => f !== 'LLC_BI__Source_Statement__c'
  )
  const statementTypes = await extract(
    'LLC_BI__Spread_Statement_Type__c',
    `SELECT ${stFieldsFiltered.join(', ')} FROM LLC_BI__Spread_Statement_Type__c WHERE LLC_BI__Bundle__c = '${bundleId}'`
  )

  // Store backfill per record, then exclude from main records
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

  // ─── Phase 4: Record Totals (before Records — critical ordering) & Periods ─

  logInfo('Phase 4 — Record Totals & Periods')

  const rtFields = await getQueryableFields(conn, 'LLC_BI__Spread_Statement_Record_Total__c')
  const rtFieldsFiltered = rtFields.filter((f) => f !== 'LLC_BI__Source_Group__c')
  const rtFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Spread_Statement_Record_Total__c', 'LLC_BI__Spread_Statement_Type__c'
  )
  await extractChunked(
    'LLC_BI__Spread_Statement_Record_Total__c',
    rtFieldsFiltered,
    rtFilterField,
    typeIds
  )
  const totalIds = pluckIds(records['LLC_BI__Spread_Statement_Record_Total__c'] ?? [])

  const periodFields = await getQueryableFields(conn, 'LLC_BI__Spread_Statement_Period__c')
  const periodFieldsFiltered = periodFields.filter((f) => f !== 'LLC_BI__Period_Key__c')
  const periodFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Spread_Statement_Period__c', 'LLC_BI__Spread_Statement_Type__c'
  )
  logInfo(`Querying periods: typeIds=${typeIds.length}, filterField=${periodFilterField}`)
  await extractChunked(
    'LLC_BI__Spread_Statement_Period__c',
    periodFieldsFiltered,
    periodFilterField,
    typeIds
  )
  const periodIds = pluckIds(records['LLC_BI__Spread_Statement_Period__c'] ?? [])
  logInfo(`Period result: ${periodIds.length} periodIds`)

  // ─── Phase 5: Records ──────────────────────────────────────────────────────

  logInfo('Phase 5 — Records')

  const recFields = await getQueryableFields(conn, 'LLC_BI__Spread_Statement_Record__c')
  const recFieldsFiltered = recFields.filter(
    (f) => f !== 'LLC_BI__Source_Row__c' && f !== 'LLC_BI__Cloned_Source_Row__c'
  )
  const recFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Spread_Statement_Record__c', 'LLC_BI__Spread_Statement_Type__c'
  )
  const statementRecords = await extractChunked(
    'LLC_BI__Spread_Statement_Record__c',
    recFieldsFiltered,
    recFilterField,
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

  // ─── Phase 6: Junctions and leaves ─────────────────────────────────────────

  logInfo('Phase 6 — Junctions and leaves')

  // 6. Record Values — streaming (high volume)
  const rvFields = await getQueryableFields(conn, 'LLC_BI__Spread_Statement_Record_Value__c')
  const rvFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Spread_Statement_Record_Value__c', 'LLC_BI__Spread_Statement_Period__c'
  )
  await extractStreaming(
    'LLC_BI__Spread_Statement_Record_Value__c',
    rvFields,
    rvFilterField,
    periodIds
  )

  // 7. Period Totals — streaming (high volume)
  const ptFields = await getQueryableFields(conn, 'LLC_BI__Spread_Statement_Period_Total__c')
  const ptFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Spread_Statement_Period_Total__c', 'LLC_BI__Spread_Statement_Period__c'
  )
  await extractStreaming(
    'LLC_BI__Spread_Statement_Period_Total__c',
    ptFields,
    ptFilterField,
    periodIds
  )

  // 8. Record Groups
  logInfo(`Querying record groups: recordIds=${recordIds.length}`)
  const rgFields = await getQueryableFields(conn, 'LLC_BI__Spread_Statement_Record_Group__c')
  const rgFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Spread_Statement_Record_Group__c', 'LLC_BI__Spread_Statement_Record__c'
  )
  await extractChunked(
    'LLC_BI__Spread_Statement_Record_Group__c',
    rgFields,
    rgFilterField,
    recordIds
  )

  // 9. Record Classifications
  const rcFields = await getQueryableFields(conn, 'LLC_BI__Spread_Record_Classification__c')
  const rcFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Spread_Record_Classification__c', 'LLC_BI__Spread_Statement_Record__c'
  )
  await extractChunked(
    'LLC_BI__Spread_Record_Classification__c',
    rcFields,
    rcFilterField,
    recordIds
  )

  // 10. Record Total Classifications
  const rtcFields = await getQueryableFields(conn, 'LLC_BI__Spread_Record_Total_Classification__c')
  const rtcFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Spread_Record_Total_Classification__c', 'LLC_BI__Spread_Statement_Record_Total__c'
  )
  await extractChunked(
    'LLC_BI__Spread_Record_Total_Classification__c',
    rtcFields,
    rtcFilterField,
    totalIds
  )

  // 11. Row Mappings
  const rmFields = await getQueryableFields(conn, 'LLC_BI__Spread_Statement_Row_Mapping__c')
  const rmFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Spread_Statement_Row_Mapping__c', 'LLC_BI__Underwriting_Bundle__c'
  )
  await extract(
    'LLC_BI__Spread_Statement_Row_Mapping__c',
    `SELECT ${rmFields.join(', ')} FROM LLC_BI__Spread_Statement_Row_Mapping__c WHERE ${rmFilterField} = '${bundleId}'`
  )

  // 12. Projection Bundle Junctions
  const pbjFields = await getQueryableFields(conn, 'LLC_BI__Projection_Bundle_Junction__c')
  const pbjFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Projection_Bundle_Junction__c', 'LLC_BI__Underwriting_Bundle__c'
  )
  await extract(
    'LLC_BI__Projection_Bundle_Junction__c',
    `SELECT ${pbjFields.join(', ')} FROM LLC_BI__Projection_Bundle_Junction__c WHERE ${pbjFilterField} = '${bundleId}'`
  )

  // 13. Period Consolidations
  const pcFields = await getQueryableFields(conn, 'LLC_BI__Period_Consolidation__c')
  const pcFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Period_Consolidation__c', 'LLC_BI__Spread_Statement_Period__c'
  )
  await extractChunked(
    'LLC_BI__Period_Consolidation__c',
    pcFields,
    pcFilterField,
    periodIds
  )

  // 14. Projections Drivers — streaming (high volume)
  const pdFields = await getQueryableFields(conn, 'LLC_BI__Spread_Projections_Driver__c')
  const pdFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Spread_Projections_Driver__c', 'LLC_BI__Spread_Statement_Record__c'
  )
  await extractStreaming(
    'LLC_BI__Spread_Projections_Driver__c',
    pdFields,
    pdFilterField,
    recordIds
  )

  // ─── Phase 7: Schedules ──────────────────────────────────────────────────

  logInfo('Phase 7 — Schedules')

  // 7a. LLC_BI__Schedule__c
  const schedFields = await getQueryableFields(conn, 'LLC_BI__Schedule__c')
  const schedFieldsFiltered = schedFields.filter((f) => f !== 'LLC_BI__Source_Schedule__c')
  const schedFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Schedule__c', 'LLC_BI__Underwriting_Bundle__c'
  )
  const schedules = await extract(
    'LLC_BI__Schedule__c',
    `SELECT ${schedFieldsFiltered.join(', ')} FROM LLC_BI__Schedule__c WHERE ${schedFilterField} = '${bundleId}'`
  )
  const scheduleIds = pluckIds(schedules)

  // 7b. LLC_BI__Schedule_Entry__c
  if (scheduleIds.length > 0) {
    const seFields = await getQueryableFields(conn, 'LLC_BI__Schedule_Entry__c')
    const seFilterField = await discoverRelationshipField(
      conn, 'LLC_BI__Schedule_Entry__c', 'LLC_BI__Schedule__c'
    )
    await extractChunked(
      'LLC_BI__Schedule_Entry__c',
      seFields,
      seFilterField,
      scheduleIds
    )
  } else {
    records['LLC_BI__Schedule_Entry__c'] = []
    emitProgress({ stage: 'extract', object: 'LLC_BI__Schedule_Entry__c', count: 0, status: 'success' })
    logInfo('LLC_BI__Schedule_Entry__c: 0 records (no schedules)')
  }

  // 7c. LLC_BI__Schedule_Section__c (Schedule-owned)
  if (scheduleIds.length > 0) {
    const ssFields = await getQueryableFields(conn, 'LLC_BI__Schedule_Section__c')
    const ssFieldsFiltered = ssFields.filter((f) => f !== 'LLC_BI__Source_Section__c')
    const ssFilterField = await discoverRelationshipField(
      conn, 'LLC_BI__Schedule_Section__c', 'LLC_BI__Schedule__c'
    )
    await extractChunked(
      'LLC_BI__Schedule_Section__c',
      ssFieldsFiltered,
      ssFilterField,
      scheduleIds
    )
  } else {
    records['LLC_BI__Schedule_Section__c'] = []
    emitProgress({ stage: 'extract', object: 'LLC_BI__Schedule_Section__c', count: 0, status: 'success' })
    logInfo('LLC_BI__Schedule_Section__c: 0 records (no schedules)')
  }

  // ─── Phase 8: Debt Schedules ──────────────────────────────────────────────

  logInfo('Phase 8 — Debt Schedules')

  // 8a. LLC_BI__Debt_Schedule__c
  const dsFields = await getQueryableFields(conn, 'LLC_BI__Debt_Schedule__c')
  const dsFieldsFiltered = dsFields.filter((f) => f !== 'LLC_BI__Source_Debt_Schedule__c')
  const dsFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Debt_Schedule__c', 'LLC_BI__Underwriting_Bundle__c'
  )
  const debtSchedules = await extract(
    'LLC_BI__Debt_Schedule__c',
    `SELECT ${dsFieldsFiltered.join(', ')} FROM LLC_BI__Debt_Schedule__c WHERE ${dsFilterField} = '${bundleId}'`
  )
  const debtScheduleIds = pluckIds(debtSchedules)

  // 8b. LLC_BI__Debt__c (parent debts — LLC_BI__Internal_Debt__c is null)
  if (debtScheduleIds.length > 0) {
    const debtFields = await getQueryableFields(conn, 'LLC_BI__Debt__c')
    const debtFieldsFiltered = debtFields.filter((f) => f !== 'LLC_BI__Source_Debt__c')
    const debtFilterField = await discoverRelationshipField(
      conn, 'LLC_BI__Debt__c', 'LLC_BI__Debt_Schedule__c'
    )
    const parentDebts = await queryAllChunked<SfRecord>(
      conn,
      debtFieldsFiltered,
      'LLC_BI__Debt__c',
      debtFilterField,
      debtScheduleIds
    )
    const parentDebtsOnly = parentDebts.filter((r) => !r.LLC_BI__Internal_Debt__c)
    records['LLC_BI__Debt__c'] = parentDebtsOnly
    emitProgress({ stage: 'extract', object: 'LLC_BI__Debt__c', count: parentDebtsOnly.length, status: 'success' })
    logInfo(`LLC_BI__Debt__c (parent): ${parentDebtsOnly.length} records`)

    // 8c. LLC_BI__Debt__c (child/internal debts)
    const parentDebtIds = pluckIds(parentDebtsOnly)
    if (parentDebtIds.length > 0) {
      const internalDebts = parentDebts.filter((r) => !!r.LLC_BI__Internal_Debt__c)
      records['LLC_BI__Debt_Internal__c'] = internalDebts
      emitProgress({ stage: 'extract', object: 'LLC_BI__Debt_Internal__c', count: internalDebts.length, status: 'success' })
      logInfo(`LLC_BI__Debt__c (internal): ${internalDebts.length} records`)
    } else {
      records['LLC_BI__Debt_Internal__c'] = []
      emitProgress({ stage: 'extract', object: 'LLC_BI__Debt_Internal__c', count: 0, status: 'success' })
      logInfo('LLC_BI__Debt__c (internal): 0 records (no parent debts)')
    }

    // 8d. LLC_BI__Schedule_Section__c (Debt Schedule-owned) — merge into existing
    const dssFields = await getQueryableFields(conn, 'LLC_BI__Schedule_Section__c')
    const dssFieldsFiltered = dssFields.filter((f) => f !== 'LLC_BI__Source_Section__c')
    const dssFilterField = await discoverRelationshipField(
      conn, 'LLC_BI__Schedule_Section__c', 'LLC_BI__Debt_Schedule__c'
    )
    const debtScheduleSections = await queryAllChunked<SfRecord>(
      conn,
      dssFieldsFiltered,
      'LLC_BI__Schedule_Section__c',
      dssFilterField,
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

  const laFields = await getQueryableFields(conn, 'LLC_BI__Loan_Assumptions__c')
  const laFilterField = await discoverRelationshipField(
    conn, 'LLC_BI__Loan_Assumptions__c', 'LLC_BI__Underwriting_Bundle__c'
  )
  await extract(
    'LLC_BI__Loan_Assumptions__c',
    `SELECT ${laFields.join(', ')} FROM LLC_BI__Loan_Assumptions__c WHERE ${laFilterField} = '${bundleId}'`
  )

  // ─── Build export ──────────────────────────────────────────────────────────

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
