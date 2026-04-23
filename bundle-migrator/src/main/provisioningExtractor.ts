import type { Connection } from '@jsforce/jsforce-node'
import log from 'electron-log/main'
import type {
  BundleExport,
  SfRecord,
  ProvisioningMetadata,
  OrgType,
  FeatureFlag,
  FeatureProcess,
  CustomFieldDef,
  PermissionSetRequirement,
  InstalledPackageVersion,
  PackageVersions
} from '../shared/types'

function logInfo(message: string): void {
  log.info(`[provisioning] ${message}`)
}

async function getAvailableFields(conn: Connection, objectApiName: string): Promise<Set<string>> {
  const desc = await conn.describe(objectApiName)
  return new Set(desc.fields.map((f) => f.name))
}

function pickAvailable(available: Set<string>, desired: string[]): string[] {
  return desired.filter((f) => available.has(f))
}

const DESIRED_FEATURE_FIELDS = [
  'DeveloperName', 'Label',
  'nFORCE__Is_Active__c', 'nFORCE__Is_Enabled__c',
  'nFORCE__Parent__c', 'nFORCE__Parent_Feature__c',
  'nFORCE__Version__c',
  'nFORCE__LMO_Permitted__c',
  'nFORCE__Developer_Permitted__c'
]

const DESIRED_PROCESS_FIELDS = [
  'DeveloperName', 'Label',
  'nFORCE__Feature__c', 'nFORCE__Feature_Name__c',
  'nFORCE__Apex_Class__c', 'nFORCE__Class_Name__c',
  'nFORCE__Is_Active__c', 'nFORCE__Is_Enabled__c',
  'nFORCE__Run_Order__c', 'nFORCE__Order__c'
]

const RELEVANT_FEATURE_NAMES = new Set([
  'Bundle_Management', 'Credit_Analysis', 'Financial_Consolidations',
  'Template_Migration', 'Formula_Creator', 'Formula_Details',
  'Debt_Schedule', 'RMA_Benchmarking', 'Spreads_Projections'
])

const RELEVANT_KEYWORDS = [
  'bundle', 'spread', 'debt', 'schedule', 'cre', 'analysis',
  'consolidat', 'projection', 'formula', 'rma', 'template',
  'migration'
]

