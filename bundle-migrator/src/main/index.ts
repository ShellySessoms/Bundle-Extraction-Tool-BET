import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import { join, dirname, basename, extname } from 'path'
import { homedir } from 'os'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import log from 'electron-log/main'
import { mkdirSync } from 'fs'
import type { Connection } from '@jsforce/jsforce-node'
import { connectSource, connectTarget, updateSourceCredentials, updateTargetCredentials, getAllCredentials, credentialsFilePath, resolveIdentity } from './sfConnection'
import { extractBundle } from './extractor'
import { importBundle } from './importer'
import { compareBundles, comparisonToMarkdown, comparisonToCsv } from './bundleComparator'
import type { OrgStatus, OrgCredentials, BundleListItem, BundleExport, BundleComparison, ImportSummary, ProgressEvent, AllCredentials, ExtractionOptions } from '../shared/types'

log.initialize()

const logFilePath = log.transports.file.getFile().path

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  // CSP via webRequest — relaxed in dev to allow Vite's HMR scripts
  const isDev = !!process.env.ELECTRON_RENDERER_URL
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'"
          ]
        }
      })
    })
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function saveCredentialsFile(): void {
  try {
    const all = getAllCredentials()
    writeFileSync(credentialsFilePath, JSON.stringify(all, null, 2), 'utf-8')
    log.info(`Credentials saved to ${credentialsFilePath}`)
  } catch (err) {
    log.error('Failed to write credentials.json', err)
  }
}

ipcMain.handle(
  'sf:connectSource',
  async (_event, creds?: OrgCredentials): Promise<OrgStatus> => {
    try {
      if (creds) updateSourceCredentials(creds)
      const conn = await connectSource()
      const identity = await resolveIdentity(conn)
      saveCredentialsFile()
      return { connected: true, orgId: identity.organization_id, username: identity.username }
    } catch (err) {
      log.error('sf:connectSource failed', err)
      return { connected: false, orgId: '', username: '', error: err instanceof Error ? err.message : String(err) }
    }
  }
)

ipcMain.handle(
  'sf:connectTarget',
  async (_event, creds?: OrgCredentials): Promise<OrgStatus> => {
    try {
      if (creds) updateTargetCredentials(creds)
      const conn = await connectTarget()
      if (!conn) {
        return { connected: false, orgId: '', username: 'Not configured' }
      }
      const identity = await resolveIdentity(conn)
      saveCredentialsFile()
      return { connected: true, orgId: identity.organization_id, username: identity.username }
    } catch (err) {
      log.error('sf:connectTarget failed', err)
      return { connected: false, orgId: '', username: '', error: err instanceof Error ? err.message : String(err) }
    }
  }
)

let cachedAccountField: string | null = null
let cachedCollateralField: string | null = null
let cachedFinConField: string | null = null

async function discoverBundleRelationshipFields(conn: Connection): Promise<void> {
  if (cachedAccountField !== null) return
  const desc = await conn.describe('LLC_BI__Underwriting_Bundle__c')
  for (const f of desc.fields) {
    if (f.type === 'reference' && Array.isArray(f.referenceTo)) {
      if (f.referenceTo.includes('Account') && !cachedAccountField) {
        cachedAccountField = f.relationshipName ?? ''
        log.info(`Bundle Account field: ${f.name} (relationship: ${cachedAccountField})`)
      }
      if (f.referenceTo.includes('LLC_BI__Collateral__c') && !cachedCollateralField) {
        cachedCollateralField = f.relationshipName ?? ''
        log.info(`Bundle Collateral field: ${f.name} (relationship: ${cachedCollateralField})`)
      }
      if (f.referenceTo.includes('LLC_BI__Financial_Consolidation__c') && !cachedFinConField) {
        cachedFinConField = f.relationshipName ?? ''
        log.info(`Bundle FinCon field: ${f.name} (relationship: ${cachedFinConField})`)
      }
    }
  }
  if (!cachedAccountField) cachedAccountField = ''
  if (!cachedCollateralField) cachedCollateralField = ''
  if (!cachedFinConField) cachedFinConField = ''
}

