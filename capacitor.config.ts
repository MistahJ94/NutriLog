import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.jondomain.nutrilog',
  appName: 'NutriLog',
  webDir: 'dist',
  server: {
    url: 'https://nutrilog.jondomain.com',
    cleartext: false
  }
}

export default config
