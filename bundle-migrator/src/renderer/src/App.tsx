import React, { useEffect, useState } from 'react'
import { Container, Flex, Heading, Text } from '@radix-ui/themes'
import ErrorBoundary from './components/ErrorBoundary'
import OrgConnectStep from './components/OrgConnectStep'
import ModeStep from './components/ModeStep'
import BundleSearchStep from './components/BundleSearchStep'
import ExtractStep from './components/ExtractStep'
import ReviewStep from './components/ReviewStep'
import FileSelectStep from './components/FileSelectStep'
import TargetConnectStep from './components/TargetConnectStep'
import CompareFileSelectStep from './components/CompareFileSelectStep'
import CompareResultsStep from './components/CompareResultsStep'
import ImportStep from './components/ImportStep'
import SummaryStep from './components/SummaryStep'
import { EMPTY_CREDS } from './components/OrgConnectStep'
import type { AppMode, OrgStatus, OrgCredentials, AllCredentials, BundleListItem, BundleExport, ImportSummary } from '../../shared/types'

type Step =
  | 'connect'
  | 'mode'
  | 'search'
  | 'extract'
  | 'review'
  | 'fileSelect'
  | 'targetConnect'
  | 'import'
  | 'summary'
  | 'compareFileSelect'
  | 'compareResults'

const STEP_LABELS: Record<Step, string> = {
  connect: 'Connect',
  mode: 'Mode',
  search: 'Select Bundle',
  extract: 'Extract',
  review: 'Review',
  fileSelect: 'Select File',
  targetConnect: 'Target Org',
  import: 'Upsert',
  summary: 'Summary',
  compareFileSelect: 'Select Files',
  compareResults: 'Results'
}

function stepsForMode(mode: AppMode | null): Step[] {
  switch (mode) {
    case 'extract-only':
      return ['mode', 'connect', 'search', 'extract', 'review']
    case 'extract-upsert':
      return ['mode', 'connect', 'search', 'extract', 'review', 'targetConnect', 'import', 'summary']
    case 'upsert-only':
      return ['mode', 'connect', 'fileSelect', 'review', 'import', 'summary']
    case 'compare':
      return ['mode', 'compareFileSelect', 'compareResults']
    default:
      return ['mode']
  }
}