ipcMain.handle(
  'sf:searchBundles',
  async (_event, search: string, bundleType: string = 'template'): Promise<BundleListItem[]> => {
    try {
      const conn = await connectSource()
      const escapedSearch = search.replace(/'/g, "\\'")

      const useRelationships = bundleType === 'bundle' || bundleType === 'all'

      let relationshipFields = ''
      if (useRelationships) {
        await discoverBundleRelationshipFields(conn)
        const parts: string[] = []
        if (cachedAccountField) {
          parts.push(`${cachedAccountField}.Name`)
        }
        if (cachedCollateralField) {
          parts.push(`${cachedCollateralField}.Name`)
        }
        if (cachedFinConField) {
          parts.push(`${cachedFinConField}.Name`)
        }
        if (parts.length > 0) {
          relationshipFields = ', ' + parts.join(', ')
        }
      }

      const fields = `Id, Name, LLC_BI__lookupKey__c, LLC_BI__Is_Consolidation__c,
         LLC_BI__Version__c, LLC_BI__Description__c, LLC_BI__Is_Template__c${relationshipFields}`

      let whereClause: string
      if (bundleType === 'template') {
        whereClause = `LLC_BI__Is_Template__c = true AND Name LIKE '%${escapedSearch}%'`
      } else if (bundleType === 'bundle') {
        whereClause = `LLC_BI__Is_Template__c = false AND Name LIKE '%${escapedSearch}%'`
      } else {
        whereClause = `Name LIKE '%${escapedSearch}%'`
      }

      const soql = `SELECT ${fields} FROM LLC_BI__Underwriting_Bundle__c WHERE ${whereClause} ORDER BY Name ASC LIMIT 200`
      log.info('sf:searchBundles SOQL', soql.substring(0, 200))
      const result = await conn.query(soql)

      const acctRel = cachedAccountField ?? ''
      const colRel = cachedCollateralField ?? ''
      const finRel = cachedFinConField ?? ''

      return (result.records as Record<string, unknown>[]).map((r) => {
        const acct = acctRel ? r[acctRel] as Record<string, unknown> | null : null
        const col = colRel ? r[colRel] as Record<string, unknown> | null : null
        const fin = finRel ? r[finRel] as Record<string, unknown> | null : null
        return {
          id: r.Id as string,
          name: r.Name as string,
          lookupKey: (r.LLC_BI__lookupKey__c as string) ?? '',
          isConsolidation: (r.LLC_BI__Is_Consolidation__c as boolean) ?? false,
          isTemplate: (r.LLC_BI__Is_Template__c as boolean) ?? false,
          version: (r.LLC_BI__Version__c as string) ?? '',
          description: (r.LLC_BI__Description__c as string) ?? '',
          relationshipName: (acct?.Name as string) ?? '',
          relationshipLookupKey: '',
          collateralName: (col?.Name as string) ?? '',
          financialConsolidationName: (fin?.Name as string) ?? ''
        }
      })
    } catch (err) {
      log.error('sf:searchBundles failed', err)
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  }
)

ipcMain.handle(
  'sf:extractBundle',
  async (_event, options: ExtractionOptions): Promise<BundleExport> => {
    try {
      log.info('sf:extractBundle received', { bundleId: options.bundleId, outputDirectory: options.outputDirectory, includeProvisioningData: options.includeProvisioningData })
      const conn = await connectSource()
      const emitProgress = (e: ProgressEvent): void => {
        if (!mainWindow) {
          log.warn('mainWindow is null, cannot send progress')
          return
        }
        mainWindow.webContents.send('progress', e)
      }
      return await extractBundle(conn, options, emitProgress)
    } catch (err) {
      log.error('sf:extractBundle failed', err)
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  }
)

let importInProgress = false

ipcMain.handle(
  'sf:importBundle',
  async (_event, exportFilePath: string): Promise<ImportSummary> => {
    if (importInProgress) {
      log.warn('Import already in progress — ignoring duplicate call')
      throw new Error('Import already in progress')
    }
    importInProgress = true
    try {
      const conn = await connectTarget()
      if (!conn) {
        throw new Error('Target org is not configured. Set TARGET_SF_USERNAME in .env to import.')
      }
      const emitProgress = (e: ProgressEvent): void => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          log.warn('Cannot send progress event — mainWindow unavailable')
          return
        }
        mainWindow.webContents.send('progress', e)
      }
      return await importBundle(conn, exportFilePath, emitProgress)
    } catch (err) {
      log.error('sf:importBundle failed', err)
      throw new Error(err instanceof Error ? err.message : String(err))
    } finally {
      importInProgress = false
    }
  }
)

ipcMain.handle('app:openLogFile', async () => {
  try {
    await shell.openPath(logFilePath)
  } catch (err) {
    log.error('app:openLogFile failed', err)
  }
})

ipcMain.handle('app:openFile', async (_event, filePath: string) => {
  try {
    await shell.showItemInFolder(filePath)
  } catch (err) {
    log.error('app:openFile failed', err)
  }
})

ipcMain.handle('app:openInFinder', async (_event, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle(
  'app:renameExportFile',
  async (_event, currentPath: string, newFileName: string): Promise<string> => {
    try {
      const dir = dirname(currentPath)
      const ext = extname(currentPath)
      const sanitized = newFileName.replace(/[^a-zA-Z0-9_\-. ]/g, '_')
      const newName = sanitized.endsWith(ext) ? sanitized : `${sanitized}${ext}`
      const newPath = join(dir, newName)
      if (newPath === currentPath) return currentPath
      if (existsSync(newPath)) {
        throw new Error(`A file named "${basename(newPath)}" already exists in this directory.`)
      }
      renameSync(currentPath, newPath)
      log.info(`Renamed export file: ${basename(currentPath)} → ${newName}`)
      return newPath
    } catch (err) {
      log.error('app:renameExportFile failed', err)
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  }
)

let lastBundleDir = join(homedir(), 'Documents', 'bundle-migrator')

ipcMain.handle('app:selectBundleFile', async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'Bundle Export', extensions: ['json'] }],
    defaultPath: lastBundleDir,
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const selected = result.filePaths[0]
  lastBundleDir = dirname(selected)
  return selected
})

ipcMain.handle('app:selectDirectory', async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('app:getCredentials', async (): Promise<AllCredentials> => {
  try {
    return getAllCredentials()
  } catch (err) {
    log.error('app:getCredentials failed', err)
    return {
      source: { username: '', password: '', token: '', loginUrl: 'https://login.salesforce.com' },
      target: { username: '', password: '', token: '', loginUrl: 'https://login.salesforce.com' }
    }
  }
})

ipcMain.handle(
  'app:readBundleFile',
  async (_event, filePath: string): Promise<BundleExport> => {
    try {
      const contents = readFileSync(filePath, 'utf-8')
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(contents)
      } catch {
        throw new Error('This file is not valid JSON. Please select a bundle export .json file.')
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('This file is not a bundle export. Expected a JSON object with bundleName, bundleId, and records.')
      }
      const missing: string[] = []
      if (!parsed.bundleId) missing.push('bundleId')
      if (!parsed.bundleName) missing.push('bundleName')
      if (!parsed.records || typeof parsed.records !== 'object') missing.push('records')
      if (missing.length > 0) {
        throw new Error(`This file is not a bundle export. Missing required fields: ${missing.join(', ')}`)
      }
      return parsed as unknown as BundleExport
    } catch (err) {
      log.error('app:readBundleFile failed', err)
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  }
)

ipcMain.handle(
  'app:compareBundles',
  async (_event, filePathA: string, filePathB: string): Promise<BundleComparison> => {
    try {
      const dataA: BundleExport = JSON.parse(readFileSync(filePathA, 'utf-8'))
      const dataB: BundleExport = JSON.parse(readFileSync(filePathB, 'utf-8'))
      return compareBundles(dataA, dataB)
    } catch (err) {
      log.error('app:compareBundles failed', err)
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  }
)

ipcMain.handle(
  'app:exportCompareReport',
  async (_event, comparison: BundleComparison): Promise<string> => {
    try {
      const md = comparisonToMarkdown(comparison)
      const outDir = join(homedir(), 'Documents', 'bundle-migrator')
      mkdirSync(outDir, { recursive: true })
      const safeA = comparison.bundleAName.replace(/[^a-zA-Z0-9_-]/g, '_')
      const safeB = comparison.bundleBName.replace(/[^a-zA-Z0-9_-]/g, '_')
      const outPath = join(outDir, `compare_${safeA}_vs_${safeB}_${Date.now()}.md`)
      writeFileSync(outPath, md, 'utf-8')
      log.info(`Compare report written to ${outPath}`)
      return outPath
    } catch (err) {
      log.error('app:exportCompareReport failed', err)
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  }
)

ipcMain.handle(
  'app:exportCompareCsv',
  async (_event, comparison: BundleComparison): Promise<string> => {
    try {
      const csv = comparisonToCsv(comparison)
      const outDir = join(homedir(), 'Documents', 'bundle-migrator')
      mkdirSync(outDir, { recursive: true })
      const safeA = comparison.bundleAName.replace(/[^a-zA-Z0-9_-]/g, '_')
      const safeB = comparison.bundleBName.replace(/[^a-zA-Z0-9_-]/g, '_')
      const outPath = join(outDir, `compare_${safeA}_vs_${safeB}_${Date.now()}.csv`)
      writeFileSync(outPath, csv, 'utf-8')
      log.info(`Compare CSV written to ${outPath}`)
      return outPath
    } catch (err) {
      log.error('app:exportCompareCsv failed', err)
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  }
)

ipcMain.handle('app:saveCredentials', async (_event, creds: AllCredentials): Promise<void> => {
  updateSourceCredentials(creds.source)
  updateTargetCredentials(creds.target)
  saveCredentialsFile()
})

// ─── Lifecycle ───────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ─── Uncaught exception handler ──────────────────────────────────────────────

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error)
  dialog.showErrorBox(
    'Unexpected Error',
    `${error.message}\n\nCheck the log file for details:\n${logFilePath}`
  )
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason)
})
