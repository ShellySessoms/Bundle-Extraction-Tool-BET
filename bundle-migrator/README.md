# Bundle Extraction Tool (BET)

Electron desktop application for extracting, comparing, and migrating Salesforce LLC_BI underwriting bundles between orgs.

## Modes of Operation

| Mode | Description |
|------|-------------|
| **Extract Only** | Extract a bundle from a source org and save it as a JSON file |
| **Extract & Upsert** | Extract a bundle from a source org and immediately upsert it into a target org |
| **Upsert Only** | Load a previously exported JSON file and upsert it into a target org |
| **Compare Bundles** | Load two bundle JSON files and view a plain-English diff of configuration differences |

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- npm 10+
- Salesforce credentials (username, password, and security token) for each org you plan to connect to

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/ShellySessoms/Bundle-Extraction-Tool-BET.git
cd Bundle-Extraction-Tool-BET/bundle-migrator
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the `bundle-migrator/` directory:

```bash
cp .env.example .env
```

Then edit `.env` with your Salesforce credentials:

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

> **Note:** All environment variables are optional. You can leave them blank and enter your Salesforce credentials directly through the app UI at runtime. If you only need to extract or compare bundles, the `TARGET_` variables are not needed. For sandbox orgs, use `https://test.salesforce.com` as the login URL.

### 4. Run the app in development mode

```bash
npm run dev
```

This starts the Electron app with hot-reload enabled via electron-vite.

## Running Tests

The project uses [Playwright](https://playwright.dev/) for end-to-end testing.

```bash
# Build and run all E2E tests (headless)
npm run test:e2e

# Build and run E2E tests with the browser visible
npm run test:e2e:headed
```

Test files are located in `tests/e2e/`. Fixture data used by tests is in `tests/fixtures/`.

## Building and Packaging

### Build the app (no installer)

```bash
npm run build
```

Compiled output goes to the `out/` directory.

### Package a distributable installer

```bash
# macOS (.dmg and .zip)
npm run package:mac

# Windows (.exe via NSIS)
npm run package:win
```

Packaged installers are written to the `dist/` directory.

> **macOS note:** Unsigned builds will trigger Gatekeeper on macOS 15+. Right-click the app and select "Open" to bypass the warning.

## Project Structure

```
bundle-migrator/
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.ts           # App entry point and IPC handlers
│   │   ├── sfConnection.ts    # Salesforce authentication via jsforce
│   │   ├── extractor.ts       # Bundle extraction logic
│   │   ├── importer.ts        # Bundle upsert/import logic
│   │   ├── referenceResolver.ts  # Resolves cross-org reference data
│   │   └── bundleComparator.ts   # Bundle diff/comparison engine
│   ├── preload/               # Electron preload scripts (context bridge)
│   ├── renderer/              # React UI (Radix Themes)
│   │   └── src/components/    # Step-by-step wizard components
│   └── shared/                # Shared TypeScript types
├── tests/
│   ├── e2e/                   # Playwright E2E test specs
│   └── fixtures/              # Sample bundle JSON files for testing
├── resources/                 # Electron-builder resources (icons, etc.)
├── electron.vite.config.ts    # Vite config for main/preload/renderer
├── electron-builder.config.ts # Packaging config for Mac/Windows
├── playwright.config.ts       # Playwright test configuration
└── package.json
```

## What Gets Migrated

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

### Reference data resolved by name/key in the target org

- **LLC_BI__Financial_Consolidation__c** (matched by Name)
- **LLC_BI__Classification__c** (matched by Name)
- **LLC_BI__Spread_Projections_Template__c** (matched by LLC_BI__lookupKey__c)

Circular references (self-referencing fields) are handled via a two-pass approach: records are inserted with null references first, then backfilled with resolved target IDs.

## Known Limitations

- **Financial Consolidation** is matched by Name in the target org. If not found, a new record is created automatically.
- **Classifications** are matched by Name and must already exist in the target org. Missing classifications will be logged as warnings.
- **LLC_BI__lookupKey__c** must be unique per object in the target org. The upsert operation will update existing records if a matching key is found.
- **Source template lineage fields** (LLC_BI__Source_Template__c, LLC_BI__Source_Statement__c, LLC_BI__Source_Group__c, LLC_BI__Source_Row__c) are intentionally excluded from migration as they reference the source org's record hierarchy.
