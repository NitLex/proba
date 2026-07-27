module.exports = {
  apps: [
    {
      name: 'orkestr',
      cwd: './server',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '700M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        APP_MODE: 'orchestrator',
      },
    },
  ],
};
