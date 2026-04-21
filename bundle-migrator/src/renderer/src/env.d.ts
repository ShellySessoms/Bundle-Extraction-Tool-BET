/// <reference types="vite/client" />

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
} from '../../shared/types'

interface ElectronAPI {
  connectSource: (creds?: OrgCredentials) => Promise<OrgStatus>
  connectTarget: (creds?: OrgCredentials) => Promise<OrgStatus>
  searchBundles: (search: string, bundleType?: BundleSearchType) => Promise<BundleListItem[]>
  extractBundle: (bundleId: string, outputDirectory?: string) => Promise<BundleExport>
  importBundle: (exportFilePath: string) => Promise<ImportSummary>
  openLogFile: () => Promise<void>
  openFile: (filePath: string) => Promise<void>
  selectDirectory: () => Promise<string | null>
  selectBundleFile: () => Promise<string | null>
  readBundleFile: (filePath: string) => Promise<BundleExport>
  compareBundles: (filePathA: string, filePathB: string) => Promise<BundleComparison>
  exportCompareReport: (comparison: BundleComparison) => Promise<string>
  exportCompareCsv: (comparison: BundleComparison) => Promise<string>
  getCredentials: () => Promise<AllCredentials>
  saveCredentials: (creds: AllCredentials) => Promise<void>
  onProgress: (callback: (event: ProgressEvent) => void) => void
  onLog: (callback: (message: string) => void) => void
  removeAllListeners: (channel: 'progress' | 'log') => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
