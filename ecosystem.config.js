module.exports = {
  apps: [
    {
      name: '9router',
      script: 'C:\\Users\\mrdee\\AppData\\Roaming\\npm\\node_modules\\9router\\cli.js',
      args: '--skip-update',
      cwd: 'C:\\Users\\mrdee\\AppData\\Roaming\\9router',
      max_restarts: 10,
      restart_delay: 3000,
      min_uptime: '10s',
      max_memory_restart: '2G',
      error_file: 'C:\\Users\\mrdee\\AppData\\Roaming\\9router\\logs\\pm2-error.log',
      out_file: 'C:\\Users\\mrdee\\AppData\\Roaming\\9router\\logs\\pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
    },
    {
      name: 'drama15-api',
      script: 'D:\\CODEEEEE\\ZZZ\\apps\\api\\src\\startDev.js',
      cwd: 'D:\\CODEEEEE\\ZZZ\\apps\\api',
      max_restarts: 10,
      restart_delay: 5000,
      min_uptime: '15s',
      max_memory_restart: '2G',
      error_file: 'D:\\CODEEEEE\\ZZZ\\logs\\api-pm2-error.log',
      out_file: 'D:\\CODEEEEE\\ZZZ\\logs\\api-pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      watch: false,
    },
  ],
};
