# Vertex Panel

Vertex Panel is a modern and performant server & VPS management panel for hosting businesses. Built with Laravel and React.

## 🚀 One-Line Installation

To install Vertex Panel on a fresh Debian/Ubuntu VPS:

```bash
curl -sSL https://raw.githubusercontent.com/Bossa9973/Vertex-Panel/main/install.sh | bash
```

---

## 💾 1-Command Automated Backup & Cloud Upload

Back up your entire database (users, linked VPSes, servers, nodes, settings), user data, `.env`, and server configurations with a single command. The backup archive will automatically upload to free cloud hosting and output a download link for instant migration:

```bash
vertex backup
# or
./backup.sh
```

---

## 🔄 1-Command Zero-Configuration Restore on New VPS

To migrate or restore your panel to a new VPS with **ZERO manual setups, env edits, node configuration, or user fixes**, simply run:

```bash
curl -sSL https://raw.githubusercontent.com/Bossa9973/Vertex-Panel/main/restore.sh | bash -s -- <BACKUP_DOWNLOAD_URL_OR_FILE>
```

Example:
```bash
curl -sSL https://raw.githubusercontent.com/Bossa9973/Vertex-Panel/main/restore.sh | bash -s -- https://litterbox.catbox.moe/resources/internals/api.php...
```

The restore script will:
- Install all required dependencies (PHP 8.2+, MySQL/MariaDB, Redis, Nginx, Supervisor, Composer, Node.js).
- Download and extract your complete backup package.
- Auto-create and import the MySQL database dump (including all users, nodes, linked VPSes).
- Restore user storage, avatars, uploaded files, and `.env` credentials.
- Auto-configure Nginx virtual hosts, Supervisor queue workers, and file permissions.
- Build frontend assets and optimize application caches.
- Launch all services ready for immediate login!

---

## ⚙️ Management CLI

```bash
vertex status           # Check status of web server and queue workers
vertex backup           # Take full backup & upload to free cloud hosting
vertex restore <URL>    # Restore panel from backup URL or local file
vertex start|stop|restart # Control services
vertex logs             # Tail application logs
vertex update           # Pull latest updates from GitHub
```

## License

Vertex Panel is licensed under MIT / Proprietary License.