export default function App(): React.ReactElement {
  const [step, setStep] = useState<Step>('mode')
  const [mode, setMode] = useState<AppMode | null>(null)
  const [sourceOrg, setSourceOrg] = useState<OrgStatus | null>(null)
  const [targetOrg, setTargetOrg] = useState<OrgStatus | null>(null)
  const [sourceCreds, setSourceCreds] = useState<OrgCredentials>({ ...EMPTY_CREDS })
  const [targetCreds, setTargetCreds] = useState<OrgCredentials>({ ...EMPTY_CREDS })
  const [credsLoaded, setCredsLoaded] = useState(false)
  const [selectedBundle, setSelectedBundle] = useState<BundleListItem | null>(null)
  const [bundleExport, setBundleExport] = useState<BundleExport | null>(null)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [loadedFilePath, setLoadedFilePath] = useState<string | undefined>(undefined)
  const [comparePathA, setComparePathA] = useState('')
  const [comparePathB, setComparePathB] = useState('')
  const [compareResultLabel, setCompareResultLabel] = useState('')

  useEffect(() => {
    window.api.getCredentials().then((creds) => {
      setSourceCreds(creds.source)
      setTargetCreds(creds.target)
      setCredsLoaded(true)
    })
  }, [])

  const activeSteps = stepsForMode(mode)
  const currentIndex = activeSteps.indexOf(step)

  const resetAll = (): void => {
    setMode(null)
    setSelectedBundle(null)
    setBundleExport(null)
    setImportSummary(null)
    setLoadedFilePath(undefined)
    setComparePathA('')
    setComparePathB('')
    setCompareResultLabel('')
    setStep('mode')
  }

  const handleCredsSaved = (creds: AllCredentials): void => {
    setSourceCreds(creds.source)
    setTargetCreds(creds.target)
  }

  const switchToUpsertOnly = (filePath: string): void => {
    setMode('upsert-only')
    setLoadedFilePath(filePath)
    setImportSummary(null)
    setStep('connect')
  }

  return (
    <Container size="3" p="6">
      <Flex direction="column" gap="6">
        {step !== 'mode' && (
          <Flex direction="column" gap="1">
            <Heading size="7">Bundle Migrator</Heading>
            <Text size="2" color="gray">
              Migrate Salesforce LLC_BI underwriting bundles between orgs
            </Text>
          </Flex>
        )}

        {/* Step indicator — hide on landing page */}
        {step !== 'mode' && (
          <Flex gap="2" align="center">
            {activeSteps.map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 && (
                  <Text size="1" color="gray" style={{ margin: '0 2px' }}>
                    &rsaquo;
                  </Text>
                )}
                <Text
                  size="2"
                  weight={s === step ? 'bold' : 'regular'}
                  color={i <= currentIndex ? undefined : 'gray'}
                  style={{ opacity: i <= currentIndex ? 1 : 0.5 }}
                >
                  {s === 'compareResults' && compareResultLabel ? compareResultLabel : STEP_LABELS[s]}
                </Text>
              </React.Fragment>
            ))}
          </Flex>
        )}

        <ErrorBoundary>
          {step === 'mode' && (
            <ModeStep
              onNext={(selectedMode) => {
                setMode(selectedMode)
                if (selectedMode === 'compare') {
                  setStep('compareFileSelect')
                } else {
                  setStep('connect')
                }
              }}
            />
          )}

          {step === 'connect' && credsLoaded && mode && (
            <OrgConnectStep
              mode={mode}
              sourceOrg={sourceOrg}
              targetOrg={targetOrg}
              initialSourceCreds={sourceCreds}
              initialTargetCreds={targetCreds}
              onSourceConnected={setSourceOrg}
              onTargetConnected={setTargetOrg}
              onCredsSaved={handleCredsSaved}
              onNext={() => {
                if (mode === 'upsert-only') {
                  setStep('fileSelect')
                } else {
                  setStep('search')
                }
              }}
              onBack={() => setStep('mode')}
            />
          )}

          {step === 'search' && (
            <BundleSearchStep
              onNext={(bundle) => {
                setSelectedBundle(bundle)
                setStep('extract')
              }}
              onBack={() => setStep('connect')}
            />
          )}

          {step === 'extract' && selectedBundle && (
            <ExtractStep
              bundleId={selectedBundle.id}
              existingExport={bundleExport}
              onNext={(result) => {
                setBundleExport(result)
                setStep('review')
              }}
              onBack={() => setStep('search')}
            />
          )}

          {step === 'fileSelect' && (
            <FileSelectStep
              preloadedPath={loadedFilePath}
              onNext={(data, filePath) => {
                setBundleExport(data)
                setLoadedFilePath(filePath)
                setStep('review')
              }}
              onBack={() => setStep('connect')}
            />
          )}

          {step === 'targetConnect' && (
            <TargetConnectStep
              targetOrg={targetOrg}
              initialCreds={targetCreds}
              onTargetConnected={setTargetOrg}
              onNext={() => setStep('import')}
              onBack={() => setStep('review')}
            />
          )}

          {step === 'review' && bundleExport && mode && (
            <ReviewStep
              bundleExport={bundleExport}
              mode={mode}
              onNext={() => {
                if (mode === 'extract-upsert') {
                  setStep('targetConnect')
                } else if (mode === 'upsert-only') {
                  setStep('import')
                }
              }}
              onBack={() => {
                if (mode === 'extract-only' || mode === 'extract-upsert') {
                  setStep('extract')
                } else {
                  setStep('fileSelect')
                }
              }}
              onStartOver={resetAll}
              onFileRenamed={(newPath) => {
                setBundleExport((prev) => prev ? { ...prev, exportFilePath: newPath } : prev)
                setLoadedFilePath(newPath)
              }}
            />
          )}

          {step === 'import' && bundleExport && (
            <ImportStep
              exportFilePath={bundleExport.exportFilePath}
              onNext={(summary) => {
                setImportSummary(summary)
                setStep('summary')
              }}
              onBack={() => setStep('review')}
            />
          )}

          {step === 'summary' && importSummary && mode && (
            <SummaryStep
              summary={importSummary}
              mode={mode}
              exportFilePath={bundleExport?.exportFilePath}
              hasProvisioningData={!!bundleExport?.provisioningData}
              onStartOver={resetAll}
              onUpsertFile={switchToUpsertOnly}
            />
          )}

          {step === 'compareFileSelect' && (
            <CompareFileSelectStep
              onNext={(pathA, pathB) => {
                setComparePathA(pathA)
                setComparePathB(pathB)
                setStep('compareResults')
              }}
              onBack={() => setStep('mode')}
            />
          )}

          {step === 'compareResults' && comparePathA && comparePathB && (
            <CompareResultsStep
              filePathA={comparePathA}
              filePathB={comparePathB}
              onBack={() => setStep('compareFileSelect')}
              onStartOver={resetAll}
              onCompared={(diffCount, identical) => {
                setCompareResultLabel(identical ? 'Results (Identical)' : `Results (${diffCount} diff${diffCount !== 1 ? 's' : ''})`)
              }}
            />
          )}
        </ErrorBoundary>
      </Flex>
    </Container>
  )
}