export async function extractProvisioningMetadata(
  conn: Connection,
  bundle: BundleExport
): Promise<ProvisioningMetadata> {
  const warnings: string[] = []

  // Step 1 — Detect org type
  logInfo('Step 1 — Detecting org type')
  let orgId = ''
  let orgType: OrgType = 'unknown'
  try {
    const orgResult = await conn.query<SfRecord>(
      `SELECT Id, OrganizationType, IsSandbox, TrialExpirationDate FROM Organization LIMIT 1`
    )
    const org = orgResult.records[0]
    if (org) {
      orgId = org.Id
      if (org.IsSandbox) orgType = 'sandbox'
      else if (org.OrganizationType === 'Developer Edition') orgType = 'developer'
      else if (org.TrialExpirationDate) orgType = 'scratch'
      else orgType = 'production'
    }
  } catch (err) {
    warnings.push(`Could not detect org type: ${err instanceof Error ? err.message : String(err)}`)
  }
  logInfo(`Org: ${orgId} (${orgType})`)

  // Step 2 — Detect nCino package versions
  logInfo('Step 2 — Detecting nCino package versions')
  const NCINO_NAMESPACES = new Set(['LLC_BI', 'nCRED', 'nFORCE', 'nDESIGN'])
  let packageVersions: PackageVersions = { all: [] }
  try {
    const toolingConn = conn as unknown as { tooling: { query: (soql: string) => Promise<{ records: SfRecord[] }> } }
    const pkgResult = await toolingConn.tooling.query(
      `SELECT SubscriberPackage.Name, SubscriberPackage.NamespacePrefix,
              SubscriberPackageVersion.MajorVersion,
              SubscriberPackageVersion.MinorVersion,
              SubscriberPackageVersion.PatchVersion
       FROM InstalledSubscriberPackage`
    )
    const allPackages: InstalledPackageVersion[] = []
    for (const record of (pkgResult.records ?? []) as SfRecord[]) {
      const pkg = record.SubscriberPackage as Record<string, unknown> | undefined
      const ns = pkg?.NamespacePrefix as string | undefined
      if (!ns || !NCINO_NAMESPACES.has(ns)) continue
      const ver = record.SubscriberPackageVersion as Record<string, unknown>
      const major = (ver.MajorVersion as number) ?? 0
      const minor = (ver.MinorVersion as number) ?? 0
      const patch = ver.PatchVersion as number | undefined
      const versionString = patch && patch > 0
        ? `${major}.${minor}.${patch}`
        : `${major}.${minor}`
      allPackages.push({
        namespace: ns,
        name: (pkg?.Name as string) ?? ns,
        majorVersion: major,
        minorVersion: minor,
        patchVersion: patch ?? undefined,
        versionString
      })
    }
    packageVersions = {
      llcBi: allPackages.find((p) => p.namespace === 'LLC_BI'),
      nCred: allPackages.find((p) => p.namespace === 'nCRED'),
      nForce: allPackages.find((p) => p.namespace === 'nFORCE'),
      nDesign: allPackages.find((p) => p.namespace === 'nDESIGN'),
      all: allPackages
    }
    logInfo(`Detected nCino packages: ${allPackages.map((p) => `${p.namespace} ${p.versionString}`).join(', ') || 'none'}`)
  } catch (err) {
    warnings.push(`Package version detection failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Step 3 — Query feature flags (query all, filter in code)
  logInfo('Step 3 — Querying feature flags')
  let featureFlags: FeatureFlag[] = []
  try {
    const available = await getAvailableFields(conn, 'nFORCE__Feature__mdt')
    const fields = pickAvailable(available, DESIRED_FEATURE_FIELDS)
    const missing = DESIRED_FEATURE_FIELDS.filter((f) => !available.has(f))
    logInfo(`Feature__mdt fields — available: ${fields.join(', ')}`)
    if (missing.length > 0) logInfo(`Feature__mdt fields — not found: ${missing.join(', ')}`)

    const featureResult = await conn.query<SfRecord>(
      `SELECT ${fields.join(', ')} FROM nFORCE__Feature__mdt`
    )
    logInfo(`Feature__mdt total records returned: ${featureResult.records.length}`)

    const relevantRecords = featureResult.records.filter((r: SfRecord) => {
      const devName = ((r.DeveloperName as string) ?? '').toLowerCase()
      return RELEVANT_FEATURE_NAMES.has(r.DeveloperName as string)
        || RELEVANT_KEYWORDS.some((k) => devName.includes(k))
    })
    logInfo(`Feature__mdt relevant after filter: ${relevantRecords.length}`)

    const hasDebtSchedules = (bundle.records['LLC_BI__Debt_Schedule__c'] ?? []).length > 0
    const hasProjections = (bundle.records['LLC_BI__Projection_Bundle_Junction__c'] ?? []).length > 0
    const isConsolidation = (bundle.records['LLC_BI__Underwriting_Bundle__c'] ?? [])
      .some((r) => r.LLC_BI__Is_Consolidation__c === true)

    featureFlags = relevantRecords.map((r: SfRecord) => {
      const devName = r.DeveloperName as string
      let requiredForBundle = false
      let detectionReason: string | undefined

      if (devName === 'Bundle_Management' || devName === 'Credit_Analysis') {
        requiredForBundle = true
        detectionReason = 'Always required for bundle operations'
      } else if (devName === 'Debt_Schedule' && hasDebtSchedules) {
        requiredForBundle = true
        detectionReason = 'Bundle contains debt schedule data'
      } else if (devName === 'Spreads_Projections' && hasProjections) {
        requiredForBundle = true
        detectionReason = 'Bundle contains projection junctions'
      } else if (devName === 'Financial_Consolidations' && isConsolidation) {
        requiredForBundle = true
        detectionReason = 'Bundle is a consolidation bundle'
      }

      return {
        developerName: devName,
        label: (r.Label as string) ?? devName,
        isActive: (r.nFORCE__Is_Active__c ?? r.nFORCE__Is_Enabled__c) as boolean ?? false,
        parent: (r.nFORCE__Parent__c ?? r.nFORCE__Parent_Feature__c) as string ?? '',
        version: (r.nFORCE__Version__c as string) ?? '',
        lmoPermitted: (r.nFORCE__LMO_Permitted__c as boolean) ?? false,
        developerPermitted: (r.nFORCE__Developer_Permitted__c as boolean) ?? false,
        requiredForBundle,
        detectionReason
      }
    })
    logInfo(`Feature flags: ${featureFlags.length} found`)
  } catch (err) {
    warnings.push(`Could not query nFORCE__Feature__mdt: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Step 4 — Query feature processes (query all, filter in code)
  logInfo('Step 4 — Querying feature processes')
  let featureProcesses: FeatureProcess[] = []
  try {
    const processDescribe = await conn.describe('nFORCE__Feature_Process__mdt')
    const available = new Set(processDescribe.fields.map((f) => f.name))
    const fields = pickAvailable(available, DESIRED_PROCESS_FIELDS)
    const missing = DESIRED_PROCESS_FIELDS.filter((f) => !available.has(f))
    logInfo(`Feature_Process__mdt fields — available: ${fields.join(', ')}`)
    if (missing.length > 0) logInfo(`Feature_Process__mdt fields — not found: ${missing.join(', ')}`)

    const featureFieldMeta = processDescribe.fields.find((f) => f.name === 'nFORCE__Feature__c')
    logInfo(`nFORCE__Feature__c field type: ${featureFieldMeta?.type ?? 'not found'}`)

    const fpResult = await conn.query<SfRecord>(
      `SELECT ${fields.join(', ')} FROM nFORCE__Feature_Process__mdt`
    )
    logInfo(`Feature_Process__mdt total records returned: ${fpResult.records.length}`)

    const relevantProcesses = fpResult.records.filter((r: SfRecord) => {
      const name = ((r.DeveloperName as string) ?? '').toLowerCase()
      const label = ((r.Label as string) ?? (r.MasterLabel as string) ?? '').toLowerCase()
      const feature = ((r.nFORCE__Feature__c as string) ?? '').toLowerCase()
      return RELEVANT_KEYWORDS.some((k) => name.includes(k) || label.includes(k) || feature.includes(k))
    })
    logInfo(`Feature_Process__mdt relevant after filter: ${relevantProcesses.length}`)

    featureProcesses = relevantProcesses.map((r: SfRecord) => ({
      developerName: (r.DeveloperName as string) ?? '',
      label: (r.Label as string) ?? '',
      featureName: (r.nFORCE__Feature__c ?? r.nFORCE__Feature_Name__c) as string ?? '',
      apexClass: (r.nFORCE__Apex_Class__c ?? r.nFORCE__Class_Name__c) as string ?? '',
      isActive: (r.nFORCE__Is_Active__c ?? r.nFORCE__Is_Enabled__c) as boolean ?? false,
      runOrder: (r.nFORCE__Run_Order__c ?? r.nFORCE__Order__c) as number ?? 0
    }))
    logInfo(`Feature processes: ${featureProcesses.length} found`)
  } catch (err) {
    warnings.push(`Could not query nFORCE__Feature_Process__mdt: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Step 5 — Discover custom fields on schedule objects
  logInfo('Step 5 — Discovering custom fields')
  let customScheduleEntryFields: CustomFieldDef[] = []
  let customDebtFields: CustomFieldDef[] = []
  try {
    const scheduleEntryDescribe = await conn.describe('LLC_BI__Schedule_Entry__c')
    customScheduleEntryFields = scheduleEntryDescribe.fields
      .filter((f) => f.custom && !f.name.startsWith('LLC_BI__') && !f.name.startsWith('nFORCE__'))
      .map((f) => ({
        objectApiName: 'LLC_BI__Schedule_Entry__c',
        fieldApiName: f.name,
        label: f.label,
        dataType: f.type,
        isRequired: f.nillable === false,
        usedByScheduleNames: []
      }))
    logInfo(`Custom Schedule_Entry fields: ${customScheduleEntryFields.length}`)
  } catch (err) {
    warnings.push(`Could not describe LLC_BI__Schedule_Entry__c: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    const debtDescribe = await conn.describe('LLC_BI__Debt__c')
    customDebtFields = debtDescribe.fields
      .filter((f) => f.custom && !f.name.startsWith('LLC_BI__') && !f.name.startsWith('nFORCE__'))
      .map((f) => ({
        objectApiName: 'LLC_BI__Debt__c',
        fieldApiName: f.name,
        label: f.label,
        dataType: f.type,
        isRequired: f.nillable === false,
        usedByScheduleNames: []
      }))
    logInfo(`Custom Debt fields: ${customDebtFields.length}`)
  } catch (err) {
    warnings.push(`Could not describe LLC_BI__Debt__c: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Step 6 — Derive required permission sets
  logInfo('Step 6 — Deriving required permission sets')
  const requiredPermissionSets: PermissionSetRequirement[] = [
    { name: 'Spreads_View', reason: 'Required for spread bundle access', alwaysRequired: true },
    { name: 'Spreads_Edit', reason: 'Required for spread bundle editing', alwaysRequired: true }
  ]
  const hasDebtSchedules = (bundle.records['LLC_BI__Debt_Schedule__c'] ?? []).length > 0
  const hasSensitivity = (bundle.records['LLC_BI__Sensitivity_Analysis__c'] ?? []).length > 0
  if (hasDebtSchedules || hasSensitivity) {
    requiredPermissionSets.push({
      name: 'CRE_Admin',
      reason: hasDebtSchedules && hasSensitivity
        ? 'Bundle contains debt schedules and sensitivity analysis'
        : hasDebtSchedules
          ? 'Bundle contains debt schedules'
          : 'Bundle contains sensitivity analysis',
      alwaysRequired: false
    })
  }

  logInfo(`Required permission sets: ${requiredPermissionSets.length}`)

  return {
    extractedAt: new Date().toISOString(),
    orgId,
    orgType,
    packageVersions,
    featureFlags,
    featureProcesses,
    customScheduleEntryFields,
    customDebtFields,
    requiredPermissionSets,
    warnings
  }
}
