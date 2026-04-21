# Bundle Migrator

Electron desktop app for migrating Salesforce LLC_BI underwriting bundles between orgs.

## Prerequisites

- Node.js 20+
- npm 10+
- Salesforce credentials for both source and target orgs

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` with your Salesforce credentials:

```
SOURCE_SF_USERNAME=user@source.org
SOURCE_SF_PASSWORD=password
SOURCE_SF_TOKEN=securityToken
SOURCE_SF_LOGIN_URL=https://login.salesforce.com

TARGET_SF_USERNAME=user@target.org
TARGET_SF_PASSWORD=password
TARGET_SF_TOKEN=securityToken
TARGET_SF_LOGIN_URL=https://login.salesforce.com
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Package

```bash
npm run package:mac
npm run package:win
```

## What gets migrated

The tool extracts and imports the full underwriting bundle hierarchy:

1. **LLC_BI__Underwriting_Bundle__c** - The root bundle record
2. **LLC_BI__Spread_Statement_Type__c** - Statement types within the bundle
3. **LLC_BI__Spread_Statement_Record_Total__c** - Record total groups (inserted before records)
4. **LLC_BI__Spread_Statement_Period__c** - Statement periods
5. **LLC_BI__Spread_Statement_Record__c** - Individual statement records
6. **LLC_BI__Spread_Statement_Record_Value__c** - Cell values for each record/period intersection
7. **LLC_BI__Spread_Statement_Period_Total__c** - Period totals
8. **LLC_BI__Spread_Statement_Record_Group__c** - Record groupings
9. **LLC_BI__Spread_Record_Classification__c** - Record classification junctions
10. **LLC_BI__Spread_Record_Total_Classification__c** - Record total classification junctions
11. **LLC_BI__Spread_Statement_Row_Mapping__c** - Row mapping configuration
12. **LLC_BI__Projection_Bundle_Junction__c** - Projections template junctions
13. **LLC_BI__Period_Consolidation__c** - Period consolidation mappings
14. **LLC_BI__Spread_Projections_Driver__c** - Projections drivers

Reference data resolved by name/key in the target org:
- **LLC_BI__Financial_Consolidation__c** (matched by Name)
- **LLC_BI__Classification__c** (matched by Name)
- **LLC_BI__Spread_Projections_Template__c** (matched by LLC_BI__lookupKey__c)

Circular references (self-referencing fields) are handled via a two-pass approach: records are inserted with null references first, then backfilled with resolved target IDs.

## Known limitations

- **Financial Consolidation** is matched by Name in the target org. If not found, a new record is created automatically.
- **Classifications** are matched by Name and must already exist in the target org. Missing classifications will be logged as warnings.
- **LLC_BI__lookupKey__c** must be unique per object in the target org. The upsert operation will update existing records if a matching key is found.
- **Source template lineage fields** (LLC_BI__Source_Template__c, LLC_BI__Source_Statement__c, LLC_BI__Source_Group__c, LLC_BI__Source_Row__c) are intentionally excluded from migration as they reference the source org's record hierarchy.
- **Unsigned builds** will trigger Gatekeeper on macOS 15+. Right-click the app and select "Open" to bypass the warning.
