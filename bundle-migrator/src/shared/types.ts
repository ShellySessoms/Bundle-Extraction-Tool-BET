/** Generic Salesforce record with string index */
export interface SfRecord {
  Id: string
  Name?: string
  [key: string]: unknown
}

/** Connection status for a single org */
export interface OrgStatus {
  connected: boolean
  orgId: string
  username: string
  error?: string
}

/** Which subset of bundles to search */
export type BundleSearchType = 'template' | 'bundle' | 'all'

/** List item returned by bundle search */
export interface BundleListItem {
  id: string
  name: string
  lookupKey: string
  isConsolidation: boolean
  isTemplate: boolean
  version: string
  description: string
  relationshipName?: string
  relationshipLookupKey?: string
  collateralName?: string
  financialConsolidationName?: string
}

/** Lookup / reference data needed to resolve cross-object relationships */
export interface ReferenceData {
  financialConsolidationName?: string
  classificationNames: string[]
  projectionsTemplateLookupKeys: string[]
}

/** Data that must be back-filled on the target after insert */
export interface BackfillData {
  records: { [lookupKey: string]: { [fieldName: string]: string } }
  statementTypes: { [lookupKey: string]: { [fieldName: string]: string } }
  bundleSourceTemplate?: string
}

/** Resolved reference IDs in the target org */
export interface ResolvedReferences {
  financialConsolidationId?: string
  classificationsByName: Map<string, string>
  projectionsTemplatesByKey: Map<string, string>
}

/** A record that failed during import */
export interface FailedRecord {
  objectName: string
  sourceId: string
  error: string
  record: SfRecord
}

/** Options for bundle extraction */
export interface ExtractionOptions {
  bundleId: string
  outputDirectory?: string
  includeProvisioningData: boolean
}

/** Full export payload for a single bundle */
export interface BundleExport {
  bundleId: string
  bundleName: string
  bundleLookupKey: string
  extractedAt: string
  exportFilePath: string
  referenceData: ReferenceData
  records: { [objectApiName: string]: SfRecord[] }
  backfillData: BackfillData
  provisioningData?: ProvisioningMetadata
}

export type OrgType = 'scratch' | 'sandbox' | 'production' | 'developer' | 'unknown'

export interface InstalledPackageVersion {
  namespace: string
  name: string
  majorVersion: number
  minorVersion: number
  patchVersion?: number
  versionString: string
}

export interface PackageVersions {
  llcBi?: InstalledPackageVersion
  nCred?: InstalledPackageVersion
  nForce?: InstalledPackageVersion
  nDesign?: InstalledPackageVersion
  all: InstalledPackageVersion[]
}

export interface ProvisioningMetadata {
  extractedAt: string
  orgId: string
  orgType: OrgType
  packageVersions: PackageVersions
  featureFlags: FeatureFlag[]
  featureProcesses: FeatureProcess[]
  customScheduleEntryFields: CustomFieldDef[]
  customDebtFields: CustomFieldDef[]
  requiredPermissionSets: PermissionSetRequirement[]
  warnings: string[]
}

export interface FeatureFlag {
  developerName: string
  label: string
  isActive: boolean
  parent: string
  version: string
  lmoPermitted: boolean
  developerPermitted: boolean
  requiredForBundle: boolean
  detectionReason?: string
}

export interface FeatureProcess {
  developerName: string
  label: string
  featureName: string
  apexClass: string
  isActive: boolean
  runOrder: number
}

export interface CustomFieldDef {
  objectApiName: string
  fieldApiName: string
  label: string
  dataType: string
  isRequired: boolean
  usedByScheduleNames: string[]

  formula?: string
  formulaTreatBlanksAs?: string

  referenceTo?: string
  relationshipName?: string

  picklistValues?: {
    value: string
    label: string
    isDefault: boolean
    isActive: boolean
  }[]
  isRestrictedPicklist?: boolean
  globalValueSetName?: string

  precision?: number
  scale?: number
  length?: number
}

export interface PermissionSetRequirement {
  name: string
  reason: string
  alwaysRequired: boolean
}

/** Progress event emitted during extract / import */
export interface ProgressEvent {
  stage: string
  object?: string
  phase?: string
  count?: number
  total?: number
  succeeded?: number
  failed?: number
  created?: number
  updated?: number
  status: 'success' | 'error' | 'partial'
  message?: string
}

/** Credentials for a single Salesforce org, exposed to the renderer for editing */
export interface OrgCredentials {
  username: string
  password: string
  token: string
  loginUrl: string
  accessToken?: string
  instanceUrl?: string
}

