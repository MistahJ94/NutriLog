const config = {
  appId: 'com.jondomain.nutrilog',
  appName: 'NutriLog',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  },
  server: {
    cleartext: false
  }
}

module.exports = config
