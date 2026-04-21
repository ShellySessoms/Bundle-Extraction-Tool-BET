import { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.bundlemigrator.app',
  productName: 'Bundle Migrator',
  directories: {
    buildResources: 'resources',
    output: 'dist'
  },
  files: [
    'out/**/*',
    '!node_modules/**/*',
    '.env'
  ],
  extraResources: [
    { from: '.env', to: '.', filter: ['*.env'] }
  ],
  mac: {
    target: ['dmg', 'zip'],
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false
  },
  win: {
    target: ['nsis'],
    artifactName: '${productName}-Setup-${version}.${ext}'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  }
}

export default config
