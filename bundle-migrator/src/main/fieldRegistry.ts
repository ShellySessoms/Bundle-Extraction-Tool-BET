export interface FieldRegistryEntry {
  fields: string[]
  externalIdField: string
  insertOrder: number
  excludeFilter?: string
  backfillFields?: string[]
  excludeFields?: string[]
}

export const FIELD_REGISTRY: Record<string, FieldRegistryEntry> = {
  'LLC_BI__Classification__c': {
    fields: [
      'Name',
      'LLC_BI__lookupKey__c',
      'LLC_BI__Category__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 0,
    excludeFilter: "LLC_BI__Category__c != 'nCino Standard Tags'"
  },

  'LLC_BI__Underwriting_Bundle__c': {
    fields: [
      'Name',
      'LLC_BI__Description__c',
      'LLC_BI__Is_Disabled__c',
      'LLC_BI__Is_Template__c',
      'LLC_BI__lookupKey__c',
      'LLC_BI__Selected_Scale__c',
      'LLC_BI__Show_Footnotes__c',
      'LLC_BI__Object_API_Name__c',
      'LLC_BI__Is_Consolidation__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 1
  },

  'LLC_BI__Spread_Statement_Type__c': {
    fields: [
      'LLC_BI__Allow_Record_Filtering__c',
      'LLC_BI__Balance_Total__c',
      'LLC_BI__Borrower_Type__c',
      'LLC_BI__Bundle__r.LLC_BI__lookupKey__c',
      'LLC_BI__Calc_Common_Sizing_Record__r.LLC_BI__lookupKey__c',
      'LLC_BI__Calc_Common_Sizing_Total_Group__r.LLC_BI__lookupKey__c',
      'LLC_BI__Description__c',
      'LLC_BI__Display_Common_Sizing__c',
      'LLC_BI__Display_Trend__c',
      'LLC_BI__End_Date_Quarter__c',
      'LLC_BI__Entity_Type__c',
      'LLC_BI__Group_Columns__c',
      'LLC_BI__Interaction__c',
      'LLC_BI__Is_Template__c',
      'LLC_BI__lookupKey__c',
      'LLC_BI__Sort_Order__c',
      'LLC_BI__Start_Date_Quarter__c',
      'LLC_BI__Static_Periods__c',
      'LLC_BI__Supports_Common_Sizing__c',
      'LLC_BI__Total_Hide_Currency_Symbol__c',
      'LLC_BI__Total_Row_Name__c',
      'LLC_BI__Type__c',
      'LLC_BI__Is_Multi_Currency__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 2,
    excludeFilter: "LLC_BI__Type__c != 'Highlights'",
    backfillFields: [
      'LLC_BI__Calc_Common_Sizing_Record__c',
      'LLC_BI__Calc_Common_Sizing_Total_Group__c'
    ],
    excludeFields: ['LLC_BI__Source_Statement__c']
  },

  'LLC_BI__Spread_Statement_Record_Total__c': {
    fields: [
      'Name',
      'LLC_BI__Debit__c',
      'LLC_BI__Global_Analysis_Type__c',
      'LLC_BI__Group_Type__c',
      'LLC_BI__Hide_All_Records__c',
      'LLC_BI__Hide_Column_Totals__c',
      'LLC_BI__Hide_Currency_Symbol__c',
      'LLC_BI__Include_In_Total__c',
      'LLC_BI__Is_Summary_Group__c',
      'LLC_BI__KPI_Type__c',
      'LLC_BI__lookupKey__c',
      'LLC_BI__Publish_On_Init_Event__c',
      'LLC_BI__Publish_On_Update_Event__c',
      'LLC_BI__Row_Number__c',
      'LLC_BI__Spread_Statement_Type__r.LLC_BI__lookupKey__c',
      'LLC_BI__Title__c',
      'LLC_BI__Total_Type__c',
      'LLC_BI__Is_Balance_Check__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 3,
    excludeFields: ['LLC_BI__Source_Group__c']
  },

  'LLC_BI__Spread_Statement_Record__c': {
    fields: [
      'Name',
      'LLC_BI__Formula__c',
      'LLC_BI__Debit__c',
      'LLC_BI__Display_Type__c',
      'LLC_BI__Include_In_Total__c',
      'LLC_BI__KPI_Type__c',
      'LLC_BI__Linked_Spread_Statement_Record__r.LLC_BI__lookupKey__c',
      'LLC_BI__Linked_Spread_Statement_Total_Group__r.LLC_BI__lookupKey__c',
      'LLC_BI__lookupKey__c',
      'LLC_BI__Operation__c',
      'LLC_BI__Period_Over_Period_Change__c',
      'LLC_BI__Prior_Fiscal_Year__c',
      'LLC_BI__Period_Over_Prior_Fiscal_Year__c',
      'LLC_BI__Record_Type__c',
      'LLC_BI__Row_Number__c',
      'LLC_BI__Spread_Statement_Record_Total__r.LLC_BI__lookupKey__c',
      'LLC_BI__Spread_Statement_Type__r.LLC_BI__lookupKey__c',
      'LLC_BI__Formula_Long_Text__c',
      'LLC_BI__Associated_Parent_Record__r.LLC_BI__lookupKey__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 4,
    backfillFields: [
      'LLC_BI__Linked_Spread_Statement_Record__c',
      'LLC_BI__Linked_Spread_Statement_Total_Group__c',
      'LLC_BI__Associated_Parent_Record__c'
    ],
    excludeFields: ['LLC_BI__Source_Row__c', 'LLC_BI__Cloned_Source_Row__c']
  },

  'LLC_BI__Spread_Record_Classification__c': {
    fields: [
      'Name',
      'LLC_BI__lookupKey__c',
      'LLC_BI__Classification__r.LLC_BI__lookupKey__c',
      'LLC_BI__Spread_Statement_Record__r.LLC_BI__lookupKey__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 7
  },

  'LLC_BI__Spread_Record_Total_Classification__c': {
    fields: [
      'Name',
      'LLC_BI__lookupKey__c',
      'LLC_BI__Classification__r.LLC_BI__lookupKey__c',
      'LLC_BI__Spread_Statement_Total_Group__r.LLC_BI__lookupKey__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 8
  },

  'LLC_BI__Tenant_Information__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__Spread_Statement_Template__r.LLC_BI__lookupKey__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 9
  },

  'LLC_BI__Sensitivity_Analysis__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__Bundle__r.LLC_BI__lookupKey__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 10
  },

  'LLC_BI__Loan_Assumptions__c': {
    fields: [
      'Name',
      'LLC_BI__lookupKey__c',
      'LLC_BI__Bundle__r.LLC_BI__lookupKey__c',
      'LLC_BI__Interest_Rate__c',
      'LLC_BI__Policy_DSCR__c',
      'LLC_BI__Policy_LTV__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 11
  },

  'LLC_BI__Spread_Statement_Period__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__externalLookupKey__c',
      'LLC_BI__External_Period_Key__c',
      'LLC_BI__Spread_Statement_Type__c',
      'LLC_BI__Is_Template__c',
      'LLC_BI__Source__c',
      'LLC_BI__Year__c',
      'LLC_BI__Month__c',
      'LLC_BI__Is_Interim__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 5
  },

  'LLC_BI__Spread_Statement_Record_Value__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__Spread_Statement_Period__c',
      'LLC_BI__Spread_Statement_Record__c',
      'LLC_BI__Value__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 6
  },

  'LLC_BI__Spread_Statement_Period_Total__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__Spread_Statement_Period__c',
      'LLC_BI__Spread_Statement_Record_Total__c',
      'LLC_BI__Value__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 6
  },

  'LLC_BI__Spread_Statement_Record_Group__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__Spread_Statement_Record__c',
      'LLC_BI__Spread_Statement_Record_Total__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 6
  },

  'LLC_BI__Spread_Statement_Row_Mapping__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__Underwriting_Bundle__c',
      'LLC_BI__Spread_Statement_Record__c',
      'LLC_BI__Row_Mapping_Key__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 6
  },

  'LLC_BI__Period_Consolidation__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__Source_Period__c',
      'LLC_BI__Target_Period__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 6
  },

  'LLC_BI__Schedule_Entry__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__Schedule__c',
      'LLC_BI__Entry_Type__c',
      'LLC_BI__Value__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 22
  },

  'LLC_BI__Debt__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__Debt_Schedule__c',
      'LLC_BI__Internal_Debt__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 24
  },

  'LLC_BI__Spread_Projections_Template__c': {
    fields: [
      'Name',
      'LLC_BI__Description__c',
      'LLC_BI__Is_Active__c',
      'LLC_BI__lookupKey__c',
      'LLC_BI__Purpose__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 13
  },

  'LLC_BI__Projection_Bundle_Junction__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__Bundle__r.LLC_BI__lookupKey__c',
      'LLC_BI__Projection_Template__r.LLC_BI__lookupKey__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 14
  },

  'LLC_BI__Spread_Projections_Driver__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__Classification__r.LLC_BI__lookupKey__c',
      'LLC_BI__Spread_Projections_Template__r.LLC_BI__lookupKey__c',
      'LLC_BI__Spread_Statement_Record__r.LLC_BI__lookupKey__c',
      'LLC_BI__Spread_Statement_Record_value__r.LLC_BI__lookupKey__c',
      'LLC_BI__Type__c',
      'LLC_BI__Value__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 15
  },

  'LLC_BI__Schedule__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__Bundle__r.LLC_BI__lookupKey__c',
      'LLC_BI__Is_Template__c',
      'LLC_BI__Table_Format__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 20,
    excludeFields: ['LLC_BI__Source_Schedule__c']
  },

  'LLC_BI__Schedule_Section__c': {
    fields: [
      'LLC_BI__lookupKey__c',
      'LLC_BI__Formula__c',
      'LLC_BI__Order_Number__c',
      'LLC_BI__Schedule_Entry__c',
      'LLC_BI__Schedule__r.LLC_BI__lookupKey__c',
      'LLC_BI__Debt_Schedule__r.LLC_BI__lookupKey__c',
      'LLC_BI__Show_Total__c',
      'LLC_BI__Spread_Statement_Record__r.LLC_BI__lookupKey__c',
      'LLC_BI__Dropdown_Items__c',
      'LLC_BI__Hide_Schedule_Section__c',
      'LLC_BI__Is_Restricted_Dropdown__c',
      'LLC_BI__Is_Sticky__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 21,
    excludeFields: ['LLC_BI__Source_Section__c']
  },

  'LLC_BI__Debt_Schedule__c': {
    fields: [
      'Name',
      'LLC_BI__lookupKey__c',
      'LLC_BI__Bundle__r.LLC_BI__lookupKey__c',
      'LLC_BI__Debt_Filter_Syntax__c',
      'LLC_BI__Is_Template__c'
    ],
    externalIdField: 'LLC_BI__lookupKey__c',
    insertOrder: 23,
    excludeFields: ['LLC_BI__Source_Debt_Schedule__c']
  }
}

