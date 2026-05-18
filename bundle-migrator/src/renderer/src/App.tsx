import React, { useEffect, useState } from 'react'
import { Box, Button, Container, Flex, Heading, Text } from '@radix-ui/themes'
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
import PDIInsightStep from './components/PDIInsightStep'
import PDIResultsStep from './components/PDIResultsStep'
import ImportStep from './components/ImportStep'
import SummaryStep from './components/SummaryStep'
import { EMPTY_CREDS } from './components/OrgConnectStep'
import type { AppMode, OrgStatus, OrgCredentials, AllCredentials, BundleListItem, BundleExport, ImportSummary, PDIAnalysisResult, BedrockCredentials } from '../../shared/types'

function getBedrockErrorMessage(err: string): string {
  if (err.includes('BEDROCK_NOT_CONFIGURED'))
    return 'AI features need setup. Add your Bedrock inference profile ARN in the credentials screen. Request a profile at bedrock-self-service.ncino.ai'
  if (err.includes('BEDROCK_ACCESS_DENIED'))
    return 'AWS permission error. Run genailogin in your terminal to refresh your session, then try again.'
  if (err.includes('BEDROCK_TOKEN_EXPIRED'))
    return 'AWS session expired. Run genailogin in your terminal to refresh your credentials and try again.'
  if (err.includes('BEDROCK_PROFILE_NOT_FOUND'))
    return 'Inference profile not found. Verify your ARN in the credentials screen at bedrock-self-service.ncino.ai'
  if (err.includes('BEDROCK_VALIDATION_ERROR'))
    return 'Invalid Bedrock configuration. Check your inference profile ARN in the credentials screen.'
  return err
}

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
  | 'pdiInsight'
  | 'pdiResults'

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
  compareResults: 'Results',
  pdiInsight: 'Describe PDI',
  pdiResults: 'Analysis'
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
    case 'pdi-insight':
      return ['mode', 'pdiInsight', 'pdiResults']
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
  const [selectedBundles, setSelectedBundles] = useState<BundleListItem[]>([])
  const [extractedBundles, setExtractedBundles] = useState<BundleExport[]>([])
  const [bundleExport, setBundleExport] = useState<BundleExport | null>(null)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [loadedFilePath, setLoadedFilePath] = useState<string | undefined>(undefined)
  const [comparePathA, setComparePathA] = useState('')
  const [comparePathB, setComparePathB] = useState('')
  const [compareResultLabel, setCompareResultLabel] = useState('')
  const [pdiResult, setPdiResult] = useState<PDIAnalysisResult | null>(null)
  const [pdiDescription, setPdiDescription] = useState('')
  const [pdiJiraUrl, setPdiJiraUrl] = useState('')
  const [pdiAnalyzing, setPdiAnalyzing] = useState(false)
  const [pdiError, setPdiError] = useState('')
  const [bedrockCreds, setBedrockCreds] = useState<BedrockCredentials | undefined>(undefined)

  useEffect(() => {
    window.api.getCredentials().then((creds) => {
      setSourceCreds(creds.source)
      setTargetCreds(creds.target)
      setBedrockCreds(creds.bedrock)
      setCredsLoaded(true)
    })
  }, [])

  const hasAIEnabled = Boolean(bedrockCreds?.inferenceProfileArn)

  const activeSteps = stepsForMode(mode)
  const currentIndex = activeSteps.indexOf(step)

  const resetAll = (): void => {
    setMode(null)
    setSelectedBundles([])
    setExtractedBundles([])
    setBundleExport(null)
    setImportSummary(null)
    setLoadedFilePath(undefined)
    setComparePathA('')
    setComparePathB('')
    setCompareResultLabel('')
    setPdiResult(null)
    setPdiDescription('')
    setPdiJiraUrl('')
    setPdiError('')
    setStep('mode')
  }

  const handleCredsSaved = (creds: AllCredentials): void => {
    setSourceCreds(creds.source)
    setTargetCreds(creds.target)
    setBedrockCreds(creds.bedrock)
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
              hasAIEnabled={hasAIEnabled}
              onNext={(selectedMode) => {
                setMode(selectedMode)
                if (selectedMode === 'compare') {
                  setStep('compareFileSelect')
                } else if (selectedMode === 'pdi-insight') {
                  setStep('pdiInsight')
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
              onNext={(bundles) => {
                setSelectedBundles(bundles)
                setStep('extract')
              }}
              onBack={() => setStep('connect')}
            />
          )}

          {step === 'extract' && selectedBundles.length > 0 && (
            <ExtractStep
              bundles={selectedBundles}
              onNext={(exports) => {
                setExtractedBundles(exports)
                const first = exports[0] ?? null
                setBundleExport(first)
                setLoadedFilePath(first?.exportFilePath)
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
              key={bundleExport.bundleId}
              bundleExport={bundleExport}
              allExtractedBundles={extractedBundles.length > 1 ? extractedBundles : undefined}
              onSelectBundle={(selected) => {
                setBundleExport(selected)
                setLoadedFilePath(selected.exportFilePath)
              }}
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
              exportFilePath={loadedFilePath ?? bundleExport.exportFilePath}
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
              exportFilePath={loadedFilePath ?? bundleExport?.exportFilePath}
              bundleExport={bundleExport ?? undefined}
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
              onBedrockSaved={(creds) => setBedrockCreds(creds)}
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

          {step === 'pdiInsight' && (
            <PDIInsightStep
              onBedrockSaved={(creds) => setBedrockCreds(creds)}
              onAnalyze={async (bundle, description, affectedArea, errorMsg, jiraUrl) => {
                setPdiDescription(description)
                setPdiJiraUrl(jiraUrl)
                setPdiAnalyzing(true)
                setPdiError('')
                setPdiResult(null)
                setStep('pdiResults')
                try {
                  const result = await window.api.analyzePDI({
                    bundle,
                    pdiDescription: description,
                    affectedArea,
                    errorMessage: errorMsg,
                    jiraUrl: jiraUrl || undefined
                  })
                  setPdiResult(result)
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err)
                  setPdiError(getBedrockErrorMessage(msg))
                } finally {
                  setPdiAnalyzing(false)
                }
              }}
              onBack={() => setStep('mode')}
            />
          )}

          {step === 'pdiResults' && (
            pdiAnalyzing ? (
              <Flex direction="column" gap="4">
                <Heading size="5">PDI Analysis</Heading>
                <Box p="4" style={{
                  border: '1px solid var(--purple-4)',
                  borderRadius: 'var(--radius-3)',
                  background: 'var(--purple-1)'
                }}>
                  <Text size="2" color="purple">Analyzing template against PDI description...</Text>
                </Box>
              </Flex>
            ) : pdiError ? (
              <Flex direction="column" gap="4">
                <Heading size="5">PDI Analysis</Heading>
                <Box p="3" style={{
                  border: '1px solid var(--red-6)',
                  borderRadius: 'var(--radius-2)',
                  background: 'var(--red-2)'
                }}>
                  <Text size="2" color="red">Analysis failed: {pdiError}</Text>
                </Box>
                <Flex gap="3">
                  <Button variant="soft" onClick={() => setStep('pdiInsight')}>&larr; Back</Button>
                  <Button onClick={resetAll}>Start Over</Button>
                </Flex>
              </Flex>
            ) : pdiResult ? (
              <PDIResultsStep
                result={pdiResult}
                pdiDescription={pdiDescription}
                jiraUrl={pdiJiraUrl}
                onAnalyzeAnother={() => {
                  setPdiResult(null)
                  setPdiJiraUrl('')
                  setPdiError('')
                  setStep('pdiInsight')
                }}
                onStartOver={resetAll}
              />
            ) : null
          )}
        </ErrorBoundary>
      </Flex>
    </Container>
  )
}
