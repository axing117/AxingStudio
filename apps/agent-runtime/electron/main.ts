/**
 * 阿星工坊 — Electron Main Process
 * 扫描本机 Agent → 注册为独立 Executor → 启动 Worker 进程协作完成任务
 */
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification } from 'electron';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { dirname } from 'node:path';

const APP_NAME = '阿星工坊';
const API_PORT = 3001;
const API_URL = `http://localhost:${API_PORT}`;

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let status: 'starting' | 'ready' | 'working' | 'error' = 'starting';
let logs: string[] = [];
let workerProcesses: ChildProcess[] = [];

interface DetectedAgent {
  name: string;
  type: string;
  capabilities: string[];
  location: string;
  executorId?: string;
}

let detectedAgents: DetectedAgent[] = [];

// ===== IPC Handlers =====
ipcMain.handle('get-status', () => status);
ipcMain.handle('get-logs', () => logs);
ipcMain.handle('get-agents', () => detectedAgents);
ipcMain.handle('get-api-url', () => API_URL);
ipcMain.handle('set-api-url', (_event, url: string) => {
  writeFileSync(join(app.getPath('userData'), 'api-url.txt'), url, 'utf-8');
});
ipcMain.handle('rescan', async () => {
  await scanAndRegister();
  return detectedAgents;
});

