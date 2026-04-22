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

type UpdatePayload = { Id: string; [key: string]: unknown }

const AUTO_NUMBER_OBJECTS = new Set([
  'LLC_BI__Spread_Statement_Type__c',
  'LLC_BI__Spread_Statement_Record__c',
  'LLC_BI__Spread_Statement_Record_Total__c',
  'LLC_BI__Spread_Record_Classification__c',
  'LLC_BI__Spread_Record_Total_Classification__c',
  'LLC_BI__Spread_Statement_Period__c',
  'LLC_BI__Spread_Statement_Record_Value__c',
  'LLC_BI__Spread_Statement_Period_Total__c',
  'LLC_BI__Spread_Statement_Record_Group__c',
  'LLC_BI__Spread_Statement_Row_Mapping__c',
  'LLC_BI__Projection_Bundle_Junction__c',
  'LLC_BI__Period_Consolidation__c',
  'LLC_BI__Spread_Projections_Driver__c',
  'LLC_BI__Schedule__c',
  'LLC_BI__Schedule_Section__c',
  'LLC_BI__Schedule_Entry__c',
  'LLC_BI__Debt_Schedule__c',
  'LLC_BI__Debt__c',
  'LLC_BI__Loan_Assumptions__c',
  'LLC_BI__Sensitivity_Analysis__c',
  'LLC_BI__Tenant_Information__c'
])

const SYSTEM_FIELDS = [
  'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById',
  'SystemModstamp', 'IsDeleted', 'LastActivityDate', 'LastViewedDate',
  'LastReferencedDate'
]

// ─── Logging ────────────────────────────────────────────────────────────────

function logInfo(message: string): void {
  log.info(`[importer] ${message}`)
}

function logWarn(message: string): void {
  log.warn(`[importer] ${message}`)
}

// ─── SOQL helpers ───────────────────────────────────────────────────────────

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

// ─── resolveIdByLookupKey ───────────────────────────────────────────────────

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

// ─── Upsert batch helper ───────────────────────────────────────────────────

interface UpsertBatchResult {
  succeeded: number
  created: number
  updated: number
  failed: FailedRecord[]
}

