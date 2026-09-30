// PM2 ecosystem config for gRouter Copilot server (port 4600).
// Independent from gRouter (port 20128) — do not touch that process.

module.exports = {
  apps: [
    {
      name: 'copilot-server',
      cwd: __dirname,
      script: 'src/index.js',
      interpreter: 'node',
      env: {
        PORT: 4600,
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 2000,
      time: true,
      out_file: 'logs/copilot-out.log',
      error_file: 'logs/copilot-error.log',
      merge_logs: true,
    },
  ],
};
