// NOTE: The running user must have "Modify Metadata Through
// Metadata API Functions" or "Modify All Data" permission
// to deploy custom fields. If this fails with INSUFFICIENT_ACCESS,
// the user needs one of these permissions in the target org.

import type { Connection } from '@jsforce/jsforce-node'
import type { CustomFieldDef } from '../shared/types'
import log from 'electron-log/main'
import JSZip from 'jszip'

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

  emitProgress(`Deploying ${missingFields.length} missing custom field(s) in a single package...`)
  log.info(
    '[metadataDeploy] Missing custom fields to deploy:',
    missingFields.map((f) => `${f.objectApiName}.${f.fieldApiName} (${f.dataType})`)
  )

  try {
    const { zipBuffer, includedFields, buildSkipped } = await buildMultiFieldDeployZip(missingFields)

    for (const item of buildSkipped) {
      result.skipped.push(item.field.fieldApiName)
      log.warn(`[metadataDeploy] Skipped ${item.field.fieldApiName}: ${item.reason}`)
    }

    if (includedFields.length === 0) {
      log.info('[metadataDeploy] No fields made it into the deploy zip')
      return result
    }

    log.info('[metadataDeploy] Deploying zip:', {
      fieldCount: includedFields.length,
      members: includedFields.map((f) => `${f.objectApiName}.${f.fieldApiName}`)
    })

    const deployResponse = await conn.metadata.deploy(zipBuffer, {
      rollbackOnError: false,
      singlePackage: true
    })

    let status = await conn.metadata.checkDeployStatus(String(deployResponse.id), true)

    let attempts = 0
    while (
      status.status !== 'Succeeded' &&
      status.status !== 'Failed' &&
      status.status !== 'SucceededPartial' &&
      attempts < 60
    ) {
      await new Promise((r) => setTimeout(r, 2000))
      status = await conn.metadata.checkDeployStatus(String(deployResponse.id), true)
      attempts++
      if (attempts % 5 === 0) {
        emitProgress(`Waiting for deploy... (${attempts * 2}s)`)
      }
    }

    if (status.status === 'Succeeded') {
      result.deployed = includedFields.map((f) => f.fieldApiName)
      log.info(`[metadataDeploy] All ${includedFields.length} fields deployed successfully`)
    } else if (status.status === 'SucceededPartial' || status.status === 'Failed') {
      const details = status.details as Record<string, unknown> | undefined
      const rawFailures = details?.componentFailures
      const failures: Array<{ fullName?: string; problem?: string }> = Array.isArray(rawFailures)
        ? rawFailures
        : rawFailures ? [rawFailures as { fullName?: string; problem?: string }] : []

      const failedFullNames = new Set(failures.map((f) => f.fullName ?? ''))

      for (const field of includedFields) {
        const fullName = `${field.objectApiName}.${field.fieldApiName}`
        const failure = failures.find((f) => f.fullName === fullName)
        if (failure) {
          result.failed.push({ fieldName: field.fieldApiName, error: failure.problem ?? 'Unknown error' })
          log.error(`[metadataDeploy] Failed: ${fullName} — ${failure.problem}`)
        } else if (!failedFullNames.has(fullName)) {
          result.deployed.push(field.fieldApiName)
        }
      }

      if (result.deployed.length === 0 && result.failed.length === 0) {
        for (const field of includedFields) {
          result.failed.push({ fieldName: field.fieldApiName, error: 'Deploy failed — check logs' })
        }
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.error('[metadataDeploy] Deploy call failed:', err)
    for (const field of missingFields) {
      result.failed.push({ fieldName: field.fieldApiName, error: errorMsg })
    }
  }

  return result
}

function buildFieldMetadata(field: CustomFieldDef): string | null {
  const sfType = mapDataType(field.dataType)

  // Formula fields
  if (field.formula) {
    const precision = field.precision ?? 18
    const scale = field.scale ?? 2
    const blankHandling = field.formulaTreatBlanksAs ?? 'BlankAsZero'

    let formulaTypeXml = ''
    if (sfType === 'Currency' || sfType === 'Number' || sfType === 'Percent') {
      formulaTypeXml = `    <precision>${precision}</precision>\n    <scale>${scale}</scale>`
    } else if (sfType === 'Text') {
      formulaTypeXml = `    <length>${field.length ?? 1300}</length>`
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${field.fieldApiName}</fullName>
    <label>${field.label}</label>
    <type>${sfType}</type>
    <formula>${escapeXml(field.formula)}</formula>
    <formulaTreatBlanksAs>${blankHandling}</formulaTreatBlanksAs>
${formulaTypeXml}
    <trackHistory>false</trackHistory>
    <trackFeedHistory>false</trackFeedHistory>
</CustomField>`
  }

  // Formula field without formula expression (old JSON files)
  if (field.dataType.toLowerCase() === 'calculated' || field.dataType.toLowerCase().includes('formula')) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${field.fieldApiName}</fullName>
    <label>${field.label}</label>
    <type>Text</type>
    <length>255</length>
    <required>false</required>
    <trackHistory>false</trackHistory>
    <trackFeedHistory>false</trackFeedHistory>
    <description>Formula field — re-extract with provisioning data to deploy actual formula.</description>
</CustomField>`
  }

  // Lookup/Reference fields
  if (sfType === 'Lookup' || field.dataType.toLowerCase() === 'reference') {
    if (!field.referenceTo) return null
    const relName = field.relationshipName ?? field.fieldApiName.replace('__c', '')

    return `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${field.fieldApiName}</fullName>
    <label>${field.label}</label>
    <type>Lookup</type>
    <referenceTo>${field.referenceTo}</referenceTo>
    <relationshipName>${relName}</relationshipName>
    <required>${field.isRequired ? 'true' : 'false'}</required>
    <trackHistory>false</trackHistory>
    <trackFeedHistory>false</trackFeedHistory>
</CustomField>`
  }

  // Picklist fields
  if (sfType === 'Picklist' || sfType === 'MultiselectPicklist') {
    if (field.globalValueSetName) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${field.fieldApiName}</fullName>
    <label>${field.label}</label>
    <type>${sfType}</type>
    <valueSet>
        <valueSetName>${field.globalValueSetName}</valueSetName>
    </valueSet>
    <trackHistory>false</trackHistory>
    <trackFeedHistory>false</trackFeedHistory>
</CustomField>`
    }

    const values = field.picklistValues?.filter((pv) => pv.isActive) ?? []

    if (values.length === 0) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${field.fieldApiName}</fullName>
    <label>${field.label}</label>
    <type>Text</type>
    <length>255</length>
    <required>false</required>
    <trackHistory>false</trackHistory>
    <trackFeedHistory>false</trackFeedHistory>
    <description>Originally ${sfType} — deployed as Text (no picklist values available).</description>
</CustomField>`
    }

    const valueXml = values.map((pv) => `            <value>
                <fullName>${escapeXml(pv.value)}</fullName>
                <label>${escapeXml(pv.label)}</label>
                <default>${pv.isDefault}</default>
            </value>`).join('\n')

    const visibleLines = sfType === 'MultiselectPicklist' ? '\n    <visibleLines>4</visibleLines>' : ''

    return `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${field.fieldApiName}</fullName>
    <label>${field.label}</label>
    <type>${sfType}</type>
    <valueSet>
        <restricted>${field.isRestrictedPicklist ? 'true' : 'false'}</restricted>
        <valueSetDefinition>
            <sorted>false</sorted>
${valueXml}
        </valueSetDefinition>
    </valueSet>${visibleLines}
    <trackHistory>false</trackHistory>
    <trackFeedHistory>false</trackFeedHistory>
</CustomField>`
  }

  // Checkbox
  if (sfType === 'Checkbox') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${field.fieldApiName}</fullName>
    <label>${field.label}</label>
    <type>Checkbox</type>
    <defaultValue>false</defaultValue>
    <trackHistory>false</trackHistory>
    <trackFeedHistory>false</trackFeedHistory>
</CustomField>`
  }

  // Standard types (Text, Currency, Number, Date, DateTime, etc.)
  let typeSpecificXml = ''
  if (sfType === 'Text' || sfType === 'Email' || sfType === 'Phone' || sfType === 'Url') {
    const len = field.length ?? 255
    typeSpecificXml = `    <length>${len}</length>`
  } else if (sfType === 'LongTextArea' || sfType === 'Html') {
    const len = field.length ?? 32768
    typeSpecificXml = `    <length>${len}</length>\n    <visibleLines>3</visibleLines>`
  } else if (sfType === 'Number' || sfType === 'Currency' || sfType === 'Percent') {
    const precision = field.precision ?? 18
    const scale = field.scale ?? 2
    typeSpecificXml = `    <precision>${precision}</precision>\n    <scale>${scale}</scale>`
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${field.fieldApiName}</fullName>
    <label>${field.label}</label>
    <type>${sfType}</type>
${typeSpecificXml}
    <required>${field.isRequired ? 'true' : 'false'}</required>
    <trackHistory>false</trackHistory>
    <trackFeedHistory>false</trackFeedHistory>
</CustomField>`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
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

interface BuildZipResult {
  zipBuffer: Buffer
  includedFields: CustomFieldDef[]
  buildSkipped: { field: CustomFieldDef; reason: string }[]
}

async function buildMultiFieldDeployZip(fields: CustomFieldDef[]): Promise<BuildZipResult> {
  const zip = new JSZip()
  const includedFields: CustomFieldDef[] = []
  const buildSkipped: { field: CustomFieldDef; reason: string }[] = []

  for (const field of fields) {
    try {
      const fieldMetadata = buildFieldMetadata(field)
      if (!fieldMetadata || fieldMetadata.trim().length === 0) {
        buildSkipped.push({
          field,
          reason: `Cannot deploy ${field.dataType} field without required metadata`
        })
        continue
      }
      const path = `objects/${field.objectApiName}/fields/${field.fieldApiName}.field-meta.xml`
      zip.file(path, fieldMetadata)
      includedFields.push(field)
    } catch (err) {
      log.error(`[metadataDeploy] Failed to build metadata for ${field.fieldApiName}:`, err)
      buildSkipped.push({
        field,
        reason: err instanceof Error ? err.message : String(err)
      })
    }
  }

  const members = includedFields.map(
    (f) => `        <members>${f.objectApiName}.${f.fieldApiName}</members>`
  )

  const packageXml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
${members.join('\n')}
        <name>CustomField</name>
    </types>
    <version>62.0</version>
</Package>`

  zip.file('package.xml', packageXml)

  const zipFiles = Object.keys(zip.files)
  const fieldFilesInZip = zipFiles.filter((f) => f.startsWith('objects/'))
  log.info(`[metadataDeploy] Zip contents: ${zipFiles.length} files total, ${fieldFilesInZip.length} field files, ${members.length} package.xml members`)

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  return { zipBuffer, includedFields, buildSkipped }
}
