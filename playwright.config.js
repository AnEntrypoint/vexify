const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  use: {
    // Global launch options for all browsers
    launchOptions: {
      args: [
        '--enable-gpu-rasterization',
        '--enable-zero-copy',
        '--use-gl=desktop',
        '--ignore-gpu-blocklist',
        '--enable-accelerated-video-decode',
        '--enable-accelerated-2d-canvas',
        '--enable-hardware-overlays',
        '--disable-software-rasterizer',
        '--force-gpu-rasterization'
      ]
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--enable-gpu-rasterization',
            '--enable-zero-copy',
            '--use-gl=desktop',
            '--ignore-gpu-blocklist',
            '--enable-accelerated-video-decode',
            '--enable-accelerated-2d-canvas',
            '--enable-hardware-overlays',
            '--disable-software-rasterizer',
            '--force-gpu-rasterization'
          ]
        }
      }
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        launchOptions: {
          args: [
            '--enable-gpu-rasterization',
            '--enable-accelerated-video-decode',
            '--enable-accelerated-2d-canvas'
          ]
        }
      }
    },
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        launchOptions: {
          args: [
            '--enable-gpu-rasterization',
            '--enable-accelerated-video-decode'
          ]
        }
      }
    }
  ]
});