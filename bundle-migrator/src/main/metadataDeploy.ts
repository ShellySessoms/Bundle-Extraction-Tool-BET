// NOTE: The running user must have "Modify Metadata Through
// Metadata API Functions" or "Modify All Data" permission
// to deploy custom fields. If this fails with INSUFFICIENT_ACCESS,
// the user needs one of these permissions in the target org.

import type { Connection } from '@jsforce/jsforce-node'
import type { CustomFieldDef } from '../shared/types'
import log from 'electron-log/main'

export interface DeployResult {
  deployed: string[]
  skipped: string[]
  failed: { fieldName: string; error: string }[]
}

export async function deployMissingCustomFields(
  conn: Connection,
  fields: CustomFieldDef[],
  emitProgress: (msg: string) => void
): Promise<DeployResult> {
  const result: DeployResult = { deployed: [], skipped: [], failed: [] }

  if (fields.length === 0) return result

  const objectsToCheck = [...new Set(fields.map((f) => f.objectApiName))]
  const existingFieldsByObject = new Map<string, Set<string>>()

  for (const objectApiName of objectsToCheck) {
    try {
      const describe = await conn.describe(objectApiName)
      existingFieldsByObject.set(
        objectApiName,
        new Set(describe.fields.map((f) => f.name))
      )
    } catch (err) {
      log.warn(`[metadataDeploy] Could not describe ${objectApiName}:`, err)
      existingFieldsByObject.set(objectApiName, new Set())
    }
  }

  const alreadyExist = fields.filter((f) => {
    const existing = existingFieldsByObject.get(f.objectApiName)
    return existing && existing.has(f.fieldApiName)
  })
  result.skipped.push(...alreadyExist.map((f) => f.fieldApiName))

  const missingFields = fields.filter((f) => {
    const existing = existingFieldsByObject.get(f.objectApiName)
    return existing && !existing.has(f.fieldApiName)
  })

  if (missingFields.length === 0) {
    log.info('[metadataDeploy] All custom fields already exist in target org')
    return result
  }

  emitProgress(`Deploying ${missingFields.length} missing custom field(s) via Metadata API...`)
  log.info(
    '[metadataDeploy] Missing custom fields to deploy:',
    missingFields.map((f) => `${f.objectApiName}.${f.fieldApiName} (${f.dataType})`)
  )

  const payloads: { field: CustomFieldDef; payload: Record<string, unknown> }[] = []
  for (const field of missingFields) {
    const payload = buildFieldPayload(field)
    if (!payload) {
      result.skipped.push(field.fieldApiName)
      log.warn(`[metadataDeploy] Skipped ${field.fieldApiName}: cannot build payload for ${field.dataType}`)
      continue
    }
    payloads.push({ field, payload })
  }

  if (payloads.length === 0) {
    log.info('[metadataDeploy] No fields could be converted to metadata payloads')
    return result
  }

  log.info('[metadataDeploy] Creating fields via metadata.create:', payloads.map((p) => p.payload.fullName))

  const batches = chunk(payloads, 10)
  for (const batch of batches) {
    try {
      const metadataItems = batch.map((b) => b.payload)
      const results = await conn.metadata.create('CustomField', metadataItems as never)
      const resultsArray = Array.isArray(results) ? results : [results]

      for (let i = 0; i < resultsArray.length; i++) {
        const r = resultsArray[i] as { success: boolean; errors?: Array<{ message: string }> }
        const field = batch[i].field
        const fullName = batch[i].payload.fullName as string

        if (r.success) {
          result.deployed.push(field.fieldApiName)
          log.info(`[metadataDeploy] Created: ${fullName}`)
        } else {
          const errMsg = r.errors?.map((e) => e.message).join('; ') ?? 'Unknown error'
          if (errMsg.includes('Duplicate') || errMsg.includes('already exists') || errMsg.includes('already a field named')) {
            result.skipped.push(field.fieldApiName)
            log.info(`[metadataDeploy] Already exists: ${fullName}`)
          } else {
            result.failed.push({ fieldName: field.fieldApiName, error: errMsg })
            log.error(`[metadataDeploy] Failed: ${fullName} — ${errMsg}`)
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.error('[metadataDeploy] Batch create error:', err)
      for (const item of batch) {
        result.failed.push({ fieldName: item.field.fieldApiName, error: errorMsg })
      }
    }
  }

  const total = result.deployed.length + result.failed.length + result.skipped.length - alreadyExist.length
  log.info(`[metadataDeploy] Done: ${result.deployed.length} deployed, ${result.failed.length} failed, ${result.skipped.length} skipped (of ${total} attempted)`)

  return result
}

function buildFieldPayload(field: CustomFieldDef): Record<string, unknown> | null {
  const sfType = mapDataType(field.dataType)
  const fullName = `${field.objectApiName}.${field.fieldApiName}`
  const label = field.label || field.fieldApiName.replace(/__c$/, '').replace(/_/g, ' ')

  // Formula fields with expression
  if (field.formula) {
    const payload: Record<string, unknown> = {
      fullName,
      label,
      type: sfType,
      formula: field.formula,
      formulaTreatBlanksAs: field.formulaTreatBlanksAs ?? 'BlankAsZero'
    }
    if (sfType === 'Currency' || sfType === 'Number' || sfType === 'Percent') {
      payload.precision = field.precision ?? 18
      payload.scale = field.scale ?? 2
    }
    return payload
  }

  // Formula field without expression (old JSON files) — deploy as Text placeholder
  if (field.dataType.toLowerCase() === 'calculated' || field.dataType.toLowerCase().includes('formula')) {
    return {
      fullName,
      label,
      type: 'Text',
      length: 255,
      description: 'Formula field — re-extract with provisioning data to deploy actual formula.'
    }
  }

  // Lookup/Reference fields
  if (sfType === 'Lookup' || field.dataType.toLowerCase() === 'reference') {
    if (!field.referenceTo) return null
    return {
      fullName,
      label,
      type: 'Lookup',
      referenceTo: field.referenceTo,
      relationshipName: field.relationshipName ?? field.fieldApiName.replace('__c', '')
    }
  }

  // Picklist fields
  if (sfType === 'Picklist' || sfType === 'MultiselectPicklist') {
    if (field.globalValueSetName) {
      return {
        fullName,
        label,
        type: sfType,
        valueSet: { valueSetName: field.globalValueSetName }
      }
    }

    const values = field.picklistValues?.filter((pv) => pv.isActive) ?? []

    if (values.length === 0) {
      return {
        fullName,
        label,
        type: 'Text',
        length: 255,
        description: `Originally ${sfType} — deployed as Text (no picklist values available).`
      }
    }

    const payload: Record<string, unknown> = {
      fullName,
      label,
      type: sfType,
      valueSet: {
        restricted: field.isRestrictedPicklist ?? false,
        valueSetDefinition: {
          sorted: false,
          value: values.map((pv) => ({
            fullName: pv.value,
            label: pv.label,
            default: pv.isDefault
          }))
        }
      }
    }
    if (sfType === 'MultiselectPicklist') payload.visibleLines = 4
    return payload
  }

  // Checkbox
  if (sfType === 'Checkbox') {
    return { fullName, label, type: 'Checkbox', defaultValue: false }
  }

  // Standard types
  const payload: Record<string, unknown> = { fullName, label, type: sfType }

  if (sfType === 'Text' || sfType === 'Email' || sfType === 'Phone' || sfType === 'Url') {
    payload.length = field.length ?? 255
  } else if (sfType === 'LongTextArea' || sfType === 'Html') {
    payload.length = field.length ?? 32768
    payload.visibleLines = 3
  } else if (sfType === 'Number' || sfType === 'Currency' || sfType === 'Percent') {
    payload.precision = field.precision ?? 18
    payload.scale = field.scale ?? 2
  }

  return payload
}

function mapDataType(dataType: string): string {
  const type = (dataType || '').toLowerCase().trim()

  if (type === 'currency') return 'Currency'
  if (type === 'percent') return 'Percent'
  if (type === 'double' || type === 'number') return 'Number'
  if (type === 'int' || type === 'integer') return 'Number'
  if (type === 'date') return 'Date'
  if (type === 'datetime') return 'DateTime'
  if (type === 'boolean') return 'Checkbox'
  if (type === 'textarea') return 'LongTextArea'
  if (type === 'longtextarea') return 'LongTextArea'
  if (type === 'richtextarea') return 'Html'
  if (type === 'email') return 'Email'
  if (type === 'phone') return 'Phone'
  if (type === 'url') return 'Url'
  if (type === 'picklist') return 'Picklist'
  if (type === 'multipicklist') return 'MultiselectPicklist'
  if (type === 'reference') return 'Lookup'
  if (type === 'string') return 'Text'
  if (type === 'id') return 'Text'
  if (type === 'calculated') return 'Text'

  return 'Text'
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}
