module.exports = {
  apps: [
    {
      // ── Identitas ────────────────────────────────────────────────
      name: 'crime-dashboard-api',
      script: 'src/app.js',
      cwd: './',

      // ── Mode ─────────────────────────────────────────────────────
      // 'cluster' untuk multi-core CPU, 'fork' untuk single instance
      exec_mode: 'fork',
      instances: 1, // ganti ke 'max' untuk pakai semua CPU core

      // ── Environment ───────────────────────────────────────────────
      env: {
        NODE_ENV: 'development',
        PORT: 6000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 6000,
      },

      // ── Auto-restart ──────────────────────────────────────────────
      watch: false,              // jangan watch di production
      ignore_watch: ['node_modules', 'logs', '.git'],
      max_memory_restart: '512M',
      restart_delay: 3000,       // tunggu 3 detik sebelum restart
      max_restarts: 10,          // max restart sebelum stop
      min_uptime: '10s',         // minimal uptime agar dianggap stable

      // ── Logging ───────────────────────────────────────────────────
      log_file: 'logs/pm2-combined.log',
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // ── Graceful shutdown ─────────────────────────────────────────
      kill_timeout: 10000,       // tunggu 10 detik sebelum SIGKILL
      listen_timeout: 15000,     // timeout saat startup
      shutdown_with_message: true,

      // ── Monitoring ────────────────────────────────────────────────
      pmx: true,
    },
  ],
};