/** Jira API credentials for ticket integration */
export interface JiraCredentials {
  email: string
  apiToken: string
}

/** AWS Bedrock credentials for AI features */
export interface BedrockCredentials {
  inferenceProfileArn: string
  awsRegion: string
  awsAccessKeyId?: string
  awsSecretAccessKey?: string
  awsSessionToken?: string
}

/** All credentials for both orgs */
export interface AllCredentials {
  source: OrgCredentials
  target: OrgCredentials
  jira?: JiraCredentials
  bedrock?: BedrockCredentials
}

/** App workflow mode */
export type AppMode = 'extract-only' | 'extract-upsert' | 'upsert-only' | 'compare' | 'pdi-insight'

/** PDI Analysis request sent to the main process */
export interface PDIAnalysisRequest {
  bundle: BundleExport
  pdiDescription: string
  affectedArea?: string
  errorMessage?: string
  jiraUrl?: string
}

/** PDI Analysis result returned from the main process */
export interface PDIAnalysisResult {
  analysis: string
  verdict?: 'likely' | 'possibly' | 'unlikely'
  templateName: string
  analyzedAt: string
}

/** Result of comparing two bundle exports */
export interface BundleComparison {
  bundleAName: string
  bundleBName: string
  bundleAExtractedAt: string
  bundleBExtractedAt: string
  bundleARecordCount: number
  bundleBRecordCount: number
  comparedAt: string
  summary: ComparisonSummary
  statementTypes: StatementTypeComparison[]
  schedules: ScheduleComparison[]
  debtSchedules: DebtScheduleComparison[]
  topLevel: TopLevelDifference[]
}

export interface ComparisonSummary {
  totalStatementTypes: number
  sharedStatementTypes: number
  onlyInA: number
  onlyInB: number
  statementsWithDifferences: number
  totalRowDifferences: number
  totalScheduleDifferences: number
  identical: boolean
}

export type CompareStatus = 'only-in-a' | 'only-in-b' | 'shared'

export interface StatementTypeComparison {
  label: string
  status: CompareStatus
  rowDifferences: RowDifference[]
  totalDifferences: TotalDifference[]
  rowCountA: number
  rowCountB: number
  totalCountA: number
  totalCountB: number
  hasDifferences: boolean
}

export interface RowDifference {
  label: string
  status: 'only-in-a' | 'only-in-b' | 'config-different'
  fieldDiffs?: FieldDiff[]
}

export interface TotalDifference {
  label: string
  status: 'only-in-a' | 'only-in-b' | 'config-different'
  fieldDiffs?: FieldDiff[]
}

export interface ScheduleComparison {
  name: string
  status: CompareStatus
  entryCountA?: number
  entryCountB?: number
  sectionCountA?: number
  sectionCountB?: number
  configDiffs?: FieldDiff[]
}

export interface DebtScheduleComparison {
  name: string
  status: CompareStatus
  debtCountA?: number
  debtCountB?: number
  configDiffs?: FieldDiff[]
}

export interface TopLevelDifference {
  label: string
  description: string
  severity: 'high' | 'medium' | 'low'
}

export interface FieldDiff {
  fieldName: string
  labelA: string | null
  labelB: string | null
  valueA: unknown
  valueB: unknown
}

/** Manifest for future provisioning support */
export interface ManifestConfig {
  version: string
  sourceApiVersion: string
  components: {
    objectApiName: string
    externalIdField: string
    insertOrder: number
    recordCount: number
  }[]
}

export interface ManifestFile {
  filename: string
  relativePath: string
  type: string
  description: string
  alwaysRequired: boolean
  skipIfExists: boolean
  generatedFrom: 'json' | 'org-query' | 'derived' | 'static'
  incomplete: boolean
  itemCount?: number
}

export interface ManifestSummary {
  bundleName: string
  generatedAt: string
  mode: 'full' | 'offline'
  totalFiles: number
  requiredSteps: number
  optionalSteps: number
  incompleteFiles: number
  featuresDetected: string[]
  warnings: string[]
}

export interface ManifestPackage {
  manifestDir: string
  bundleName: string
  mode: 'full' | 'offline'
  files: ManifestFile[]
  summary: ManifestSummary
}

/** Summary returned after a bundle import completes */
export interface ImportSummary {
  totalRecords: number
  succeeded: number
  failed: number
  byObject: { [objectApiName: string]: { created: number; updated: number; failed: number } }
  failedRecords: FailedRecord[]
  aborted?: boolean
  abortReason?: string
  schemaDeployResult?: {
    deployed: string[]
    skipped: string[]
    failed: { fieldName: string; error: string }[]
  }
}
