/**
 * 阿星工坊 — Electron Main Process
 * 完全集成版：API直接在主进程中运行，无子进程
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

// ===== Config =====
const APP_NAME = '阿星工坊';
const API_PORT = 3001;
const API_URL = `http://localhost:${API_PORT}`;

// ===== State =====
let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let status: 'starting' | 'ready' | 'working' | 'error' = 'starting';
let detectedAgents: DetectedAgent[] = [];
let registeredExecutorId: string | null = null;
let logs: string[] = [];

interface DetectedAgent {
  name: string;
  type: string;
  capabilities: string[];
  location: string;
}

// ===== IPC Handlers =====
ipcMain.handle('get-status', () => status);
ipcMain.handle('get-logs', () => logs);
ipcMain.handle('get-agents', () => detectedAgents);
ipcMain.handle('get-api-url', () => API_URL);
ipcMain.handle('rescan', async () => {
  await scanAndRegister();
  return detectedAgents;
});

// ===== App Lifecycle =====
app.whenReady().then(async () => {
  log(`启动 ${APP_NAME}`);

  // 1. 启动API服务器（直接调用，无子进程）
  await startApiServer();

  // 2. 创建系统托盘
  createTray();

  // 3. 创建主窗口
  createWindow();

  // 4. 扫描并注册Agent
  await scanAndRegister();

  // 5. 显示启动完成通知
  if (Notification.isSupported()) {
    new Notification({
      title: APP_NAME,
      body: `已启动，检测到 ${detectedAgents.length} 个 Agent`,
    }).show();
  }

  app.on('activate', () => {
    if (mainWindow === null) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  // 保持托盘运行
});

// ===== API Server =====
async function startApiServer(): Promise<void> {
  log('正在启动指挥中心...');

  try {
    const isPackaged = app.isPackaged;
    let apiModulePath: string;
    let apiDir: string;

    if (isPackaged) {
      apiDir = join(process.resourcesPath, 'api');
      apiModulePath = join(apiDir, 'server.cjs');
    } else {
      apiDir = join(__dirname, '..', '..', '..', 'apps', 'api');
      apiModulePath = join(apiDir, 'dist', 'server.cjs');
    }

    log(`API模块: ${apiModulePath}`);

    if (!existsSync(apiModulePath)) {
      log('API模块不存在: ' + apiModulePath);
      status = 'error';
      return;
    }

    // 设置环境变量，告诉API正确的路径
    process.env.AXING_API_DIR = apiDir;
    process.env.DB_PATH = join(apiDir, 'axing.db');
    process.env.VAULT_ROOT = join(apiDir, '..', 'vault');

    // 动态导入API模块（CJS格式）
    const apiModule = require(apiModulePath);
    await apiModule.startApi(API_PORT);

    log('指挥中心已就绪');
    status = 'ready';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`API启动失败: ${msg}`);
    status = 'error';
  }
}

// ===== System Tray =====
function createTray() {
  const icon = createStatusIcon('starting');
  tray = new Tray(icon);
  tray.setToolTip(`${APP_NAME} — 启动中`);
  updateTrayMenu();

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createStatusIcon(status: string): Electron.NativeImage {
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);

  const colors: Record<string, [number, number, number, number]> = {
    starting: [255, 200, 0, 255],
    ready: [0, 200, 100, 255],
    working: [0, 150, 255, 255],
    error: [255, 50, 50, 255],
  };

  const color = colors[status] || colors.starting;
  const center = size / 2;
  const radius = size / 2 - 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;
      if (dist <= radius) {
        canvas[idx] = color[0];
        canvas[idx + 1] = color[1];
        canvas[idx + 2] = color[2];
        canvas[idx + 3] = color[3];
      } else {
        canvas[idx + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function updateTrayMenu() {
  if (!tray) return;

  const statusLabels: Record<string, string> = {
    starting: '🟡 启动中',
    ready: '🟢 就绪',
    working: '🔵 执行中',
    error: '🔴 错误',
  };

  const contextMenu = Menu.buildFromTemplate([
    { label: `${APP_NAME}`, enabled: false },
    { label: statusLabels[status] || status, enabled: false },
    { type: 'separator' },
    {
      label: `已检测 ${detectedAgents.length} 个 Agent`,
      enabled: false,
    },
    ...detectedAgents.slice(0, 5).map(a => ({
      label: `  ✓ ${a.name}`,
      enabled: false,
    })),
    { type: 'separator' },
    {
      label: '打开面板',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: '重新扫描',
      click: () => scanAndRegister(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`${APP_NAME} — ${statusLabels[status] || status}`);
}

// ===== Main Window =====
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: APP_NAME,
    icon: createStatusIcon('ready'),
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 加载Dashboard
  const isPackaged = app.isPackaged;
  let htmlPath: string;

  if (isPackaged) {
    htmlPath = join(process.resourcesPath, 'web-dist', 'index.html');
  } else {
    htmlPath = join(__dirname, '..', '..', '..', 'apps', 'web', 'dist', 'index.html');
  }

  if (existsSync(htmlPath)) {
    mainWindow.loadFile(htmlPath);
  } else {
    log('前端文件不存在: ' + htmlPath);
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow?.hide();
  });

  // 窗口加载完成后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
}

// ===== Agent Scanning =====
async function scanAndRegister() {
  log('开始扫描本机 Agent...');
  detectedAgents = [];

  // Scan for Claude Code
  const claudePaths = [
    process.env.CLAUDE_PATH || '',
    join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe'),
    'C:\\Users\\rochelimit\\.local\\bin\\claude.exe',
  ].filter(Boolean);

  for (const p of claudePaths) {
    if (existsSync(p)) {
      detectedAgents.push({
        name: 'Claude Code',
        type: 'claude-code',
        capabilities: ['oracle.plan', 'oracle.review', 'forge.implement', 'forge.review', 'doc.generate'],
        location: p,
      });
      log(`检测到 Claude Code: ${p}`);
      break;
    }
  }

  // Scan for Codex
  try {
    const codexPath = execSync('where codex 2>nul', { encoding: 'utf8', windowsHide: true }).trim().split('\n')[0];
    if (codexPath && existsSync(codexPath.trim())) {
      detectedAgents.push({
        name: 'Codex',
        type: 'codex',
        capabilities: ['forge.implement', 'forge.review'],
        location: codexPath.trim(),
      });
      log(`检测到 Codex: ${codexPath.trim()}`);
    }
  } catch { /* not found */ }

  // Scan for OpenCode
  const opencodePaths = [
    'C:\\AI\\opencode\\OpenCode.exe',
  ].filter(Boolean);

  for (const p of opencodePaths) {
    if (existsSync(p)) {
      detectedAgents.push({
        name: 'OpenCode',
        type: 'opencode',
        capabilities: ['oracle.plan', 'oracle.review', 'forge.implement', 'forge.review', 'doc.generate'],
        location: p,
      });
      log(`检测到 OpenCode: ${p}`);
      break;
    }
  }

  // Scan for Hermes (MiMo Worker)
  const hasNodeJs = (() => {
    try { execSync('where node 2>nul', { encoding: 'utf8', windowsHide: true }); return true; } catch { return false; }
  })();

  if (hasNodeJs) {
    const mimoApiKey = process.env.MIMO_API_KEY || '';
    if (mimoApiKey) {
      detectedAgents.push({
        name: 'Hermes (MiMo)',
        type: 'mimo',
        capabilities: ['hermes.media'],
        location: 'MiMo API',
      });
      log(`检测到 Hermes (MiMo): API Key 已配置`);
    }
  }

  if (detectedAgents.length === 0) {
    log('未检测到外部 Agent，使用内置 Mock Agent');
    detectedAgents.push({
      name: 'Mock Agent (测试)',
      type: 'mock',
      capabilities: ['oracle.plan', 'oracle.review', 'forge.implement', 'forge.review'],
      location: '内置',
    });
  }

  await registerExecutor();
}

async function registerExecutor() {
  if (detectedAgents.length === 0) return;

  const allCapabilities = [...new Set(detectedAgents.flatMap(a => a.capabilities))];
  const agentNames = detectedAgents.map(a => a.name).join(' + ');

  try {
    const response = await fetch(`${API_URL}/api/executors/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${agentNames} Runtime`,
        type: detectedAgents[0].type,
        capabilities: allCapabilities,
      }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { ok: boolean; data?: { id: string }; error?: string };

    if (data.ok && data.data) {
      registeredExecutorId = data.data.id;
      log(`注册成功: ${data.data.id}`);
    } else {
      throw new Error(data.error || '注册失败');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`注册失败: ${msg}`);
    setTimeout(() => registerExecutor(), 5000);
  }
}

// ===== Utils =====
function log(message: string) {
  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const entry = `[${stamp}] ${message}`;
  logs.push(entry);
  if (logs.length > 500) logs.shift();
  console.log(entry);
  if (mainWindow) {
    mainWindow.webContents.send('log', entry);
  }
}
