-- Dijalankan otomatis saat container MySQL pertama kali dibuat
CREATE DATABASE IF NOT EXISTS crime_dashboard
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Pastikan user memiliki semua hak atas database
GRANT ALL PRIVILEGES ON crime_dashboard.* TO 'root'@'%';
FLUSH PRIVILEGES;
