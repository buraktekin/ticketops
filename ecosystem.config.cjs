module.exports = {
  apps: [
    {
      name:         'ticketops',
      script:       'src/monitor/index.js',
      interpreter:  'node',
      interpreter_args: '--experimental-vm-modules',

      // Restart on crash, max 10 times in 30s before giving up
      autorestart:  true,
      max_restarts: 10,
      min_uptime:   '30s',

      // Env
      env: {
        NODE_ENV: 'production',
      },

      // Log rotation
      log_file:     'logs/combined.log',
      out_file:     'logs/out.log',
      error_file:   'logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:   true,
    },
  ],
};