/**
 * Get the extraction fields for an object — only the base field names
 * (strips relationship traversals like __r.LLC_BI__lookupKey__c to get
 * the underlying Id field for SOQL SELECT).
 *
 * For extraction, relationship fields like LLC_BI__Bundle__r.LLC_BI__lookupKey__c
 * are queried as the raw Id field (LLC_BI__Bundle__c) since the extractor
 * captures source org Ids that get remapped during import.
 */
export function getRegistryFieldsForExtraction(objectApiName: string): string[] | null {
  const entry = FIELD_REGISTRY[objectApiName]
  if (!entry) return null

  const fields: string[] = []
  const seen = new Set<string>()

  for (const f of entry.fields) {
    let fieldName = f
    if (f.includes('__r.')) {
      fieldName = f.replace('__r.LLC_BI__lookupKey__c', '__c')
    }
    if (!seen.has(fieldName)) {
      seen.add(fieldName)
      fields.push(fieldName)
    }
  }

  if (!seen.has('Id')) {
    fields.unshift('Id')
  }

  return fields
}

/**
 * Get the relationship field map for an object from the registry.
 * Returns a map of sourceIdField → { relationship, externalIdField }.
 * Only includes fields that have __r. traversals in the registry.
 */
export function getRegistryRelationships(objectApiName: string): Map<string, { relationship: string; externalIdField: string }> {
  const entry = FIELD_REGISTRY[objectApiName]
  const map = new Map<string, { relationship: string; externalIdField: string }>()
  if (!entry) return map

  for (const f of entry.fields) {
    if (f.includes('__r.')) {
      const [relPart, extIdField] = f.split('.')
      const sourceIdField = relPart.replace('__r', '__c')
      map.set(sourceIdField, { relationship: relPart, externalIdField: extIdField })
    }
  }
  return map
}
