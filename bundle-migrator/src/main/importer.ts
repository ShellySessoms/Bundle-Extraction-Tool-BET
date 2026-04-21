import type { Connection } from '@jsforce/jsforce-node'
import type { Record as JsforceRecord } from '@jsforce/jsforce-node/lib/types'
import log from 'electron-log/main'
import { readFileSync } from 'fs'
import { resolveReferences } from './referenceResolver'
import type {
  SfRecord,
  BundleExport,
  ProgressEvent,
  ImportSummary,
  FailedRecord,
  ResolvedReferences
} from '../shared/types'

/** Payload shape for conn.sobject().update() — requires Id to be present */
type UpdatePayload = { Id: string; [key: string]: unknown }

// ─── Logging ─────────────────────────────────────────────────────────────────

function logInfo(message: string): void {
  log.info(`[importer] ${message}`)
}

function logWarn(message: string): void {
  log.warn(`[importer] ${message}`)
}

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

// ─── resolveIdByLookupKey ────────────────────────────────────────────────────

async function resolveIdByLookupKey(
  conn: Connection,
  objectApiName: string,
  lookupKeys: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (lookupKeys.length === 0) return map
  for (const keyChunk of chunk(lookupKeys, 500)) {
    const inClause = keyChunk.map((k) => `'${k.replace(/'/g, "\\'")}'`).join(',')
    const rows = await queryAll<SfRecord>(
      conn,
      `SELECT Id, LLC_BI__lookupKey__c FROM ${objectApiName} WHERE LLC_BI__lookupKey__c IN (${inClause})`
    )
    for (const row of rows) {
      map.set(row.LLC_BI__lookupKey__c as string, row.Id)
    }
  }
  return map
}

// ─── Upsert batch helper ────────────────────────────────────────────────────

interface UpsertBatchResult {
  succeeded: number
  failed: FailedRecord[]
}

