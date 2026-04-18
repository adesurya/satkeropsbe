/**
 * PM2 Ecosystem Config — Police Heatmap Frontend (PRODUCTION)
 *
 * Server  : 103.179.134.72
 * Domain  : www.opsinsight.505ai.io
 *
 * ============================================
 * QUICK START (di server production)
 * ============================================
 *
 *   cd /var/www/police-heatmap-fe
 *   npm ci
 *   npm run build
 *   pm2 start ecosystem.config.cjs --only police-heatmap-fe
 *   pm2 save
 *   pm2 startup
 *
 * Aplikasi akan running di 127.0.0.1:5173 (localhost only).
 * Nginx me-reverse-proxy dari www.opsinsight.505ai.io (HTTPS) → 127.0.0.1:5173.
 *
 * ============================================
 * REMOTE DEPLOYMENT (dari workstation lokal)
 * ============================================
 *
 *   pm2 deploy ecosystem.config.cjs production setup      # sekali saja (setup awal)
 *   pm2 deploy ecosystem.config.cjs production            # deploy update
 *   pm2 deploy ecosystem.config.cjs production revert 1   # rollback ke versi sebelumnya
 *
 * ============================================
 * PERINTAH HARIAN
 * ============================================
 *
 *   pm2 list                              — list semua proses
 *   pm2 logs police-heatmap-fe            — tail logs
 *   pm2 logs police-heatmap-fe --err      — error log only
 *   pm2 restart police-heatmap-fe         — restart
 *   pm2 reload police-heatmap-fe          — zero-downtime reload
 *   pm2 stop police-heatmap-fe            — stop tanpa hapus
 *   pm2 monit                             — realtime monitoring UI
 *   pm2 flush                             — clear logs
 *
 * Requirements (install global di server):
 *   npm install -g pm2 serve
 *   pm2 install pm2-logrotate             # auto-rotate logs
 */

const path = require('path')

// ============================================
// Konfigurasi server production
// ============================================
const PROD_HOST = '103.179.134.72'
const PROD_DOMAIN = 'www.opsinsight.505ai.io'
const PROD_USER = process.env.DEPLOY_USER || 'deploy'
const PROD_PATH = '/var/www/police-heatmap-fe'
const PROD_REPO = process.env.DEPLOY_REPO || 'git@github.com:your-org/police-heatmap-fe.git'
const PROD_BRANCH = process.env.DEPLOY_BRANCH || 'origin/main'

// Port internal — HANYA listen di 127.0.0.1, TIDAK di-expose ke publik.
// Publik akses via Nginx di port 443 (HTTPS) → proxy ke 127.0.0.1:5173.
const FE_PORT = process.env.FE_PORT || 5173
const FE_BIND = process.env.FE_BIND || '127.0.0.1'

module.exports = {
  apps: [
    {
      name: 'police-heatmap-fe',
      cwd: __dirname,
      script: 'npx',
      args: [
        'serve',
        '-s', 'dist',               // SPA mode — fallback semua route ke index.html
        '-l', `tcp://${FE_BIND}:${FE_PORT}`,
        '--no-clipboard',
        '--no-request-logging',     // kurangi noise di pm2 log (sudah dilog Nginx)
        '--cors'                    // aman karena Nginx yang handle origin whitelisting
      ],
      interpreter: 'none',

      // Process management
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 3000,
      max_memory_restart: '300M',
      watch: false,
      kill_timeout: 5000,
      listen_timeout: 10000,

      // Environment
      env: {
        NODE_ENV: 'production',
        HOST: FE_BIND,
        PORT: FE_PORT,
        // Expose domain info ke aplikasi (opsional, bisa dipakai kalau perlu)
        PUBLIC_DOMAIN: PROD_DOMAIN,
        PUBLIC_URL: `https://${PROD_DOMAIN}`
      },

      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      error_file: path.join(__dirname, 'logs', 'fe-error.log'),
      out_file: path.join(__dirname, 'logs', 'fe-out.log'),
      merge_logs: true,
      time: true,

      // Graceful shutdown
      wait_ready: false,
      shutdown_with_message: true
    }
  ],

  // ============================================
  // Remote deployment (pm2 deploy)
  // ============================================
  deploy: {
    production: {
      user: PROD_USER,
      host: [PROD_HOST],
      ref: PROD_BRANCH,
      repo: PROD_REPO,
      path: PROD_PATH,
      ssh_options: ['StrictHostKeyChecking=no', 'ForwardAgent=yes'],

      // Dijalankan SEKALI setelah `pm2 deploy production setup`
      'pre-setup': [
        `mkdir -p ${PROD_PATH}`,
        `mkdir -p ${PROD_PATH}/shared/logs`
      ].join(' && '),

      // Dijalankan SETIAP deploy, di server remote, setelah git pull
      'post-deploy': [
        'npm ci',
        'npm run build',
        'mkdir -p logs',
        'pm2 reload ecosystem.config.cjs --only police-heatmap-fe --update-env',
        'pm2 save'
      ].join(' && '),

      env: {
        NODE_ENV: 'production',
        PUBLIC_DOMAIN: PROD_DOMAIN,
        PUBLIC_URL: `https://${PROD_DOMAIN}`
      }
    }
  }
}