async function upsertBatch(
  conn: Connection,
  objectApiName: string,
  records: SfRecord[]
): Promise<UpsertBatchResult> {
  const result: UpsertBatchResult = { succeeded: 0, created: 0, updated: 0, failed: [] }
  if (records.length === 0) return result

  const validRecords: SfRecord[] = []
  for (const rec of records) {
    if (!rec.LLC_BI__lookupKey__c) {
      result.failed.push({
        objectName: objectApiName,
        sourceId: rec.Id ?? '',
        error: 'Missing LLC_BI__lookupKey__c — skipped to prevent duplicate insert',
        record: rec
      })
    } else {
      validRecords.push(rec)
    }
  }
  if (validRecords.length < records.length) {
    logWarn(`${objectApiName}: skipping ${records.length - validRecords.length} records with missing LLC_BI__lookupKey__c`)
  }
  if (validRecords.length === 0) return result
  records = validRecords

  try {
    const batches = chunk(records, 200)
    for (const batch of batches) {
      const jsforceRecords = batch as unknown as JsforceRecord[]
      const upsertResults = await conn
        .sobject(objectApiName)
        .upsert(jsforceRecords, 'LLC_BI__lookupKey__c' as never)
      const resultsArray = Array.isArray(upsertResults) ? upsertResults : [upsertResults]
      for (let i = 0; i < resultsArray.length; i++) {
        const r = resultsArray[i]
        if (r.success) {
          result.succeeded++
          if ((r as { created?: boolean }).created) {
            result.created++
          } else {
            result.updated++
          }
        } else {
          const errMsg = r.errors.map((e) => e.message).join('; ')
          result.failed.push({
            objectName: objectApiName,
            sourceId: batch[i]?.Id ?? '',
            error: errMsg,
            record: batch[i]
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

// ─── Parent reference resolution ────────────────────────────────────────────

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
    },
    'LLC_BI__Spread_Statement_Record_Total__c': {
      relationship: 'LLC_BI__Spread_Statement_Record_Total__r',
      parentObject: 'LLC_BI__Spread_Statement_Record_Total__c'
    }
  },
  'LLC_BI__Spread_Statement_Record_Group__c': {
    'LLC_BI__Spread_Statement_Record__c': {
      relationship: 'LLC_BI__Spread_Statement_Record__r',
      parentObject: 'LLC_BI__Spread_Statement_Record__c'
    },
    'LLC_BI__Spread_Statement_Record_Total__c': {
      relationship: 'LLC_BI__Spread_Statement_Record_Total__r',
      parentObject: 'LLC_BI__Spread_Statement_Record_Total__c'
    }
  },
  'LLC_BI__Spread_Record_Classification__c': {
    'LLC_BI__Spread_Statement_Record__c': {
      relationship: 'LLC_BI__Spread_Statement_Record__r',
      parentObject: 'LLC_BI__Spread_Statement_Record__c'
    },
    'LLC_BI__Classification__c': {
      relationship: 'LLC_BI__Classification__r',
      parentObject: 'LLC_BI__Classification__c'
    }
  },
  'LLC_BI__Spread_Record_Total_Classification__c': {
    'LLC_BI__Spread_Statement_Total_Group__c': {
      relationship: 'LLC_BI__Spread_Statement_Total_Group__r',
      parentObject: 'LLC_BI__Spread_Statement_Record_Total__c'
    },
    'LLC_BI__Classification__c': {
      relationship: 'LLC_BI__Classification__r',
      parentObject: 'LLC_BI__Classification__c'
    }
  },
  'LLC_BI__Tenant_Information__c': {
    'LLC_BI__Spread_Statement_Template__c': {
      relationship: 'LLC_BI__Spread_Statement_Template__r',
      parentObject: 'LLC_BI__Spread_Statement_Type__c'
    }
  },
  'LLC_BI__Sensitivity_Analysis__c': {
    'LLC_BI__Bundle__c': {
      relationship: 'LLC_BI__Bundle__r',
      parentObject: 'LLC_BI__Underwriting_Bundle__c'
    }
  },
  'LLC_BI__Spread_Statement_Row_Mapping__c': {
    'LLC_BI__Underwriting_Bundle__c': {
      relationship: 'LLC_BI__Underwriting_Bundle__r',
      parentObject: 'LLC_BI__Underwriting_Bundle__c'
    },
    'LLC_BI__Spread_Statement_Record__c': {
      relationship: 'LLC_BI__Spread_Statement_Record__r',
      parentObject: 'LLC_BI__Spread_Statement_Record__c'
    }
  },
  'LLC_BI__Projection_Bundle_Junction__c': {
    'LLC_BI__Bundle__c': {
      relationship: 'LLC_BI__Bundle__r',
      parentObject: 'LLC_BI__Underwriting_Bundle__c'
    },
    'LLC_BI__Projection_Template__c': {
      relationship: 'LLC_BI__Projection_Template__r',
      parentObject: 'LLC_BI__Spread_Projections_Template__c'
    }
  },
  'LLC_BI__Period_Consolidation__c': {
    'LLC_BI__Source_Period__c': {
      relationship: 'LLC_BI__Source_Period__r',
      parentObject: 'LLC_BI__Spread_Statement_Period__c'
    },
    'LLC_BI__Target_Period__c': {
      relationship: 'LLC_BI__Target_Period__r',
      parentObject: 'LLC_BI__Spread_Statement_Period__c'
    }
  },
  'LLC_BI__Spread_Projections_Driver__c': {
    'LLC_BI__Spread_Statement_Record__c': {
      relationship: 'LLC_BI__Spread_Statement_Record__r',
      parentObject: 'LLC_BI__Spread_Statement_Record__c'
    },
    'LLC_BI__Spread_Projections_Template__c': {
      relationship: 'LLC_BI__Spread_Projections_Template__r',
      parentObject: 'LLC_BI__Spread_Projections_Template__c'
    },
    'LLC_BI__Classification__c': {
      relationship: 'LLC_BI__Classification__r',
      parentObject: 'LLC_BI__Classification__c'
    },
    'LLC_BI__Spread_Statement_Record_value__c': {
      relationship: 'LLC_BI__Spread_Statement_Record_value__r',
      parentObject: 'LLC_BI__Spread_Statement_Record_Value__c'
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

function remapParentReferences(
  objectApiName: string,
  records: SfRecord[],
  exportData: { [objectApiName: string]: SfRecord[] }
): void {
  const refMap = FIELD_REFERENCE_MAP[objectApiName]
  if (!refMap) return

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
        delete rec[sourceField]
        rec[relationship] = { LLC_BI__lookupKey__c: lookupKey }
      }
    }
  }
}

function stripNonTransferableFields(objectApiName: string, records: SfRecord[]): void {
  for (const rec of records) {
    const r = rec as Record<string, unknown>
    delete r.Id
    delete r.attributes
    delete r.OwnerId
    if (AUTO_NUMBER_OBJECTS.has(objectApiName)) {
      delete r.Name
    }
    for (const sf of SYSTEM_FIELDS) {
      delete r[sf]
    }
  }
}

function prepareRecords(
  objectApiName: string,
  records: SfRecord[],
  exportData: { [objectApiName: string]: SfRecord[] }
): SfRecord[] {
  const cloned = records.map((r) => ({ ...r }))
  remapParentReferences(objectApiName, cloned, exportData)
  stripNonTransferableFields(objectApiName, cloned)
  return cloned
}

// ─── Main importer ──────────────────────────────────────────────────────────

export async function importBundle(
  conn: Connection,
  exportFilePath: string,
  emitProgress: (e: ProgressEvent) => void
): Promise<ImportSummary> {
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
      created: result.created,
      updated: result.updated,
      failed: result.failed.length
    }
    summary.failedRecords.push(...result.failed)

    logInfo(`Upserted ${result.succeeded} records to ${objectApiName} — ${result.created} created, ${result.updated} updated, ${result.failed.length} failed`)

    if (result.failed.length > 0) {
      const uniqueErrors = new Map<string, number>()
      for (const f of result.failed) {
        uniqueErrors.set(f.error, (uniqueErrors.get(f.error) ?? 0) + 1)
      }
      for (const [errMsg, count] of uniqueErrors) {
        logWarn(`  ${objectApiName} failure (${count}x): ${errMsg}`)
      }
    }

    emitProgress({
      stage: 'import',
      object: objectApiName,
      total: records.length,
      succeeded: result.succeeded,
      failed: result.failed.length,
      created: result.created,
      updated: result.updated,
      status: result.failed.length > 0 ? 'partial' : 'success',
      message: result.failed.length > 0
        ? `${result.failed.length} records failed — dependent objects in later phases may also fail due to missing parent records`
        : undefined
    })
  }

  // ─── Step 0: Resolve reference data & upsert Classifications ──────────

  logInfo('Step 0 — Resolving reference data & upserting Classifications')
  const resolved = await resolveReferences(conn, bundle.referenceData, emitProgress)

  // Upsert classifications that were extracted (excluding nCino Standard Tags)
  const classRecords = bundle.records['LLC_BI__Classification__c'] ?? []
  if (classRecords.length > 0) {
    await upsertObject('LLC_BI__Classification__c', classRecords)
  }

  // ─── Step 1: Bundle ───────────────────────────────────────────────────

  logInfo('Step 1 — Upserting bundle')
  const bundleRecords = bundle.records['LLC_BI__Underwriting_Bundle__c'] ?? []
  for (const rec of bundleRecords) {
    rec.LLC_BI__Source_Template__c = null

    if (rec.LLC_BI__Financial_Consolidation__c && resolved.financialConsolidationId) {
      rec.LLC_BI__Financial_Consolidation__c = resolved.financialConsolidationId
    } else {
      delete rec.LLC_BI__Financial_Consolidation__c
    }

    const relationshipId = rec.LLC_BI__Relationship__c as string | undefined
    if (relationshipId) {
      delete rec.LLC_BI__Relationship__c
      rec['LLC_BI__Relationship__r'] = { LLC_BI__lookupKey__c: relationshipId }
    }

    const collateralId = rec.LLC_BI__Collateral__c as string | undefined
    if (collateralId) {
      delete rec.LLC_BI__Collateral__c
      rec['LLC_BI__Collateral__r'] = { LLC_BI__lookupKey__c: collateralId }
    }
  }
  await upsertObject('LLC_BI__Underwriting_Bundle__c', bundleRecords)

  // ─── Step 2: Statement Types (first pass — no common sizing refs) ─────

  logInfo('Step 2 — Upserting Statement Types')
  const stRecords = bundle.records['LLC_BI__Spread_Statement_Type__c'] ?? []
  for (const rec of stRecords) {
    rec.LLC_BI__Calc_Common_Sizing_Record__c = null
    rec.LLC_BI__Calc_Common_Sizing_Total_Group__c = null
  }
  await upsertObject('LLC_BI__Spread_Statement_Type__c', stRecords)

  // ─── Step 3: Record Totals ────────────────────────────────────────────

  logInfo('Step 3 — Upserting Record Totals')
  await upsertObject(
    'LLC_BI__Spread_Statement_Record_Total__c',
    bundle.records['LLC_BI__Spread_Statement_Record_Total__c'] ?? []
  )

  // ─── Step 4: Records (first pass — no linked refs) ────────────────────

  logInfo('Step 4 — Upserting Records (first pass)')
  const recRecords = bundle.records['LLC_BI__Spread_Statement_Record__c'] ?? []
  for (const rec of recRecords) {
    rec.LLC_BI__Linked_Spread_Statement_Record__c = null
    rec.LLC_BI__Linked_Spread_Statement_Total_Group__c = null
    rec.LLC_BI__Associated_Parent_Record__c = null
  }
  await upsertObject('LLC_BI__Spread_Statement_Record__c', recRecords)

  // ─── Step 5: Records backfill (second pass — linked refs) ─────────────

  logInfo('Step 5 — Backfill Records (linked refs)')
  await backfillRecords(conn, bundle, resolved, emitProgress)

  // ─── Step 6: Statement Types backfill (common sizing) ─────────────────

  logInfo('Step 6 — Backfill Statement Types (common sizing)')
  await backfillStatementTypes(conn, bundle, emitProgress)

  // ─── Step 6c: Bundle Source_Template backfill ─────────────────────────

  await backfillBundleSourceTemplate(conn, bundle, emitProgress)

  // ─── Step 7: Record Classifications ───────────────────────────────────

  logInfo('Step 7 — Upserting Record Classifications')
  await upsertObject(
    'LLC_BI__Spread_Record_Classification__c',
    bundle.records['LLC_BI__Spread_Record_Classification__c'] ?? []
  )

  // ─── Step 8: Record Total Classifications ─────────────────────────────

  logInfo('Step 8 — Upserting Record Total Classifications')
  await upsertObject(
    'LLC_BI__Spread_Record_Total_Classification__c',
    bundle.records['LLC_BI__Spread_Record_Total_Classification__c'] ?? []
  )

  // ─── Step 9: Tenant Information ───────────────────────────────────────

  logInfo('Step 9 — Upserting Tenant Information')
  await upsertObject(
    'LLC_BI__Tenant_Information__c',
    bundle.records['LLC_BI__Tenant_Information__c'] ?? []
  )

  // ─── Step 10: Sensitivity Analysis ────────────────────────────────────

  logInfo('Step 10 — Upserting Sensitivity Analysis')
  await upsertObject(
    'LLC_BI__Sensitivity_Analysis__c',
    bundle.records['LLC_BI__Sensitivity_Analysis__c'] ?? []
  )

  // ─── Step 11: Loan Assumptions ────────────────────────────────────────

  logInfo('Step 11 — Upserting Loan Assumptions')
  await upsertObject(
    'LLC_BI__Loan_Assumptions__c',
    bundle.records['LLC_BI__Loan_Assumptions__c'] ?? []
  )

  // ─── Step 12: Record Values ───────────────────────────────────────────

  logInfo('Step 12 — Upserting Record Values')
  await upsertObject(
    'LLC_BI__Spread_Statement_Record_Value__c',
    bundle.records['LLC_BI__Spread_Statement_Record_Value__c'] ?? []
  )

  // ─── Step 12b: Period Totals ──────────────────────────────────────────

  logInfo('Step 12b — Upserting Period Totals')
  await upsertObject(
    'LLC_BI__Spread_Statement_Period_Total__c',
    bundle.records['LLC_BI__Spread_Statement_Period_Total__c'] ?? []
  )

  // ─── Step 12c: Periods ────────────────────────────────────────────────

  logInfo('Step 12c — Upserting Periods')
  await upsertObject(
    'LLC_BI__Spread_Statement_Period__c',
    bundle.records['LLC_BI__Spread_Statement_Period__c'] ?? []
  )

  // ─── Step 12d: Record Groups ──────────────────────────────────────────

  logInfo('Step 12d — Upserting Record Groups')
  await upsertObject(
    'LLC_BI__Spread_Statement_Record_Group__c',
    bundle.records['LLC_BI__Spread_Statement_Record_Group__c'] ?? []
  )

  // ─── Step 12e: Row Mappings ───────────────────────────────────────────

  logInfo('Step 12e — Upserting Row Mappings')
  await upsertObject(
    'LLC_BI__Spread_Statement_Row_Mapping__c',
    bundle.records['LLC_BI__Spread_Statement_Row_Mapping__c'] ?? []
  )

  // ─── Step 12f: Period Consolidations ──────────────────────────────────

  logInfo('Step 12f — Upserting Period Consolidations')
  await upsertObject(
    'LLC_BI__Period_Consolidation__c',
    bundle.records['LLC_BI__Period_Consolidation__c'] ?? []
  )

  // ─── Step 13: Projections Templates ───────────────────────────────────

  logInfo('Step 13 — Upserting Projections Templates')
  await upsertObject(
    'LLC_BI__Spread_Projections_Template__c',
    bundle.records['LLC_BI__Spread_Projections_Template__c'] ?? []
  )

  // ─── Step 14: Projection Bundle Junctions ─────────────────────────────

  logInfo('Step 14 — Upserting Projection Bundle Junctions')
  await upsertObject(
    'LLC_BI__Projection_Bundle_Junction__c',
    bundle.records['LLC_BI__Projection_Bundle_Junction__c'] ?? []
  )

  // ─── Step 15: Projections Drivers ─────────────────────────────────────

  logInfo('Step 15 — Upserting Projections Drivers')
  await upsertObject(
    'LLC_BI__Spread_Projections_Driver__c',
    bundle.records['LLC_BI__Spread_Projections_Driver__c'] ?? []
  )

  // ─── Step 20: Schedules ───────────────────────────────────────────────

  logInfo('Step 20 — Upserting Schedules')
  const schedRecords = bundle.records['LLC_BI__Schedule__c'] ?? []
  for (const rec of schedRecords) {
    rec.LLC_BI__Source_Schedule__c = null
  }
  await upsertObject('LLC_BI__Schedule__c', schedRecords)

  // ─── Step 20b: Schedule Entries ───────────────────────────────────────

  logInfo('Step 20b — Upserting Schedule Entries')
  await upsertObject(
    'LLC_BI__Schedule_Entry__c',
    bundle.records['LLC_BI__Schedule_Entry__c'] ?? []
  )

  // ─── Step 21: Schedule Sections (Schedule-owned) ──────────────────────

  logInfo('Step 21 — Upserting Schedule Sections (Schedule-owned)')
  const allSections = bundle.records['LLC_BI__Schedule_Section__c'] ?? []
  const scheduleOwnedSections = allSections.filter((r) => !!r.LLC_BI__Schedule__c)
  const debtOwnedSections = allSections.filter((r) => !!r.LLC_BI__Debt_Schedule__c)

  for (const rec of scheduleOwnedSections) {
    rec.LLC_BI__Source_Section__c = null
  }
  await upsertScheduleSections(conn, scheduleOwnedSections, bundle.records, summary, emitProgress, 'LLC_BI__Schedule_Section__c (Schedule)')

  // ─── Step 23: Debt Schedules ──────────────────────────────────────────

  logInfo('Step 23 — Upserting Debt Schedules')
  const dsRecords = bundle.records['LLC_BI__Debt_Schedule__c'] ?? []
  for (const rec of dsRecords) {
    rec.LLC_BI__Source_Debt_Schedule__c = null
  }
  await upsertObject('LLC_BI__Debt_Schedule__c', dsRecords)

  // ─── Step 23b: Debts (parent) ─────────────────────────────────────────

  logInfo('Step 23b — Upserting Debts (parent)')
  const debtRecords = bundle.records['LLC_BI__Debt__c'] ?? []
  for (const rec of debtRecords) {
    rec.LLC_BI__Source_Debt__c = null
  }
  await upsertObject('LLC_BI__Debt__c', debtRecords)

  // ─── Step 23c: Debts (internal) ───────────────────────────────────────

  const internalDebtRecords = bundle.records['LLC_BI__Debt_Internal__c'] ?? []
  if (internalDebtRecords.length > 0) {
    logInfo('Step 23c — Upserting Debts (internal)')
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
    const internalPrepared = prepareRecords('LLC_BI__Debt__c', internalDebtRecords, bundle.records)
    const internalResult = await upsertBatch(conn, 'LLC_BI__Debt__c', internalPrepared)
    summary.totalRecords += internalDebtRecords.length
    summary.succeeded += internalResult.succeeded
    summary.failed += internalResult.failed.length
    summary.byObject['LLC_BI__Debt_Internal__c'] = {
      created: internalResult.created,
      updated: internalResult.updated,
      failed: internalResult.failed.length
    }
    summary.failedRecords.push(...internalResult.failed)
    logInfo(`Upserted ${internalResult.succeeded} records to LLC_BI__Debt__c (internal) — ${internalResult.created} created, ${internalResult.updated} updated, ${internalResult.failed.length} failed`)
    emitProgress({
      stage: 'import',
      object: 'LLC_BI__Debt_Internal__c',
      total: internalDebtRecords.length,
      succeeded: internalResult.succeeded,
      failed: internalResult.failed.length,
      created: internalResult.created,
      updated: internalResult.updated,
      status: internalResult.failed.length > 0 ? 'partial' : 'success'
    })
  } else {
    emitProgress({
      stage: 'import',
      object: 'LLC_BI__Debt_Internal__c',
      total: 0,
      succeeded: 0,
      failed: 0,
      created: 0,
      updated: 0,
      status: 'success'
    })
  }

  // ─── Step 24: Schedule Sections (Debt-owned) ─────────────────────────

  logInfo('Step 24 — Upserting Schedule Sections (Debt-owned)')
  for (const rec of debtOwnedSections) {
    rec.LLC_BI__Source_Section__c = null
  }
  await upsertScheduleSections(conn, debtOwnedSections, bundle.records, summary, emitProgress, 'LLC_BI__Schedule_Section__c (Debt)')

  // ─── Complete ─────────────────────────────────────────────────────────

  emitProgress({
    stage: 'complete',
    status: 'success',
    message: 'Import complete'
  })

  logInfo(`Import complete: ${summary.succeeded} succeeded, ${summary.failed} failed`)
  return summary
}

// ─── Polymorphic Schedule Section upsert ────────────────────────────────────

async function upsertScheduleSections(
  conn: Connection,
  records: SfRecord[],
  exportData: { [objectApiName: string]: SfRecord[] },
  summary: ImportSummary,
  emitProgress: (e: ProgressEvent) => void,
  label: string
): Promise<void> {
  if (records.length === 0) {
    emitProgress({
      stage: 'import',
      object: label,
      total: 0,
      succeeded: 0,
      failed: 0,
      created: 0,
      updated: 0,
      status: 'success'
    })
    return
  }

  const scheduleCache = buildSourceIdToLookupKey(exportData['LLC_BI__Schedule__c'] ?? [])
  const debtScheduleCache = buildSourceIdToLookupKey(exportData['LLC_BI__Debt_Schedule__c'] ?? [])
  const recordCache = buildSourceIdToLookupKey(exportData['LLC_BI__Spread_Statement_Record__c'] ?? [])

  const cloned = records.map((r) => ({ ...r }))
  for (const rec of cloned) {
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

    const recId = rec.LLC_BI__Spread_Statement_Record__c as string | undefined | null
    if (recId) {
      const lookupKey = recordCache.get(recId)
      if (lookupKey) {
        delete rec.LLC_BI__Spread_Statement_Record__c
        rec['LLC_BI__Spread_Statement_Record__r'] = { LLC_BI__lookupKey__c: lookupKey }
      }
    }
  }

  stripNonTransferableFields('LLC_BI__Schedule_Section__c', cloned)
  const result = await upsertBatch(conn, 'LLC_BI__Schedule_Section__c', cloned)

  summary.totalRecords += records.length
  summary.succeeded += result.succeeded
  summary.failed += result.failed.length
  summary.byObject[label] = {
    created: result.created,
    updated: result.updated,
    failed: result.failed.length
  }
  summary.failedRecords.push(...result.failed)

  logInfo(`Upserted ${result.succeeded} records to ${label} — ${result.created} created, ${result.updated} updated, ${result.failed.length} failed`)
  emitProgress({
    stage: 'import',
    object: label,
    total: records.length,
    succeeded: result.succeeded,
    failed: result.failed.length,
    created: result.created,
    updated: result.updated,
    status: result.failed.length > 0 ? 'partial' : 'success'
  })
}

// ─── Backfill helpers ───────────────────────────────────────────────────────

async function backfillRecords(
  conn: Connection,
  bundle: BundleExport,
  _resolved: ResolvedReferences,
  emitProgress: (e: ProgressEvent) => void
): Promise<void> {
  const backfill = bundle.backfillData.records
  const lookupKeys = Object.keys(backfill)
  if (lookupKeys.length === 0) return

  logInfo(`Backfill Step 5 — ${lookupKeys.length} record(s) to backfill`)

  const allKeysNeeded = new Set(lookupKeys)
  for (const fields of Object.values(backfill)) {
    for (const sourceId of Object.values(fields)) {
      const exportRecords = bundle.records['LLC_BI__Spread_Statement_Record__c'] ?? []
      const match = exportRecords.find((r) => r.Id === sourceId)
      if (match) {
        const key = match.LLC_BI__lookupKey__c as string | undefined
        if (key) allKeysNeeded.add(key)
      }
      const totalRecords = bundle.records['LLC_BI__Spread_Statement_Record_Total__c'] ?? []
      const totalMatch = totalRecords.find((r) => r.Id === sourceId)
      if (totalMatch) {
        const key = totalMatch.LLC_BI__lookupKey__c as string | undefined
        if (key) allKeysNeeded.add(key)
      }
    }
  }

  const recordKeyMap = await resolveIdByLookupKey(
    conn,
    'LLC_BI__Spread_Statement_Record__c',
    [...allKeysNeeded]
  )
  const totalKeyMap = await resolveIdByLookupKey(
    conn,
    'LLC_BI__Spread_Statement_Record_Total__c',
    [...allKeysNeeded]
  )

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

  logInfo(`Backfill Step 6 — ${lookupKeys.length} statement type(s) to backfill`)

  const stKeyMap = await resolveIdByLookupKey(
    conn,
    'LLC_BI__Spread_Statement_Type__c',
    lookupKeys
  )

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

  logInfo('Backfill — Bundle Source_Template__c')

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

