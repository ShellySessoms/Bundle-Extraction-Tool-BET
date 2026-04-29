import { mkdirSync, writeFileSync, copyFileSync } from 'fs'
import { join } from 'path'
import log from 'electron-log/main'
import type { BundleExport, ManifestPackage, ManifestFile, SfRecord } from '../shared/types'

export function generateManifest(
  bundle: BundleExport,
  outputDir: string
): ManifestPackage {
  const safeName = bundle.bundleName.replace(/[^a-zA-Z0-9_\-]/g, '_')
  const timestamp = Date.now()
  const manifestDir = join(outputDir, 'manifests', `${safeName}_${timestamp}`)

  mkdirSync(join(manifestDir, 'metadata'), { recursive: true })
  mkdirSync(join(manifestDir, 'security'), { recursive: true })
  mkdirSync(join(manifestDir, 'schema'), { recursive: true })

  log.info(`Generating manifest in ${manifestDir}`)

  copyFileSync(bundle.exportFilePath, join(manifestDir, 'bundle-data.json'))

  const records = bundle.records
  const prov = bundle.provisioningData
  const hasDebtSchedules = (records['LLC_BI__Debt_Schedule__c'] ?? []).length > 0
  const hasProjections = (records['LLC_BI__Projection_Bundle_Junction__c'] ?? []).length > 0
  const bundleRecord = (records['LLC_BI__Underwriting_Bundle__c'] ?? [])[0] as SfRecord | undefined
  const hasConsolidation = bundleRecord?.LLC_BI__Is_Consolidation__c === true
  const hasSchedules = (records['LLC_BI__Schedule__c'] ?? []).length > 0
  const hasClassifications = (records['LLC_BI__Spread_Record_Classification__c'] ?? []).length > 0

  const detectedFeatures: string[] = ['Bundle_Management', 'Credit_Analysis', 'Formula_Creator']
  if (hasDebtSchedules) detectedFeatures.push('Debt_Schedule')
  if (hasProjections) detectedFeatures.push('Spreads_Projections')
  if (hasConsolidation) detectedFeatures.push('Financial_Consolidations')
  if (hasSchedules) detectedFeatures.push('Schedules')
  if (hasClassifications) detectedFeatures.push('RMA_Benchmarking')

  // ── Feature flags ──
  const featureFlagsFromOrg = prov?.featureFlags ?? []
  let featureFlagItems: unknown[]
  let featureFlagsGeneratedFrom: 'org-query' | 'derived'

  if (featureFlagsFromOrg.length > 0) {
    featureFlagsGeneratedFrom = 'org-query'
    featureFlagItems = featureFlagsFromOrg.map((f) => ({
      ...f,
      requiredForBundle: f.requiredForBundle ||
        detectedFeatures.includes(f.developerName)
    }))
  } else {
    featureFlagsGeneratedFrom = 'derived'
    featureFlagItems = [
      { developerName: 'Bundle_Management', requiredForBundle: true,
        note: 'Always required', detectedFrom: 'derived' },
      { developerName: 'Credit_Analysis', requiredForBundle: true,
        note: 'Always required', detectedFrom: 'derived' },
      { developerName: 'Debt_Schedule', requiredForBundle: hasDebtSchedules,
        note: hasDebtSchedules ? 'Bundle contains debt schedules' : 'Not used by this bundle',
        detectedFrom: 'derived' },
      { developerName: 'Spreads_Projections', requiredForBundle: hasProjections,
        note: hasProjections ? 'Bundle contains projection junctions' : 'Not used',
        detectedFrom: 'derived' },
      { developerName: 'Financial_Consolidations', requiredForBundle: hasConsolidation,
        note: hasConsolidation ? 'This is a consolidation bundle' : 'Not used',
        detectedFrom: 'derived' },
      { developerName: 'Formula_Creator', requiredForBundle: true,
        note: 'Required for formula editing', detectedFrom: 'derived' },
      { developerName: 'RMA_Benchmarking', requiredForBundle: hasClassifications,
        note: hasClassifications ? 'Bundle has RMA classifications' : 'Not used',
        detectedFrom: 'derived' }
    ]
  }

  const featureFlagsOutput = {
    _comment: 'Feature flags required for this bundle. Set skipIfExists: true in state-config.json if already configured.',
    _generatedFrom: featureFlagsGeneratedFrom,
    _incomplete: featureFlagsGeneratedFrom === 'derived',
    features: featureFlagItems
  }
  writeFileSync(
    join(manifestDir, 'metadata', 'feature-flags.json'),
    JSON.stringify(featureFlagsOutput, null, 2)
  )

  // ── Feature processes ──
  const processesFromOrg = prov?.featureProcesses ?? []
  const featureProcessesOutput = processesFromOrg.length > 0
    ? {
        _comment: 'Feature processes for this bundle. Optional if already configured.',
        _generatedFrom: 'org-query',
        _incomplete: false,
        processes: processesFromOrg
      }
    : {
        _comment: 'Feature processes for this bundle. Optional if already configured.',
        _incomplete: true,
        _incompleteReason: 'Requires org connection to query. Re-extract with provisioning checkbox to populate.',
        processes: []
      }
  writeFileSync(
    join(manifestDir, 'metadata', 'feature-processes.json'),
    JSON.stringify(featureProcessesOutput, null, 2)
  )

  // ── package.xml ──
  const customFields = [
    ...(prov?.customScheduleEntryFields ?? []),
    ...(prov?.customDebtFields ?? [])
  ]

  let packageXml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">`

  if (customFields.length > 0) {
    packageXml += `
  <types>`
    for (const field of customFields) {
      packageXml += `
    <members>${field.objectApiName}.${field.fieldApiName}</members>`
    }
    packageXml += `
    <name>CustomField</name>
  </types>`
  } else {
    packageXml += `
  <!-- No custom fields detected -->
  <!-- Re-extract with provisioning checkbox and org connection to discover custom fields -->`
  }

  packageXml += `
  <version>62.0</version>
</Package>`

  writeFileSync(join(manifestDir, 'metadata', 'package.xml'), packageXml)

  // ── Permission sets ──
  const permSetsOutput = {
    _comment: 'Permission sets required for this bundle. Optional if already assigned in your org.',
    required: [
      { name: 'Spreads_View', reason: 'Read access to Spreads objects',
        alwaysRequired: true, skipIfExists: true },
      { name: 'Spreads_Edit', reason: 'Write access to Spreads objects',
        alwaysRequired: true, skipIfExists: true }
    ],
    conditional: [
      { name: 'CRE_Admin',
        reason: 'Required for Debt Schedule and CRE Analysis',
        requiredIf: 'Bundle contains debt schedules or sensitivity analysis',
        bundleHasThis: hasDebtSchedules,
        skipIfExists: true }
    ]
  }
  writeFileSync(
    join(manifestDir, 'security', 'permission-sets.json'),
    JSON.stringify(permSetsOutput, null, 2)
  )

  // ── User assignments ──
  const userAssignments = {
    _comment: 'Profile and role access requirements. Optional if already configured.',
    minimumProfiles: ['Standard User', 'System Administrator'],
    packageLicenseRequired: 'LLC_BI',
    notes: [
      'Users need LLC_BI package license assigned in org',
      'Running user must have CRUD access to LLC_BI objects',
      'Recommend assigning Spreads_View and Spreads_Edit permission sets'
    ]
  }
  writeFileSync(
    join(manifestDir, 'security', 'user-assignments.json'),
    JSON.stringify(userAssignments, null, 2)
  )

  // ── Custom fields ──
  const hasCustomFields = customFields.length > 0
  const customFieldsOutput = hasCustomFields
    ? {
        _comment: 'Custom fields required by schedule sections.',
        _generatedFrom: 'org-query',
        _incomplete: false,
        fields: customFields,
        totalCustomFields: customFields.length
      }
    : {
        _comment: 'Custom fields required by schedule sections.',
        _incomplete: true,
        _incompleteReason: 'Requires org connection to discover. Re-extract with provisioning checkbox.',
        fields: [],
        totalCustomFields: 0
      }
  writeFileSync(
    join(manifestDir, 'schema', 'custom-fields.json'),
    JSON.stringify(customFieldsOutput, null, 2)
  )

  // ── state-config.json ──
  const stateConfig = {
    version: '1.0',
    bundleName: bundle.bundleName,
    bundleLookupKey: bundle.bundleLookupKey,
    generatedAt: new Date().toISOString(),
    generatedBy: 'Bundle Extraction Tool (BET) v1.0',
    generationMode: prov ? 'full' : 'offline',
    llcBiPackageVersion: prov?.packageVersions?.llcBi?.versionString ?? 'unknown',
    orgType: prov?.orgType ?? 'unknown',
    orgId: prov?.orgId ?? 'unknown',
    bundleStats: {
      statementTypes: (records['LLC_BI__Spread_Statement_Type__c'] ?? []).length,
      totalRows: (records['LLC_BI__Spread_Statement_Record__c'] ?? []).length,
      schedules: (records['LLC_BI__Schedule__c'] ?? []).length,
      debtSchedules: (records['LLC_BI__Debt_Schedule__c'] ?? []).length,
      classifications: (records['LLC_BI__Classification__c'] ?? []).length
    },
    _instructions: 'Set skipIfExists: true for steps already handled by your org state provisioning pipeline',
    provisioningSteps: [
      {
        order: 1,
        stepId: 'feature-flags',
        type: 'metadata-deploy',
        description: 'Enable required nCino feature flags',
        file: './metadata/feature-flags.json',
        alwaysRequired: false,
        skipIfExists: true,
        incomplete: !prov || featureFlagsFromOrg.length === 0,
        note: 'Optional — skip if feature flags already configured in your state provisioning'
      },
      {
        order: 2,
        stepId: 'feature-processes',
        type: 'metadata-deploy',
        description: 'Configure nCino feature processes',
        file: './metadata/feature-processes.json',
        alwaysRequired: false,
        skipIfExists: true,
        incomplete: !prov || processesFromOrg.length === 0,
        note: 'Optional — skip if already configured'
      },
      {
        order: 3,
        stepId: 'permission-sets',
        type: 'permission-assignment',
        description: 'Assign required Spreads permission sets',
        file: './security/permission-sets.json',
        alwaysRequired: false,
        skipIfExists: true,
        note: 'Optional — skip if already assigned in your org setup'
      },
      {
        order: 4,
        stepId: 'custom-fields',
        type: 'schema-deploy',
        description: 'Create custom fields for schedule sections',
        file: './schema/custom-fields.json',
        alwaysRequired: false,
        skipIfExists: true,
        incomplete: !prov,
        note: 'Only needed if template uses custom schedule columns'
      },
      {
        order: 5,
        stepId: 'bundle-upsert',
        type: 'bundle-migrator-upsert',
        description: 'Load underwriting bundle template',
        file: './bundle-data.json',
        alwaysRequired: true,
        skipIfExists: false,
        note: 'Always run — upserts are idempotent via LLC_BI__lookupKey__c'
      }
    ]
  }
  writeFileSync(
    join(manifestDir, 'state-config.json'),
    JSON.stringify(stateConfig, null, 2)
  )

  // ── README.md ──
  const stats = stateConfig.bundleStats
  const modeLabel = prov ? 'Full (org-connected)' : 'Offline (from JSON only)'
  const llcVersion = prov?.packageVersions?.llcBi?.versionString ?? 'Unknown'
  const offlineNote = prov
    ? ''
    : '\n- Re-extract with "Include state provisioning data" checkbox for complete feature flag and custom field data'

  const readme = `# ${bundle.bundleName} — State Provisioning Manifest

**Generated:** ${new Date().toLocaleString()}
**Generated by:** Bundle Extraction Tool (BET)
**Mode:** ${modeLabel}
**LLC_BI Version:** ${llcVersion}

## Bundle Contents
- Statement Types: ${stats.statementTypes}
- Total Rows: ${stats.totalRows}
- Schedules: ${stats.schedules}
- Debt Schedules: ${stats.debtSchedules}
- Classifications: ${stats.classifications}

## Files in This Package

| File | Required | Description |
|------|----------|-------------|
| bundle-data.json | Always | The bundle template data — load via BET |
| metadata/feature-flags.json | Optional | nCino feature flags |
| metadata/feature-processes.json | Optional | nCino feature processes |
| metadata/package.xml | Optional | SFDX deployment manifest |
| security/permission-sets.json | Optional | Required permission sets |
| security/user-assignments.json | Optional | Profile/role requirements |
| schema/custom-fields.json | Optional | Custom schedule fields |

## Provisioning Steps

Steps marked **Optional** can be skipped if already handled
by your org state provisioning pipeline.

### Step 1: Feature Flags (Optional)
Enable required nCino feature flags listed in \`metadata/feature-flags.json\`.
Skip if feature flags are already configured in your org.

### Step 2: Feature Processes (Optional)
Configure nCino feature processes listed in \`metadata/feature-processes.json\`.
Skip if already configured.

### Step 3: Permission Sets (Optional)
Assign required Spreads permission sets listed in \`security/permission-sets.json\`.
Skip if already assigned in your org setup.

### Step 4: Custom Fields (Optional)
Create custom fields listed in \`schema/custom-fields.json\`.
Only needed if this template uses custom schedule columns.

### Step 5: Load Bundle (Required — always run)
1. Open Bundle Extraction Tool (BET)
2. Select "Upsert Only" mode
3. Load \`bundle-data.json\`
4. Connect to target org
5. Upsert

## Notes
- All upserts are idempotent via LLC_BI__lookupKey__c
- Running twice will update existing records, not create duplicates${offlineNote}
`
  writeFileSync(join(manifestDir, 'README.md'), readme)

  // ── Build return value ──
  const files: ManifestFile[] = [
    { filename: 'bundle-data.json', relativePath: './bundle-data.json',
      type: 'bundle-data', description: 'Bundle template records',
      alwaysRequired: true, skipIfExists: false,
      generatedFrom: 'json', incomplete: false },
    { filename: 'feature-flags.json', relativePath: './metadata/feature-flags.json',
      type: 'feature-flags', description: 'nCino feature flag configuration',
      alwaysRequired: false, skipIfExists: true,
      generatedFrom: featureFlagsGeneratedFrom,
      incomplete: featureFlagsGeneratedFrom === 'derived',
      itemCount: featureFlagItems.length },
    { filename: 'feature-processes.json', relativePath: './metadata/feature-processes.json',
      type: 'feature-processes', description: 'nCino feature process configuration',
      alwaysRequired: false, skipIfExists: true,
      generatedFrom: processesFromOrg.length > 0 ? 'org-query' : 'derived',
      incomplete: processesFromOrg.length === 0,
      itemCount: processesFromOrg.length },
    { filename: 'package.xml', relativePath: './metadata/package.xml',
      type: 'package-xml', description: 'SFDX deployment manifest for custom fields',
      alwaysRequired: false, skipIfExists: true,
      generatedFrom: customFields.length > 0 ? 'org-query' : 'derived',
      incomplete: customFields.length === 0,
      itemCount: customFields.length },
    { filename: 'permission-sets.json', relativePath: './security/permission-sets.json',
      type: 'permission-sets', description: 'Required Spreads permission sets',
      alwaysRequired: false, skipIfExists: true,
      generatedFrom: 'static', incomplete: false },
    { filename: 'user-assignments.json', relativePath: './security/user-assignments.json',
      type: 'user-assignments', description: 'Profile and role access requirements',
      alwaysRequired: false, skipIfExists: true,
      generatedFrom: 'static', incomplete: false },
    { filename: 'custom-fields.json', relativePath: './schema/custom-fields.json',
      type: 'custom-fields', description: 'Custom schedule section fields',
      alwaysRequired: false, skipIfExists: true,
      generatedFrom: hasCustomFields ? 'org-query' : 'derived',
      incomplete: !hasCustomFields,
      itemCount: customFields.length },
    { filename: 'state-config.json', relativePath: './state-config.json',
      type: 'state-config', description: 'Provisioning orchestration config',
      alwaysRequired: true, skipIfExists: false,
      generatedFrom: 'json', incomplete: false },
    { filename: 'README.md', relativePath: './README.md',
      type: 'readme', description: 'Human-readable provisioning guide',
      alwaysRequired: false, skipIfExists: false,
      generatedFrom: 'json', incomplete: false }
  ]

  const result: ManifestPackage = {
    manifestDir,
    bundleName: bundle.bundleName,
    mode: prov ? 'full' : 'offline',
    files,
    summary: {
      bundleName: bundle.bundleName,
      generatedAt: new Date().toISOString(),
      mode: prov ? 'full' : 'offline',
      totalFiles: files.length,
      requiredSteps: files.filter((f) => f.alwaysRequired).length,
      optionalSteps: files.filter((f) => !f.alwaysRequired).length,
      incompleteFiles: files.filter((f) => f.incomplete).length,
      featuresDetected: detectedFeatures,
      warnings: prov?.warnings ?? []
    }
  }

  log.info('Manifest generation complete', {
    dir: manifestDir,
    mode: result.mode,
    files: files.length,
    incomplete: result.summary.incompleteFiles
  })

  return result
}
