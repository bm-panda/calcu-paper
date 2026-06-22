const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

const PORT = 19527;
const PID_FILE = path.join(os.tmpdir(), 'bm-calc.pid');
const WIN_W = 400, WIN_H = 600;
const DIR = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function getScreenSize() {
  try {
    const out = execSync(
      'wmic path Win32_VideoController get CurrentHorizontalResolution,CurrentVerticalResolution /format:csv',
      { encoding: 'utf8', timeout: 3000 }
    );
    const lines = out.trim().split('\n').filter(Boolean);
    const vals = lines[lines.length - 1].split(',');
    return { w: parseInt(vals[1]), h: parseInt(vals[2]) };
  } catch (e) {
    return { w: 1920, h: 1080 };
  }
}

function findBrowser() {
  const candidates = [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function openBrowser(url) {
  if (process.platform !== 'win32') {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    execSync(`${cmd} "${url}"`);
    return;
  }
  const browserPath = findBrowser();
  if (!browserPath) { execSync(`start "" "${url}"`); return; }
  const screen = getScreenSize();
  const posX = Math.round((screen.w - WIN_W) / 2);
  const posY = Math.round((screen.h - WIN_H) / 2);
  const dataDir = path.join(os.tmpdir(), 'bm-calc-app');
  fs.mkdirSync(dataDir, { recursive: true });
  const p = spawn(browserPath, [
    `--app=${url}`,
    `--window-size=${WIN_W},${WIN_H}`,
    `--window-position=${posX},${posY}`,
    `--user-data-dir=${dataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { stdio: 'ignore' });
  p.on('exit', () => shutdown());
}

function readPid() {
  try { return JSON.parse(fs.readFileSync(PID_FILE, 'utf8')); } catch (e) { return null; }
}

function writePid() {
  fs.writeFileSync(PID_FILE, JSON.stringify({ pid: process.pid, port: PORT }), 'utf8');
}

function cleanPid() {
  try { fs.unlinkSync(PID_FILE); } catch (e) {}
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return false; }
}

function isPortListening(port) {
  try {
    return execSync(`netstat -ano | findstr "127.0.0.1:${port}"`, { encoding: 'utf8', timeout: 3000 })
      .includes('LISTENING');
  } catch (e) { return false; }
}

// Check existing instance first
const existing = readPid();
if (existing && isAlive(existing.pid) && isPortListening(existing.port)) {
  openBrowser(`http://127.0.0.1:${existing.port}`);
  console.log(JSON.stringify({
    summary: `计算稿纸已在运行: http://127.0.0.1:${existing.port}`,
    details: [{ status: 'ok', output: `http://127.0.0.1:${existing.port}` }]
  }));
  process.exit(0);
}
cleanPid();

const server = http.createServer((req, res) => {
  const filePath = path.join(DIR, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  writePid();
  const url = `http://127.0.0.1:${PORT}`;
  openBrowser(url);
  console.log(JSON.stringify({
    summary: `计算稿纸已启动: ${url}`,
    details: [{ status: 'ok', output: url }]
  }));
});

function shutdown() {
  cleanPid();
  server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);