const config = {
  appId: 'com.nutrilog.app',
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
