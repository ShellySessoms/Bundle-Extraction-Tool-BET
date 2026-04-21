/**
 * Reusable mock data for Extract & Upsert E2E tests.
 *
 * Mirrors the shape of real Salesforce API responses and IPC payloads
 * so the renderer components behave as they would with a live org.
 */

export const MOCK_BUNDLES_TEMPLATES = [
  {
    id: 'a0B000000000001TST',
    name: 'QA Testing Template v5',
    lookupKey: 'QA_Testing_Template_v5',
    isConsolidation: false,
    isTemplate: true,
    version: '5',
    description: 'Template used for QA testing',
    relationshipName: '',
    relationshipLookupKey: '',
    collateralName: '',
    financialConsolidationName: ''
  },
  {
    id: 'a0B000000000002TST',
    name: 'Client Template v3',
    lookupKey: 'Client_Template_v3',
    isConsolidation: false,
    isTemplate: true,
    version: '3',
    description: 'Standard client template',
    relationshipName: '',
    relationshipLookupKey: '',
    collateralName: '',
    financialConsolidationName: ''
  },
  {
    id: 'a0B000000000003TST',
    name: 'CRE Consolidation Template',
    lookupKey: 'CRE_Consolidation',
    isConsolidation: true,
    isTemplate: true,
    version: '1',
    description: 'Commercial Real Estate consolidation template',
    relationshipName: '',
    relationshipLookupKey: '',
    collateralName: '',
    financialConsolidationName: 'CRE Consolidation'
  }
]

export const MOCK_BUNDLES_ALL = [
  ...MOCK_BUNDLES_TEMPLATES,
  {
    id: 'a0B000000000004TST',
    name: 'Acme Corp Q4 Bundle',
    lookupKey: 'Acme_Corp_Q4',
    isConsolidation: false,
    isTemplate: false,
    version: '1',
    description: '',
    relationshipName: 'Acme Corporation',
    relationshipLookupKey: 'ACME_001',
    collateralName: '123 Main St',
    financialConsolidationName: ''
  }
]

export const MOCK_EXTRACT_PROGRESS = [
  { stage: 'extract', object: 'LLC_BI__Underwriting_Bundle__c', count: 1, status: 'success' },
  { stage: 'extract', object: 'LLC_BI__Spread_Statement_Type__c', count: 3, status: 'success' },
  { stage: 'extract', object: 'LLC_BI__Spread_Statement_Record__c', count: 5, status: 'success' },
  { stage: 'extract', object: 'LLC_BI__Spread_Statement_Period__c', count: 0, status: 'success' },
  { stage: 'extract', object: 'LLC_BI__Spread_Statement_Record_Value__c', count: 0, status: 'success' },
  { stage: 'extract', object: 'LLC_BI__Spread_Statement_Record_Total__c', count: 1, status: 'success' },
  { stage: 'extract', object: 'LLC_BI__Schedule__c', count: 1, status: 'success' },
  { stage: 'extract', object: 'LLC_BI__Schedule_Entry__c', count: 2, status: 'success' }
]

export const MOCK_BUNDLE_EXPORT = {
  bundleId: 'a0B000000000001TST',
  bundleName: 'QA Testing Template v5',
  bundleLookupKey: 'QA_Testing_Template_v5',
  extractedAt: '2026-04-18T10:00:00.000Z',
  exportFilePath: '/tmp/test-export/QA_Testing_Template_v5.json',
  referenceData: {
    financialConsolidationName: 'Standard Consolidation',
    classificationNames: ['Commercial', 'Real Estate'],
    projectionsTemplateLookupKeys: ['PROJ_TEMPLATE_001']
  },
  records: {
    'LLC_BI__Underwriting_Bundle__c': [
      { Id: 'a0B000000000001TST', Name: 'QA Testing Template v5', LLC_BI__lookupKey__c: 'QA_Testing_Template_v5' }
    ],
    'LLC_BI__Spread_Statement_Type__c': [
      { Id: 'a0C001', Name: '000007923', LLC_BI__lookupKey__c: '42160186225772921', LLC_BI__Type__c: 'Income Statement' },
      { Id: 'a0C002', Name: '000007924', LLC_BI__lookupKey__c: '42295972277995789', LLC_BI__Type__c: 'Balance Sheet' },
      { Id: 'a0C003', Name: '000007920', LLC_BI__lookupKey__c: '42828974535248196', LLC_BI__Type__c: 'Summary Direct CF' }
    ],
    'LLC_BI__Spread_Statement_Record__c': [
      { Id: 'a0D001', Name: 'Total Sales' },
      { Id: 'a0D002', Name: 'Cost of Goods Sold' },
      { Id: 'a0D003', Name: 'Total Assets' }
    ],
    'LLC_BI__Spread_Statement_Period__c': [],
    'LLC_BI__Spread_Statement_Record_Value__c': [],
    'LLC_BI__Spread_Statement_Record_Total__c': [
      { Id: 'a0E001', Name: '000008001', LLC_BI__Title__c: 'Net Income' }
    ],
    'LLC_BI__Spread_Statement_Period_Total__c': [],
    'LLC_BI__Spread_Record_Classification__c': [
      { Id: 'a0F001', LLC_BI__lookupKey__c: 'CLASS_COMMERCIAL_001' },
      { Id: 'a0F002', LLC_BI__lookupKey__c: 'CLASS_REAL_ESTATE_001' }
    ],
    'LLC_BI__Spread_Statement_Row_Mapping__c': [
      { Id: 'a0G001', LLC_BI__lookupKey__c: 'ROWMAP_001' },
      { Id: 'a0G002', LLC_BI__lookupKey__c: 'ROWMAP_002' }
    ],
    'LLC_BI__Projection_Bundle_Junction__c': [
      { Id: 'a0H001', LLC_BI__Projection_Template__c: 'PROJ_001' }
    ],
    'LLC_BI__Spread_Projections_Driver__c': [],
    'LLC_BI__Schedule__c': [
      { Id: 'a0I001', Name: 'Amortization Schedule' }
    ],
    'LLC_BI__Schedule_Entry__c': [
      { Id: 'a0J001', LLC_BI__lookupKey__c: 'SCHED_ENTRY_001' },
      { Id: 'a0J002', LLC_BI__lookupKey__c: 'SCHED_ENTRY_002' }
    ],
    'LLC_BI__Schedule_Section__c': [],
    'LLC_BI__Debt_Schedule__c': [
      { Id: 'a0K001', Name: 'Primary Debt Schedule' }
    ],
    'LLC_BI__Debt__c': [
      { Id: 'a0L001', LLC_BI__lookupKey__c: 'DEBT_001' },
      { Id: 'a0L002', LLC_BI__lookupKey__c: 'DEBT_002' }
    ],
    'LLC_BI__Debt_Internal__c': [],
    'LLC_BI__Loan_Assumptions__c': [
      { Id: 'a0M001', LLC_BI__lookupKey__c: 'LOAN_ASSUMPTION_001' }
    ]
  },
  backfillData: { records: {}, statementTypes: {} }
}