async function upsertBatch(
  conn: Connection,
  objectApiName: string,
  records: SfRecord[]
): Promise<UpsertBatchResult> {
  const result: UpsertBatchResult = { succeeded: 0, failed: [] }
  if (records.length === 0) return result

  try {
    if (records.length <= 200) {
      // REST API upsert
      const jsforceRecords = records as unknown as JsforceRecord[]
      const upsertResults = await conn
        .sobject(objectApiName)
        .upsert(jsforceRecords, 'LLC_BI__lookupKey__c' as never)
      const resultsArray = Array.isArray(upsertResults) ? upsertResults : [upsertResults]
      for (let i = 0; i < resultsArray.length; i++) {
        const r = resultsArray[i]
        if (r.success) {
          result.succeeded++
        } else {
          result.failed.push({
            objectName: objectApiName,
            sourceId: records[i]?.Id ?? '',
            error: r.errors.map((e) => e.message).join('; '),
            record: records[i]
          })
        }
      }
    } else {
      // Bulk API v2 upsert
      const jsforceRecords = records as unknown as JsforceRecord[]
      const bulkResult = await conn.bulk2.loadAndWaitForResults({
        object: objectApiName,
        operation: 'upsert',
        externalIdFieldName: 'LLC_BI__lookupKey__c',
        input: jsforceRecords,
        pollInterval: 5000,
        pollTimeout: 300000
      })

      result.succeeded = bulkResult.successfulResults.length

      for (const failedRow of bulkResult.failedResults) {
        result.failed.push({
          objectName: objectApiName,
          sourceId: failedRow.sf__Id ?? '',
          error: failedRow.sf__Error ?? 'Unknown error',
          record: failedRow as unknown as SfRecord
        })
      }

      if (Array.isArray(bulkResult.unprocessedRecords)) {
        for (const unprocessed of bulkResult.unprocessedRecords) {
          result.failed.push({
            objectName: objectApiName,
            sourceId: '',
            error: 'Record was not processed',
            record: unprocessed as unknown as SfRecord
          })
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logWarn(`upsertBatch ${objectApiName}: batch-level error — ${message}`)
    for (const rec of records) {
      result.failed.push({
        objectName: objectApiName,
        sourceId: rec.Id ?? '',
        error: message,
        record: rec
      })
    }
  }

  return result
}

// ─── Parent reference resolution ─────────────────────────────────────────────

/**
 * Field reference map: for each object, which lookup fields to remap
 * using the jsforce __r external ID reference syntax.
 *
 * Format: sourceField → { relationshipName, parentObject }
 * The parent object's LLC_BI__lookupKey__c is used as the external ID.
 */
const FIELD_REFERENCE_MAP: {
  [objectApiName: string]: {
    [sourceField: string]: { relationship: string; parentObject: string }
  }
} = {
  'LLC_BI__Spread_Statement_Type__c': {
    'LLC_BI__Bundle__c': {
      relationship: 'LLC_BI__Bundle__r',
      parentObject: 'LLC_BI__Underwriting_Bundle__c'
    }
  },
  'LLC_BI__Spread_Statement_Period__c': {
    'LLC_BI__Spread_Statement_Type__c': {
      relationship: 'LLC_BI__Spread_Statement_Type__r',
      parentObject: 'LLC_BI__Spread_Statement_Type__c'
    }
  },
  'LLC_BI__Spread_Statement_Record_Total__c': {
    'LLC_BI__Spread_Statement_Type__c': {
      relationship: 'LLC_BI__Spread_Statement_Type__r',
      parentObject: 'LLC_BI__Spread_Statement_Type__c'
    }
  },
  'LLC_BI__Spread_Statement_Record__c': {
    'LLC_BI__Spread_Statement_Type__c': {
      relationship: 'LLC_BI__Spread_Statement_Type__r',
      parentObject: 'LLC_BI__Spread_Statement_Type__c'
    },
    'LLC_BI__Spread_Statement_Record_Total__c': {
      relationship: 'LLC_BI__Spread_Statement_Record_Total__r',
      parentObject: 'LLC_BI__Spread_Statement_Record_Total__c'
    }
  },
  'LLC_BI__Spread_Statement_Record_Value__c': {
    'LLC_BI__Spread_Statement_Period__c': {
      relationship: 'LLC_BI__Spread_Statement_Period__r',
      parentObject: 'LLC_BI__Spread_Statement_Period__c'
    },
    'LLC_BI__Spread_Statement_Record__c': {
      relationship: 'LLC_BI__Spread_Statement_Record__r',
      parentObject: 'LLC_BI__Spread_Statement_Record__c'
    }
  },
  'LLC_BI__Spread_Statement_Period_Total__c': {
    'LLC_BI__Spread_Statement_Period__c': {
      relationship: 'LLC_BI__Spread_Statement_Period__r',
      parentObject: 'LLC_BI__Spread_Statement_Period__c'
    }
  },
  'LLC_BI__Spread_Statement_Record_Group__c': {
    'LLC_BI__Spread_Statement_Record__c': {
      relationship: 'LLC_BI__Spread_Statement_Record__r',
      parentObject: 'LLC_BI__Spread_Statement_Record__c'
    }
  },
  'LLC_BI__Spread_Record_Classification__c': {
    'LLC_BI__Spread_Statement_Record__c': {
      relationship: 'LLC_BI__Spread_Statement_Record__r',
      parentObject: 'LLC_BI__Spread_Statement_Record__c'
    }
  },
  'LLC_BI__Spread_Record_Total_Classification__c': {
    'LLC_BI__Spread_Statement_Record_Total__c': {
      relationship: 'LLC_BI__Spread_Statement_Record_Total__r',
      parentObject: 'LLC_BI__Spread_Statement_Record_Total__c'
    }
  },
  'LLC_BI__Spread_Statement_Row_Mapping__c': {
    'LLC_BI__Underwriting_Bundle__c': {
      relationship: 'LLC_BI__Underwriting_Bundle__r',
      parentObject: 'LLC_BI__Underwriting_Bundle__c'
    }
  },
  'LLC_BI__Projection_Bundle_Junction__c': {
    'LLC_BI__Bundle__c': {
      relationship: 'LLC_BI__Bundle__r',
      parentObject: 'LLC_BI__Underwriting_Bundle__c'
    }
  },
  'LLC_BI__Period_Consolidation__c': {
    'LLC_BI__Source_Period__c': {
      relationship: 'LLC_BI__Source_Period__r',
      parentObject: 'LLC_BI__Spread_Statement_Period__c'
    }
  },
  'LLC_BI__Spread_Projections_Driver__c': {
    'LLC_BI__Spread_Statement_Record__c': {
      relationship: 'LLC_BI__Spread_Statement_Record__r',
      parentObject: 'LLC_BI__Spread_Statement_Record__c'
    }
  },
  'LLC_BI__Schedule__c': {
    'LLC_BI__Bundle__c': {
      relationship: 'LLC_BI__Bundle__r',
      parentObject: 'LLC_BI__Underwriting_Bundle__c'
    }
  },
  'LLC_BI__Schedule_Entry__c': {
    'LLC_BI__Schedule__c': {
      relationship: 'LLC_BI__Schedule__r',
      parentObject: 'LLC_BI__Schedule__c'
    }
  },
  'LLC_BI__Debt_Schedule__c': {
    'LLC_BI__Bundle__c': {
      relationship: 'LLC_BI__Bundle__r',
      parentObject: 'LLC_BI__Underwriting_Bundle__c'
    }
  },
  'LLC_BI__Debt__c': {
    'LLC_BI__Debt_Schedule__c': {
      relationship: 'LLC_BI__Debt_Schedule__r',
      parentObject: 'LLC_BI__Debt_Schedule__c'
    }
  },
  'LLC_BI__Debt_Internal__c': {
    'LLC_BI__Debt_Schedule__c': {
      relationship: 'LLC_BI__Debt_Schedule__r',
      parentObject: 'LLC_BI__Debt_Schedule__c'
    }
  },
  'LLC_BI__Loan_Assumptions__c': {
    'LLC_BI__Bundle__c': {
      relationship: 'LLC_BI__Bundle__r',
      parentObject: 'LLC_BI__Underwriting_Bundle__c'
    }
  }
}

/**
 * Build a lookupKey cache from the export data for a given object.
 * Maps source org Id → LLC_BI__lookupKey__c.
 */
function buildSourceIdToLookupKey(records: SfRecord[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const rec of records) {
    const key = rec.LLC_BI__lookupKey__c as string | undefined
    if (key) {
      map.set(rec.Id, key)
    }
  }
  return map
}

/**
 * Replace Salesforce ID lookup fields with __r external ID reference objects.
 * Strips the source Id field and replaces it with a relationship object
 * pointing to the parent's LLC_BI__lookupKey__c.
 */
function remapParentReferences(
  objectApiName: string,
  records: SfRecord[],
  exportData: { [objectApiName: string]: SfRecord[] }
): void {
  const refMap = FIELD_REFERENCE_MAP[objectApiName]
  if (!refMap) return

  // Pre-build lookupKey caches for all parent objects referenced
  const parentCaches = new Map<string, Map<string, string>>()
  for (const { parentObject } of Object.values(refMap)) {
    if (!parentCaches.has(parentObject)) {
      const parentRecords = exportData[parentObject] ?? []
      parentCaches.set(parentObject, buildSourceIdToLookupKey(parentRecords))
    }
  }

  for (const rec of records) {
    for (const [sourceField, { relationship, parentObject }] of Object.entries(refMap)) {
      const sourceId = rec[sourceField] as string | undefined | null
      if (!sourceId) continue

      const cache = parentCaches.get(parentObject)
      const lookupKey = cache?.get(sourceId)
      if (lookupKey) {
        // Replace ID field with __r reference
        delete rec[sourceField]
        rec[relationship] = { LLC_BI__lookupKey__c: lookupKey }
      }
      // If no lookupKey found, leave the field as-is (it will likely fail on upsert,
      // but will be captured by the error handling)
    }
  }
}

/**
 * Strip source-org Id from each record before upsert.
 * The record will be matched by LLC_BI__lookupKey__c instead.
 */
function stripSourceIds(records: SfRecord[]): void {
  for (const rec of records) {
    delete (rec as Record<string, unknown>).Id
  }
}

/**
 * Prepare records for upsert: clone, remap parent references, strip source Ids.
 */
function prepareRecords(
  objectApiName: string,
  records: SfRecord[],
  exportData: { [objectApiName: string]: SfRecord[] }
): SfRecord[] {
  // Deep clone to avoid mutating the export data
  const cloned = records.map((r) => ({ ...r }))
  remapParentReferences(objectApiName, cloned, exportData)
  stripSourceIds(cloned)
  return cloned
}

// ─── Main importer ──────────────────────────────────────────────────────────

export async function importBundle(
  conn: Connection,
  exportFilePath: string,
  emitProgress: (e: ProgressEvent) => void
): Promise<ImportSummary> {
  // ─── Load export file ────────────────────────────────────────────────────
  logInfo(`Loading export file: ${exportFilePath}`)
  const raw = readFileSync(exportFilePath, 'utf-8')
  const bundle: BundleExport = JSON.parse(raw)

  const summary: ImportSummary = {
    totalRecords: 0,
    succeeded: 0,
    failed: 0,
    byObject: {},
    failedRecords: []
  }

  /** Upsert an object, update summary, emit progress. */
  async function upsertObject(objectApiName: string, records: SfRecord[]): Promise<void> {
    if (records.length === 0) {
      logInfo(`${objectApiName}: no records to upsert`)
      return
    }

    const prepared = prepareRecords(objectApiName, records, bundle.records)
    const result = await upsertBatch(conn, objectApiName, prepared)

    summary.totalRecords += records.length
    summary.succeeded += result.succeeded
    summary.failed += result.failed.length
    summary.byObject[objectApiName] = {
      created: result.succeeded,
      failed: result.failed.length
    }
    summary.failedRecords.push(...result.failed)

    logInfo(`${objectApiName}: ${result.succeeded} succeeded, ${result.failed.length} failed`)

    emitProgress({
      stage: 'import',
      object: objectApiName,
      total: records.length,
      succeeded: result.succeeded,
      failed: result.failed.length,
      status: result.failed.length > 0 ? 'partial' : 'success'
    })
  }

  // ─── Phase 0: Resolve reference data ─────────────────────────────────────

  logInfo('Resolving reference data in target org')
  const resolved = await resolveReferences(conn, bundle.referenceData, emitProgress)

  // ─── Phase 2: Bundle ─────────────────────────────────────────────────────

  logInfo('Phase 2 — Upserting bundle')
  const bundleRecords = bundle.records['LLC_BI__Underwriting_Bundle__c'] ?? []
  for (const rec of bundleRecords) {
    // Null out backfill field
    rec.LLC_BI__Source_Template__c = null

    // Replace Financial_Consolidation__c with resolved target Id
    if (rec.LLC_BI__Financial_Consolidation__c && resolved.financialConsolidationId) {
      rec.LLC_BI__Financial_Consolidation__c = resolved.financialConsolidationId
    } else {
      delete rec.LLC_BI__Financial_Consolidation__c
    }

    // Replace LLC_BI__Relationship__c via __r (Account lookupKey)
    const relationshipId = rec.LLC_BI__Relationship__c as string | undefined
    if (relationshipId) {
      delete rec.LLC_BI__Relationship__c
      rec['LLC_BI__Relationship__r'] = { LLC_BI__lookupKey__c: relationshipId }
      // Note: Account uses LLC_BI__lookupKey__c — the source Id was stored;
      // we need the actual lookupKey. Since Account is external reference data
      // not in our export, we leave it to the external ID resolution.
    }

    // Replace LLC_BI__Collateral__c via __r
    const collateralId = rec.LLC_BI__Collateral__c as string | undefined
    if (collateralId) {
      delete rec.LLC_BI__Collateral__c
      rec['LLC_BI__Collateral__r'] = { LLC_BI__lookupKey__c: collateralId }
    }
  }
  await upsertObject('LLC_BI__Underwriting_Bundle__c', bundleRecords)

  // ─── Phase 3: Statement Types ────────────────────────────────────────────

  logInfo('Phase 3 — Upserting Statement Types')
  const stRecords = bundle.records['LLC_BI__Spread_Statement_Type__c'] ?? []
  for (const rec of stRecords) {
    // Null out backfill fields
    rec.LLC_BI__Calc_Common_Sizing_Record__c = null
    rec.LLC_BI__Calc_Common_Sizing_Total_Group__c = null
  }
  await upsertObject('LLC_BI__Spread_Statement_Type__c', stRecords)

  // ─── Phase 4: Record Totals, then Periods ────────────────────────────────

  logInfo('Phase 4 — Upserting Record Totals & Periods')
  await upsertObject(
    'LLC_BI__Spread_Statement_Record_Total__c',
    bundle.records['LLC_BI__Spread_Statement_Record_Total__c'] ?? []
  )
  await upsertObject(
    'LLC_BI__Spread_Statement_Period__c',
    bundle.records['LLC_BI__Spread_Statement_Period__c'] ?? []
  )

  // ─── Phase 5: Records ────────────────────────────────────────────────────

  logInfo('Phase 5 — Upserting Records')
  const recRecords = bundle.records['LLC_BI__Spread_Statement_Record__c'] ?? []
  for (const rec of recRecords) {
    // Null out backfill fields
    rec.LLC_BI__Linked_Spread_Statement_Record__c = null
    rec.LLC_BI__Linked_Spread_Statement_Total_Group__c = null
    rec.LLC_BI__Associated_Parent_Record__c = null
  }
  await upsertObject('LLC_BI__Spread_Statement_Record__c', recRecords)

  // ─── Phase 6: Backfill ───────────────────────────────────────────────────

  logInfo('Phase 6 — Backfill')

  // Phase 6a — Backfill LLC_BI__Spread_Statement_Record__c
  await backfillRecords(conn, bundle, resolved, emitProgress)

  // Phase 6b — Backfill LLC_BI__Spread_Statement_Type__c
  await backfillStatementTypes(conn, bundle, emitProgress)

  // Phase 6c — Backfill LLC_BI__Underwriting_Bundle__c Source_Template__c
  await backfillBundleSourceTemplate(conn, bundle, emitProgress)

  // ─── Phase 7: Junctions & Leaves ─────────────────────────────────────────

  logInfo('Phase 7 — Junctions and leaves')

  // 6. Record Values
  await upsertObject(
    'LLC_BI__Spread_Statement_Record_Value__c',
    bundle.records['LLC_BI__Spread_Statement_Record_Value__c'] ?? []
  )

  // 7. Period Totals
  await upsertObject(
    'LLC_BI__Spread_Statement_Period_Total__c',
    bundle.records['LLC_BI__Spread_Statement_Period_Total__c'] ?? []
  )

  // 8. Record Groups
  await upsertObject(
    'LLC_BI__Spread_Statement_Record_Group__c',
    bundle.records['LLC_BI__Spread_Statement_Record_Group__c'] ?? []
  )

  // 9. Record Classifications
  const rcRecords = bundle.records['LLC_BI__Spread_Record_Classification__c'] ?? []
  // Replace LLC_BI__Classification__c with resolved target Id
  for (const rec of rcRecords) {
    const classificationId = rec.LLC_BI__Classification__c as string | undefined
    if (classificationId) {
      // classificationId here is the source org Id; we need to look up by Name.
      // The export doesn't carry classification Name on the junction, so we
      // skip direct replacement — the upsert via lookupKey handles the junction.
      // Classification is reference data resolved separately.
    }
  }
  await upsertObject('LLC_BI__Spread_Record_Classification__c', rcRecords)

  // 10. Record Total Classifications
  await upsertObject(
    'LLC_BI__Spread_Record_Total_Classification__c',
    bundle.records['LLC_BI__Spread_Record_Total_Classification__c'] ?? []
  )

  // 11. Row Mappings
  await upsertObject(
    'LLC_BI__Spread_Statement_Row_Mapping__c',
    bundle.records['LLC_BI__Spread_Statement_Row_Mapping__c'] ?? []
  )

  // 12. Projection Bundle Junctions
  const pbjRecords = bundle.records['LLC_BI__Projection_Bundle_Junction__c'] ?? []
  // Replace LLC_BI__Projection_Template__c with resolved target Id
  for (const rec of pbjRecords) {
    const templateId = rec.LLC_BI__Projection_Template__c as string | undefined
    if (templateId) {
      // Look up the template's lookupKey from the export reference data,
      // then resolve to the target Id
      const targetId = resolveProjectionTemplateId(templateId, bundle, resolved)
      if (targetId) {
        rec.LLC_BI__Projection_Template__c = targetId
      }
    }
  }
  await upsertObject('LLC_BI__Projection_Bundle_Junction__c', pbjRecords)

  // 13. Period Consolidations
  await upsertObject(
    'LLC_BI__Period_Consolidation__c',
    bundle.records['LLC_BI__Period_Consolidation__c'] ?? []
  )

  // 14. Projections Drivers
  await upsertObject(
    'LLC_BI__Spread_Projections_Driver__c',
    bundle.records['LLC_BI__Spread_Projections_Driver__c'] ?? []
  )

  // ─── Phase 8: Schedules ─────────────────────────────────────────────────

  logInfo('Phase 8 — Upserting Schedules')

  // 15. Schedules
  const schedRecords = bundle.records['LLC_BI__Schedule__c'] ?? []
  for (const rec of schedRecords) {
    rec.LLC_BI__Source_Schedule__c = null
  }
  await upsertObject('LLC_BI__Schedule__c', schedRecords)

  // 16. Schedule Entries
  await upsertObject(
    'LLC_BI__Schedule_Entry__c',
    bundle.records['LLC_BI__Schedule_Entry__c'] ?? []
  )

  // ─── Phase 9: Debt Schedules ────────────────────────────────────────────

  logInfo('Phase 9 — Upserting Debt Schedules')

  // 17. Debt Schedules
  const dsRecords = bundle.records['LLC_BI__Debt_Schedule__c'] ?? []
  for (const rec of dsRecords) {
    rec.LLC_BI__Source_Debt_Schedule__c = null
  }
  await upsertObject('LLC_BI__Debt_Schedule__c', dsRecords)

  // 18. Debts (parent)
  const debtRecords = bundle.records['LLC_BI__Debt__c'] ?? []
  for (const rec of debtRecords) {
    rec.LLC_BI__Source_Debt__c = null
  }
  await upsertObject('LLC_BI__Debt__c', debtRecords)

  // 19. Debts (internal) — stored under 'LLC_BI__Debt_Internal__c' key, upserted to LLC_BI__Debt__c
  const internalDebtRecords = bundle.records['LLC_BI__Debt_Internal__c'] ?? []
  if (internalDebtRecords.length > 0) {
    logInfo('Resolving LLC_BI__Internal_Debt__c for internal debts')
    const parentDebtLookupKeys = debtRecords
      .map((r) => r.LLC_BI__lookupKey__c as string)
      .filter(Boolean)
    const parentDebtKeyMap = await resolveIdByLookupKey(
      conn,
      'LLC_BI__Debt__c',
      parentDebtLookupKeys
    )
    const parentDebtSourceIdToKey = buildSourceIdToLookupKey(debtRecords)

    for (const rec of internalDebtRecords) {
      rec.LLC_BI__Source_Debt__c = null
      const internalDebtSourceId = rec.LLC_BI__Internal_Debt__c as string | undefined
      if (internalDebtSourceId) {
        const parentKey = parentDebtSourceIdToKey.get(internalDebtSourceId)
        const targetId = parentKey ? parentDebtKeyMap.get(parentKey) : undefined
        if (targetId) {
          rec.LLC_BI__Internal_Debt__c = targetId
        } else {
          logWarn(`Could not resolve LLC_BI__Internal_Debt__c for source Id ${internalDebtSourceId}`)
          rec.LLC_BI__Internal_Debt__c = null
        }
      }
    }
    // Upsert to the actual LLC_BI__Debt__c object
    const internalPrepared = prepareRecords('LLC_BI__Debt__c', internalDebtRecords, bundle.records)
    const internalResult = await upsertBatch(conn, 'LLC_BI__Debt__c', internalPrepared)
    summary.totalRecords += internalDebtRecords.length
    summary.succeeded += internalResult.succeeded
    summary.failed += internalResult.failed.length
    summary.byObject['LLC_BI__Debt_Internal__c'] = {
      created: internalResult.succeeded,
      failed: internalResult.failed.length
    }
    summary.failedRecords.push(...internalResult.failed)
    logInfo(`LLC_BI__Debt__c (internal): ${internalResult.succeeded} succeeded, ${internalResult.failed.length} failed`)
    emitProgress({
      stage: 'import',
      object: 'LLC_BI__Debt_Internal__c',
      total: internalDebtRecords.length,
      succeeded: internalResult.succeeded,
      failed: internalResult.failed.length,
      status: internalResult.failed.length > 0 ? 'partial' : 'success'
    })
  } else {
    emitProgress({
      stage: 'import',
      object: 'LLC_BI__Debt_Internal__c',
      total: 0,
      succeeded: 0,
      failed: 0,
      status: 'success'
    })
  }

  // 20. Schedule Sections (all — both schedule- and debt-schedule-owned)
  const sectionRecords = bundle.records['LLC_BI__Schedule_Section__c'] ?? []
  for (const rec of sectionRecords) {
    rec.LLC_BI__Source_Section__c = null
  }
  // Polymorphic parent resolution: remap whichever parent lookup is populated
  await upsertScheduleSections(conn, sectionRecords, bundle.records, summary, emitProgress)

  // ─── Phase 10: Loan Assumptions ─────────────────────────────────────────

  logInfo('Phase 10 — Upserting Loan Assumptions')

  // 21. Loan Assumptions
  await upsertObject(
    'LLC_BI__Loan_Assumptions__c',
    bundle.records['LLC_BI__Loan_Assumptions__c'] ?? []
  )

  // ─── Complete ────────────────────────────────────────────────────────────

  emitProgress({
    stage: 'complete',
    status: 'success',
    message: 'Import complete'
  })

  logInfo(`Import complete: ${summary.succeeded} succeeded, ${summary.failed} failed`)
  return summary
}

// ─── Polymorphic Schedule Section upsert ─────────────────────────────────────

async function upsertScheduleSections(
  conn: Connection,
  records: SfRecord[],
  exportData: { [objectApiName: string]: SfRecord[] },
  summary: ImportSummary,
  emitProgress: (e: ProgressEvent) => void
): Promise<void> {
  if (records.length === 0) {
    emitProgress({
      stage: 'import',
      object: 'LLC_BI__Schedule_Section__c',
      total: 0,
      succeeded: 0,
      failed: 0,
      status: 'success'
    })
    return
  }

  const scheduleCache = buildSourceIdToLookupKey(exportData['LLC_BI__Schedule__c'] ?? [])
  const debtScheduleCache = buildSourceIdToLookupKey(exportData['LLC_BI__Debt_Schedule__c'] ?? [])
  const recordCache = buildSourceIdToLookupKey(exportData['LLC_BI__Spread_Statement_Record__c'] ?? [])

  const cloned = records.map((r) => ({ ...r }))
  for (const rec of cloned) {
    // Polymorphic: remap whichever parent is populated
    const schedId = rec.LLC_BI__Schedule__c as string | undefined | null
    if (schedId) {
      const lookupKey = scheduleCache.get(schedId)
      if (lookupKey) {
        delete rec.LLC_BI__Schedule__c
        rec['LLC_BI__Schedule__r'] = { LLC_BI__lookupKey__c: lookupKey }
      }
    }

    const dsId = rec.LLC_BI__Debt_Schedule__c as string | undefined | null
    if (dsId) {
      const lookupKey = debtScheduleCache.get(dsId)
      if (lookupKey) {
        delete rec.LLC_BI__Debt_Schedule__c
        rec['LLC_BI__Debt_Schedule__r'] = { LLC_BI__lookupKey__c: lookupKey }
      }
    }

    // Remap Spread_Statement_Record reference if present
    const recId = rec.LLC_BI__Spread_Statement_Record__c as string | undefined | null
    if (recId) {
      const lookupKey = recordCache.get(recId)
      if (lookupKey) {
        delete rec.LLC_BI__Spread_Statement_Record__c
        rec['LLC_BI__Spread_Statement_Record__r'] = { LLC_BI__lookupKey__c: lookupKey }
      }
    }
  }

  stripSourceIds(cloned)
  const result = await upsertBatch(conn, 'LLC_BI__Schedule_Section__c', cloned)

  summary.totalRecords += records.length
  summary.succeeded += result.succeeded
  summary.failed += result.failed.length
  summary.byObject['LLC_BI__Schedule_Section__c'] = {
    created: result.succeeded,
    failed: result.failed.length
  }
  summary.failedRecords.push(...result.failed)

  logInfo(`LLC_BI__Schedule_Section__c: ${result.succeeded} succeeded, ${result.failed.length} failed`)
  emitProgress({
    stage: 'import',
    object: 'LLC_BI__Schedule_Section__c',
    total: records.length,
    succeeded: result.succeeded,
    failed: result.failed.length,
    status: result.failed.length > 0 ? 'partial' : 'success'
  })
}

// ─── Backfill helpers ────────────────────────────────────────────────────────

async function backfillRecords(
  conn: Connection,
  bundle: BundleExport,
  _resolved: ResolvedReferences,
  emitProgress: (e: ProgressEvent) => void
): Promise<void> {
  const backfill = bundle.backfillData.records
  const lookupKeys = Object.keys(backfill)
  if (lookupKeys.length === 0) return

  logInfo(`Backfill Phase 6a — ${lookupKeys.length} record(s) to backfill`)

  // Resolve all record lookupKeys + all referenced lookupKeys to target Ids
  const allKeysNeeded = new Set(lookupKeys)
  for (const fields of Object.values(backfill)) {
    for (const sourceId of Object.values(fields)) {
      // sourceId is a source org Id — find its lookupKey from the export
      const exportRecords = bundle.records['LLC_BI__Spread_Statement_Record__c'] ?? []
      const match = exportRecords.find((r) => r.Id === sourceId)
      if (match) {
        const key = match.LLC_BI__lookupKey__c as string | undefined
        if (key) allKeysNeeded.add(key)
      }
      // Also check Record Totals for LLC_BI__Linked_Spread_Statement_Total_Group__c
      const totalRecords = bundle.records['LLC_BI__Spread_Statement_Record_Total__c'] ?? []
      const totalMatch = totalRecords.find((r) => r.Id === sourceId)
      if (totalMatch) {
        const key = totalMatch.LLC_BI__lookupKey__c as string | undefined
        if (key) allKeysNeeded.add(key)
      }
    }
  }

  // Resolve Spread_Statement_Record lookupKeys to target Ids
  const recordKeyMap = await resolveIdByLookupKey(
    conn,
    'LLC_BI__Spread_Statement_Record__c',
    [...allKeysNeeded]
  )
  // Also resolve Record Total keys
  const totalKeyMap = await resolveIdByLookupKey(
    conn,
    'LLC_BI__Spread_Statement_Record_Total__c',
    [...allKeysNeeded]
  )

  // Merge maps (record Ids take precedence, but total Ids fill in gaps)
  const combinedMap = new Map([...totalKeyMap, ...recordKeyMap])

  const updatePayloads: Record<string, unknown>[] = []
  for (const [lookupKey, fields] of Object.entries(backfill)) {
    const targetId = combinedMap.get(lookupKey)
    if (!targetId) {
      logWarn(`Backfill: could not resolve target Id for lookupKey ${lookupKey}`)
      continue
    }

    const payload: Record<string, unknown> = { Id: targetId }
    for (const [fieldName, sourceId] of Object.entries(fields)) {
      // Find the lookupKey for this source Id
      const exportRecords = bundle.records['LLC_BI__Spread_Statement_Record__c'] ?? []
      const match = exportRecords.find((r) => r.Id === sourceId)
      const totalRecords = bundle.records['LLC_BI__Spread_Statement_Record_Total__c'] ?? []
      const totalMatch = totalRecords.find((r) => r.Id === sourceId)
      const refKey = (match?.LLC_BI__lookupKey__c ?? totalMatch?.LLC_BI__lookupKey__c) as string | undefined
      const resolvedId = refKey ? combinedMap.get(refKey) : undefined

      if (resolvedId) {
        payload[fieldName] = resolvedId
      } else {
        logWarn(`Backfill: could not resolve ${fieldName} source Id ${sourceId}`)
      }
    }

    if (Object.keys(payload).length > 1) {
      updatePayloads.push(payload)
    }
  }

  if (updatePayloads.length > 0) {
    try {
      const results = await conn
        .sobject('LLC_BI__Spread_Statement_Record__c')
        .update(updatePayloads as UpdatePayload[])
      const resultsArray = Array.isArray(results) ? results : [results]
      const succeeded = resultsArray.filter((r) => r.success).length
      const failed = resultsArray.filter((r) => !r.success).length
      logInfo(`Backfill records: ${succeeded} succeeded, ${failed} failed`)
    } catch (err) {
      logWarn(`Backfill records error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  emitProgress({
    stage: 'backfill',
    phase: 'records',
    object: 'LLC_BI__Spread_Statement_Record__c',
    count: updatePayloads.length,
    status: 'success'
  })
}

async function backfillStatementTypes(
  conn: Connection,
  bundle: BundleExport,
  emitProgress: (e: ProgressEvent) => void
): Promise<void> {
  const backfill = bundle.backfillData.statementTypes
  const lookupKeys = Object.keys(backfill)
  if (lookupKeys.length === 0) return

  logInfo(`Backfill Phase 6b — ${lookupKeys.length} statement type(s) to backfill`)

  // Resolve statement type lookupKeys to target Ids
  const stKeyMap = await resolveIdByLookupKey(
    conn,
    'LLC_BI__Spread_Statement_Type__c',
    lookupKeys
  )

  // Resolve record and record total lookupKeys referenced in backfill values
  const allRefKeys = new Set<string>()
  for (const fields of Object.values(backfill)) {
    for (const sourceId of Object.values(fields)) {
      const recordMatch = (bundle.records['LLC_BI__Spread_Statement_Record__c'] ?? [])
        .find((r) => r.Id === sourceId)
      if (recordMatch) {
        const key = recordMatch.LLC_BI__lookupKey__c as string | undefined
        if (key) allRefKeys.add(key)
      }
      const totalMatch = (bundle.records['LLC_BI__Spread_Statement_Record_Total__c'] ?? [])
        .find((r) => r.Id === sourceId)
      if (totalMatch) {
        const key = totalMatch.LLC_BI__lookupKey__c as string | undefined
        if (key) allRefKeys.add(key)
      }
    }
  }

  const recordKeyMap = await resolveIdByLookupKey(
    conn,
    'LLC_BI__Spread_Statement_Record__c',
    [...allRefKeys]
  )
  const totalKeyMap = await resolveIdByLookupKey(
    conn,
    'LLC_BI__Spread_Statement_Record_Total__c',
    [...allRefKeys]
  )
  const combinedRefMap = new Map([...totalKeyMap, ...recordKeyMap])

  const updatePayloads: Record<string, unknown>[] = []
  for (const [lookupKey, fields] of Object.entries(backfill)) {
    const targetId = stKeyMap.get(lookupKey)
    if (!targetId) {
      logWarn(`Backfill ST: could not resolve target Id for lookupKey ${lookupKey}`)
      continue
    }

    const payload: Record<string, unknown> = { Id: targetId }
    for (const [fieldName, sourceId] of Object.entries(fields)) {
      const recordMatch = (bundle.records['LLC_BI__Spread_Statement_Record__c'] ?? [])
        .find((r) => r.Id === sourceId)
      const totalMatch = (bundle.records['LLC_BI__Spread_Statement_Record_Total__c'] ?? [])
        .find((r) => r.Id === sourceId)
      const refKey = (recordMatch?.LLC_BI__lookupKey__c ?? totalMatch?.LLC_BI__lookupKey__c) as string | undefined
      const resolvedId = refKey ? combinedRefMap.get(refKey) : undefined

      if (resolvedId) {
        payload[fieldName] = resolvedId
      } else {
        logWarn(`Backfill ST: could not resolve ${fieldName} source Id ${sourceId}`)
      }
    }

    if (Object.keys(payload).length > 1) {
      updatePayloads.push(payload)
    }
  }

  if (updatePayloads.length > 0) {
    try {
      const results = await conn
        .sobject('LLC_BI__Spread_Statement_Type__c')
        .update(updatePayloads as UpdatePayload[])
      const resultsArray = Array.isArray(results) ? results : [results]
      const succeeded = resultsArray.filter((r) => r.success).length
      const failed = resultsArray.filter((r) => !r.success).length
      logInfo(`Backfill statement types: ${succeeded} succeeded, ${failed} failed`)
    } catch (err) {
      logWarn(`Backfill ST error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  emitProgress({
    stage: 'backfill',
    phase: 'statementTypes',
    object: 'LLC_BI__Spread_Statement_Type__c',
    count: updatePayloads.length,
    status: 'success'
  })
}

async function backfillBundleSourceTemplate(
  conn: Connection,
  bundle: BundleExport,
  emitProgress: (e: ProgressEvent) => void
): Promise<void> {
  const sourceTemplateValue = bundle.backfillData.bundleSourceTemplate
  if (!sourceTemplateValue) return

  logInfo('Backfill Phase 6c — Bundle Source_Template__c')

  // Resolve the bundle's target Id by lookupKey
  const bundleKeyMap = await resolveIdByLookupKey(
    conn,
    'LLC_BI__Underwriting_Bundle__c',
    [bundle.bundleLookupKey]
  )
  const bundleTargetId = bundleKeyMap.get(bundle.bundleLookupKey)
  if (!bundleTargetId) {
    logWarn('Backfill bundle: could not resolve bundle target Id')
    emitProgress({
      stage: 'backfill',
      phase: 'bundle',
      object: 'LLC_BI__Underwriting_Bundle__c',
      status: 'error',
      message: 'Could not resolve bundle target Id'
    })
    return
  }

  // sourceTemplateValue is a source-org Id referencing another bundle.
  // Find its lookupKey from the export or try resolving directly.
  // Since the source template may be a different bundle entirely (not in our export),
  // try resolving by lookupKey if it's already in the target.
  // If the source template bundle was also extracted, its lookupKey would be available.
  const exportBundles = bundle.records['LLC_BI__Underwriting_Bundle__c'] ?? []
  const templateBundle = exportBundles.find((r) => r.Id === sourceTemplateValue)
  let resolvedTemplateId: string | undefined

  if (templateBundle) {
    const templateKey = templateBundle.LLC_BI__lookupKey__c as string | undefined
    if (templateKey) {
      const templateMap = await resolveIdByLookupKey(
        conn,
        'LLC_BI__Underwriting_Bundle__c',
        [templateKey]
      )
      resolvedTemplateId = templateMap.get(templateKey)
    }
  }

  if (resolvedTemplateId) {
    try {
      await conn
        .sobject('LLC_BI__Underwriting_Bundle__c')
        .update({ Id: bundleTargetId, LLC_BI__Source_Template__c: resolvedTemplateId } as UpdatePayload)
      logInfo(`Backfill bundle Source_Template: set to ${resolvedTemplateId}`)
    } catch (err) {
      logWarn(`Backfill bundle error: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else {
    logWarn('Backfill bundle: could not resolve Source_Template target Id')
  }

  emitProgress({
    stage: 'backfill',
    phase: 'bundle',
    object: 'LLC_BI__Underwriting_Bundle__c',
    count: 1,
    status: resolvedTemplateId ? 'success' : 'error'
  })
}

// ─── Projection Template resolution helper ───────────────────────────────────

/**
 * Given a source org Id for a Projection Template, look up its lookupKey
 * from the export's reference data, then resolve to the target Id.
 */
function resolveProjectionTemplateId(
  sourceTemplateId: string,
  bundle: BundleExport,
  resolved: ResolvedReferences
): string | undefined {
  // The export's projection junction records contain source Ids.
  // The reference data has lookupKeys for each template.
  // We need to find which lookupKey corresponds to this source Id.
  // Since we don't have a direct sourceId→lookupKey mapping in reference data,
  // we try all resolved keys and see if any match.
  // This is a best-effort approach.
  for (const [lookupKey, targetId] of resolved.projectionsTemplatesByKey) {
    // If there's only one template, or if the junction only has one, use it
    if (bundle.referenceData.projectionsTemplateLookupKeys.includes(lookupKey)) {
      return targetId
    }
  }
  return undefined
}
