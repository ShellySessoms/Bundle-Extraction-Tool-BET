import { contextBridge, ipcRenderer } from 'electron'
import type {
  OrgStatus,
  OrgCredentials,
  BundleListItem,
  BundleSearchType,
  BundleExport,
  BundleComparison,
  ImportSummary,
  ProgressEvent,
  AllCredentials
} from '../shared/types'

const api = {
  connectSource: (creds?: OrgCredentials): Promise<OrgStatus> =>
    ipcRenderer.invoke('sf:connectSource', creds),

  connectTarget: (creds?: OrgCredentials): Promise<OrgStatus> =>
    ipcRenderer.invoke('sf:connectTarget', creds),

  searchBundles: (search: string, bundleType?: BundleSearchType): Promise<BundleListItem[]> =>
    ipcRenderer.invoke('sf:searchBundles', search, bundleType ?? 'template'),

  extractBundle: (bundleId: string, outputDirectory?: string): Promise<BundleExport> =>
    ipcRenderer.invoke('sf:extractBundle', bundleId, outputDirectory),

  importBundle: (exportFilePath: string): Promise<ImportSummary> =>
    ipcRenderer.invoke('sf:importBundle', exportFilePath),

  openLogFile: (): Promise<void> => ipcRenderer.invoke('app:openLogFile'),

  openFile: (filePath: string): Promise<void> => ipcRenderer.invoke('app:openFile', filePath),

  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('app:selectDirectory'),

  selectBundleFile: (): Promise<string | null> => ipcRenderer.invoke('app:selectBundleFile'),

  readBundleFile: (filePath: string): Promise<BundleExport> =>
    ipcRenderer.invoke('app:readBundleFile', filePath),

  compareBundles: (filePathA: string, filePathB: string): Promise<BundleComparison> =>
    ipcRenderer.invoke('app:compareBundles', filePathA, filePathB),

  exportCompareReport: (comparison: BundleComparison): Promise<string> =>
    ipcRenderer.invoke('app:exportCompareReport', comparison),

  exportCompareCsv: (comparison: BundleComparison): Promise<string> =>
    ipcRenderer.invoke('app:exportCompareCsv', comparison),

  getCredentials: (): Promise<AllCredentials> => ipcRenderer.invoke('app:getCredentials'),

  saveCredentials: (creds: AllCredentials): Promise<void> =>
    ipcRenderer.invoke('app:saveCredentials', creds),

  onProgress: (callback: (event: ProgressEvent) => void): void => {
    ipcRenderer.on('progress', (_event, data: ProgressEvent) => callback(data))
  },

  onLog: (callback: (message: string) => void): void => {
    ipcRenderer.on('log', (_event, message: string) => callback(message))
  },

  removeAllListeners: (channel: 'progress' | 'log'): void => {
    ipcRenderer.removeAllListeners(channel)
  }
} as const

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