export const MOCK_IMPORT_PROGRESS = [
  { stage: 'resolve', phase: 'resolve', object: '', count: 0, status: 'success', message: 'Resolved references' },
  { stage: 'import', object: 'LLC_BI__Underwriting_Bundle__c', count: 1, total: 1, succeeded: 1, failed: 0, status: 'success' },
  { stage: 'import', object: 'LLC_BI__Spread_Statement_Type__c', count: 3, total: 3, succeeded: 3, failed: 0, status: 'success' },
  { stage: 'import', object: 'LLC_BI__Spread_Statement_Record__c', count: 3, total: 3, succeeded: 3, failed: 0, status: 'success' },
  { stage: 'backfill', phase: 'backfill', object: '', count: 0, status: 'success', message: 'Backfill complete' },
  { stage: 'complete', phase: 'complete', object: '', count: 0, status: 'success', message: 'Import complete' }
]

export const MOCK_IMPORT_SUMMARY_SUCCESS = {
  totalRecords: 12,
  succeeded: 12,
  failed: 0,
  byObject: {
    'LLC_BI__Underwriting_Bundle__c': { created: 1, failed: 0 },
    'LLC_BI__Spread_Statement_Type__c': { created: 3, failed: 0 },
    'LLC_BI__Spread_Statement_Record__c': { created: 3, failed: 0 },
    'LLC_BI__Spread_Statement_Record_Total__c': { created: 1, failed: 0 },
    'LLC_BI__Schedule__c': { created: 1, failed: 0 },
    'LLC_BI__Schedule_Entry__c': { created: 2, failed: 0 },
    'LLC_BI__Debt_Schedule__c': { created: 1, failed: 0 }
  },
  failedRecords: []
}

export const MOCK_IMPORT_SUMMARY_PARTIAL = {
  totalRecords: 12,
  succeeded: 10,
  failed: 2,
  byObject: {
    'LLC_BI__Underwriting_Bundle__c': { created: 1, failed: 0 },
    'LLC_BI__Spread_Statement_Type__c': { created: 3, failed: 0 },
    'LLC_BI__Spread_Statement_Record__c': { created: 1, failed: 2 },
    'LLC_BI__Spread_Statement_Record_Total__c': { created: 1, failed: 0 },
    'LLC_BI__Schedule__c': { created: 1, failed: 0 },
    'LLC_BI__Schedule_Entry__c': { created: 2, failed: 0 },
    'LLC_BI__Debt_Schedule__c': { created: 1, failed: 0 }
  },
  failedRecords: [
    {
      objectName: 'LLC_BI__Spread_Statement_Record__c',
      sourceId: 'a0D002',
      error: 'DUPLICATE_VALUE: duplicate value found: LLC_BI__lookupKey__c',
      record: { Id: 'a0D002', Name: 'Cost of Goods Sold', LLC_BI__lookupKey__c: '42349822639005433' }
    },
    {
      objectName: 'LLC_BI__Spread_Statement_Record__c',
      sourceId: 'a0D003',
      error: 'REQUIRED_FIELD_MISSING: Required fields are missing: [LLC_BI__Formula__c]',
      record: { Id: 'a0D003', Name: 'Total Assets', LLC_BI__lookupKey__c: '42947150312019563' }
    }
  ]
}

export const MOCK_IMPORT_PROGRESS_WITH_ERRORS = [
  { stage: 'resolve', phase: 'resolve', object: '', count: 0, status: 'success', message: 'Resolved references' },
  { stage: 'import', object: 'LLC_BI__Underwriting_Bundle__c', count: 1, total: 1, succeeded: 1, failed: 0, status: 'success' },
  { stage: 'import', object: 'LLC_BI__Spread_Statement_Type__c', count: 3, total: 3, succeeded: 3, failed: 0, status: 'success' },
  { stage: 'import', object: 'LLC_BI__Spread_Statement_Record__c', count: 3, total: 3, succeeded: 1, failed: 2, status: 'partial', message: '2 records failed' },
  { stage: 'backfill', phase: 'backfill', object: '', count: 0, status: 'success', message: 'Backfill complete' },
  { stage: 'complete', phase: 'complete', object: '', count: 0, status: 'success', message: 'Import complete' }
]