// ===== App Lifecycle =====
app.whenReady().then(async () => {
  log(`启动 ${APP_NAME} v${app.getVersion()}`);

  // 1. Start API server
  await startApiServer();
  await waitForApi();

  // 2. Create tray
  createTray();

  // 3. Create main window
  createWindow();

  // 4. Scan agents & register executors
  await scanAndRegister();

  // 5. Start worker processes (mock-agent for Claude Code, mimo-worker for Hermes)
  startWorkerProcesses();

  // 6. Show notification
  if (Notification.isSupported()) {
    new Notification({
      title: APP_NAME,
      body: `已就绪，检测到 ${detectedAgents.length} 个 Agent`,
    }).show();
  }

  app.on('activate', () => {
    if (mainWindow === null) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  // Keep tray running
});

app.on('before-quit', () => {
  for (const child of workerProcesses) {
    try { child.kill(); } catch { /* ignore */ }
  }
  workerProcesses = [];
});

// ===== API Server =====
async function startApiServer(): Promise<void> {
  log('正在启动指挥中心 API...');

  try {
    const isPackaged = app.isPackaged;
    let apiDir: string;

    if (isPackaged) {
      apiDir = join(process.resourcesPath, 'api');
    } else {
      apiDir = join(__dirname, '..', '..', '..', 'apps', 'api');
    }

    // Set env vars so the API knows where to store data
    const userDataDir = app.getPath('userData');
    process.env.AXING_API_DIR = apiDir;
    process.env.DB_PATH = join(userDataDir, 'axing.db');
    process.env.VAULT_ROOT = join(userDataDir, 'vault');

    // Tell API where the web frontend dist is
    if (isPackaged) {
      process.env.WEB_DIST_DIR = join(process.resourcesPath, 'web-dist');
    } else {
      process.env.WEB_DIST_DIR = join(apiDir, '..', 'web', 'dist');
    }

    // Ensure directories exist
    mkdirSync(userDataDir, { recursive: true });
    mkdirSync(join(userDataDir, 'vault'), { recursive: true });

    // In packaged mode, set NODE_PATH so require('sql.js') resolves
    if (isPackaged) {
      const sqlJsPath = join(apiDir, 'node_modules');
      if (existsSync(sqlJsPath)) {
        process.env.NODE_PATH = (process.env.NODE_PATH || '') +
          (process.env.NODE_PATH ? ';' : '') + sqlJsPath;
      }
    }

    // Check if API build exists
    const apiModulePath = isPackaged
      ? join(apiDir, 'server.cjs')
      : join(apiDir, 'dist', 'server.cjs');

    if (!existsSync(apiModulePath)) {
      log(`API 模块未找到: ${apiModulePath}。请先运行 build-app.ps1 构建。`);
      status = 'error';
      return;
    }

    // Dynamic import of the API module
    const apiModule = require(apiModulePath);
    await apiModule.startApi(API_PORT);

    log('指挥中心 API 已就绪');
    status = 'ready';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`API 启动失败: ${msg}`);
    status = 'error';
  }
}

/** Wait until API is responsive */
async function waitForApi(maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${API_URL}/api/health`);
      if (res.ok) {
        log('API 健康检查通过');
        return;
      }
    } catch { /* not ready yet */ }
    await sleep(1000);
  }
  log('警告: API 健康检查超时');
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
      label: `  ✓ ${a.name} (${a.capabilities.length} 项能力)`,
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

  // Update tray icon
  tray.setImage(createStatusIcon(status));
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

  // Load the web frontend
  // In production: API serves the web at localhost:3001
  // In dev: web dev server at localhost:5173
  const isPackaged = app.isPackaged;

  if (isPackaged) {
    // API server now hosts the web frontend at localhost:3001
    mainWindow.loadURL(`http://localhost:${API_PORT}`);
  } else {
    // Dev mode: try web dev server, fall back to API-served dist
    const distPath = join(__dirname, '..', '..', '..', 'apps', 'web', 'dist', 'index.html');
    if (existsSync(distPath)) {
      mainWindow.loadURL(`http://localhost:${API_PORT}`);
    } else {
      mainWindow.loadURL('http://localhost:5173');
    }
  }

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ===== Agent Scanning (Dynamic Detection) =====
async function scanAndRegister() {
  log('开始扫描本机 Agent...');
  detectedAgents = [];

  const userProfile = process.env.USERPROFILE || 'C:\\Users\\' + (process.env.USERNAME || 'default');
  const localAppData = process.env.LOCALAPPDATA || join(userProfile, 'AppData', 'Local');

  // ---- Claude Code ----
  const claudePaths = [
    join(userProfile, '.local', 'bin', 'claude.exe'),
    join(localAppData, 'Programs', 'Claude Code', 'claude.exe'),
    process.env.CLAUDE_PATH || '',
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

  // ---- OpenAI Codex ----
  try {
    const codexResult = execSync('where codex 2>nul', { encoding: 'utf8', windowsHide: true }).trim();
    const codexPath = codexResult.split('\n')[0]?.trim();
    if (codexPath && existsSync(codexPath)) {
      detectedAgents.push({
        name: 'Codex',
        type: 'codex',
        capabilities: ['forge.implement', 'forge.review'],
        location: codexPath,
      });
      log(`检测到 Codex: ${codexPath}`);
    }
  } catch { /* not in PATH */ }

  // Also check standard Codex install path
  const codexStandardPath = join(localAppData, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe');
  if (!detectedAgents.some(a => a.name === 'Codex') && existsSync(codexStandardPath)) {
    detectedAgents.push({
      name: 'Codex',
      type: 'codex',
      capabilities: ['forge.implement', 'forge.review'],
      location: codexStandardPath,
    });
    log(`检测到 Codex: ${codexStandardPath}`);
  }

  // ---- OpenCode ----
  try {
    const opencodeResult = execSync('where opencode 2>nul', { encoding: 'utf8', windowsHide: true }).trim();
    const opencodePath = opencodeResult.split('\n')[0]?.trim();
    if (opencodePath && existsSync(opencodePath)) {
      detectedAgents.push({
        name: 'OpenCode',
        type: 'opencode',
        capabilities: ['oracle.plan', 'oracle.review', 'forge.implement', 'forge.review', 'doc.generate'],
        location: opencodePath,
      });
      log(`检测到 OpenCode: ${opencodePath}`);
    }
  } catch { /* not in PATH */ }

  // Check standard OpenCode paths
  const opencodeStandardPaths = [
    join('C:', 'AI', 'opencode', 'OpenCode.exe'),
    join(process.env.ProgramFiles || 'C:\\Program Files', 'OpenCode', 'OpenCode.exe'),
    join(localAppData, 'Programs', 'OpenCode', 'OpenCode.exe'),
  ];
  for (const p of opencodeStandardPaths) {
    if (!detectedAgents.some(a => a.name === 'OpenCode') && existsSync(p)) {
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

  // ---- Node.js (required for Hermes/MiMo) ----
  let nodePath = '';
  try {
    nodePath = execSync('where node 2>nul', { encoding: 'utf8', windowsHide: true }).trim().split('\n')[0]?.trim();
  } catch { /* not found */ }

  // ---- Hermes (MiMo Worker) ----
  if (nodePath) {
    const mimoApiKey = process.env.MIMO_API_KEY || process.env.ARK_API_KEY || '';
    if (mimoApiKey) {
      detectedAgents.push({
        name: 'Hermes (MiMo)',
        type: 'mimo',
        capabilities: ['hermes.media'],
        location: 'MiMo API',
      });
      log('检测到 Hermes (MiMo): API Key 已配置');
    } else {
      log('提示: 设置 MIMO_API_KEY 或 ARK_API_KEY 环境变量以启用 Hermes 媒体 Agent');
    }
  }

  // ---- Fallback: Built-in Mock Agent ----
  if (detectedAgents.length === 0) {
    log('未检测到外部 Agent，启用内置 Mock Agent 用于演示');
    detectedAgents.push({
      name: 'Mock Agent (演示)',
      type: 'mock',
      capabilities: ['oracle.plan', 'oracle.review', 'forge.implement', 'forge.review'],
      location: '内置',
    });
  }

  // Register each agent as a SEPARATE executor
  await registerExecutors();
  updateTrayMenu();
}

async function registerExecutors() {
  let successCount = 0;

  for (const agent of detectedAgents) {
    try {
      const body: Record<string, unknown> = {
        name: agent.name,
        type: agent.type,
        capabilities: agent.capabilities,
      };

      // Include executable path for local agents so workers know what to spawn
      if (agent.location && agent.location !== '内置' && agent.location !== 'MiMo API') {
        body.location = agent.location;
      }

      const res = await fetch(`${API_URL}/api/executors/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json() as { ok: boolean; data?: { id: string } };
        if (data.ok && data.data) {
          agent.executorId = data.data.id;
          successCount++;
          log(`${agent.name} 注册成功 → ${data.data.id}`);
        }
      } else {
        log(`${agent.name} 注册失败: HTTP ${res.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`${agent.name} 注册失败: ${msg}`);
      // Retry after delay
      setTimeout(async () => {
        try {
          await registerExecutors();
        } catch { /* ignore */ }
      }, 5000);
    }
  }

  log(`注册完成: ${successCount}/${detectedAgents.length} 个 Executor`);
}

// ===== Worker Processes =====
function startWorkerProcesses() {
  const isPackaged = app.isPackaged;
  const rootDir = isPackaged
    ? process.resourcesPath
    : join(__dirname, '..', '..', '..');

  // Start mock-agent worker (handles oracle/forge tasks via Claude Code CLI)
  if (detectedAgents.some(a => a.type === 'claude-code' || a.type === 'mock')) {
    startMockAgentWorker(rootDir, isPackaged);
  }

  // Start mimo-worker (handles hermes.media tasks)
  if (detectedAgents.some(a => a.type === 'mimo')) {
    startMimoWorker(rootDir, isPackaged);
  }
}

function startMockAgentWorker(rootDir: string, isPackaged: boolean) {
  try {
    const nodePath = findNode();
    if (!nodePath) {
      log('未找到 Node.js，无法启动 mock-agent worker');
      return;
    }

    let workerScript: string;
    let cwd: string;

    if (isPackaged) {
      // Use the bundled compiled worker
      workerScript = join(rootDir, 'workers', 'mock-agent', 'worker.cjs');
      cwd = rootDir;
    } else {
      // Dev mode: use npm to run tsx
      const npmPath = findNpm();
      if (!npmPath) {
        log('未找到 npm，无法启动 mock-agent worker');
        return;
      }
      const child = spawn(npmPath, ['-w', 'workers/mock-agent', 'run', 'dev'], {
        cwd: rootDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          API_URL,
        },
      });
      child.stdout?.on('data', (d: Buffer) => log(`[mock-agent] ${d.toString().trim()}`));
      child.stderr?.on('data', (d: Buffer) => log(`[mock-agent:err] ${d.toString().trim()}`));
      child.on('exit', (code) => log(`mock-agent worker 退出 (code=${code})`));
      workerProcesses.push(child);
      log('启动 mock-agent worker (npm dev)');
      return;
    }

    if (!existsSync(workerScript)) {
      log(`mock-agent worker 未找到: ${workerScript}`);
      return;
    }

    const child = spawn(nodePath, [workerScript], {
      cwd,
      stdio: 'pipe',
      env: {
        ...process.env,
        API_URL,
        NODE_PATH: isPackaged ? join(rootDir, 'api', 'node_modules') : (process.env.NODE_PATH || ''),
      },
    });

    child.stdout?.on('data', (d: Buffer) => log(`[mock-agent] ${d.toString().trim()}`));
    child.stderr?.on('data', (d: Buffer) => log(`[mock-agent:err] ${d.toString().trim()}`));
    child.on('exit', (code) => log(`mock-agent worker 退出 (code=${code})`));
    workerProcesses.push(child);
    log('启动 mock-agent worker');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`启动 mock-agent worker 失败: ${msg}`);
  }
}

function startMimoWorker(rootDir: string, isPackaged: boolean) {
  try {
    const nodePath = findNode();
    if (!nodePath) {
      log('未找到 Node.js，无法启动 mimo-worker');
      return;
    }

    if (isPackaged) {
      // Mimo worker not bundled yet — skip for now
      log('mimo-worker 暂未打包，跳过（可在后续版本中支持）');
      return;
    } else {
      const npmPath = findNpm();
      if (!npmPath) return;
      const child = spawn(npmPath, ['-w', 'workers/mimo-worker', 'run', 'dev'], {
        cwd: rootDir,
        stdio: 'pipe',
        env: { ...process.env, API_URL },
      });
      child.stdout?.on('data', (d: Buffer) => log(`[mimo-worker] ${d.toString().trim()}`));
      child.stderr?.on('data', (d: Buffer) => log(`[mimo-worker:err] ${d.toString().trim()}`));
      child.on('exit', (code) => log(`mimo-worker 退出 (code=${code})`));
      workerProcesses.push(child);
      log('启动 mimo-worker (npm dev)');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`启动 mimo-worker 失败: ${msg}`);
  }
}

function findNode(): string | null {
  try {
    const result = execSync('where node 2>nul', { encoding: 'utf8', windowsHide: true }).trim();
    return result.split('\n')[0]?.trim() || null;
  } catch {
    // Fallback: check common install paths
    const candidates = [
      join('C:', 'AI', 'node', 'node.exe'),
      join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return null;
  }
}

function findNpm(): string | null {
  try {
    const result = execSync('where npm 2>nul', { encoding: 'utf8', windowsHide: true }).trim();
    return result.split('\n')[0]?.trim() || null;
  } catch {
    const nodeDir = findNode();
    if (nodeDir) {
      const npmPath = join(dirname(nodeDir), 'npm.cmd');
      if (existsSync(npmPath)) return npmPath;
    }
    return null;
  }
}

// ===== Utils =====
function log(message: string) {
  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const entry = `[${stamp}] ${message}`;
  logs.push(entry);
  if (logs.length > 500) logs.shift();
  console.log(entry);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', entry);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
