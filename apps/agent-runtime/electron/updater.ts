/**
 * Auto-Updater — 对接 GitHub Releases 检查更新
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { autoUpdater } = require('electron-updater');
const { app, dialog, shell } = require('electron');

const GITHUB_OWNER = 'axing117';
const GITHUB_REPO = 'axing-studio';

function setupAutoUpdater(mainWindow: any, log: (msg: string) => void): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
  });

  autoUpdater.on('update-available', (info: any) => {
    log(`发现新版本 v${info.version}，正在下载...`);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '发现更新',
        message: `阿星工坊 Agent v${info.version} 已发布`,
        detail: '点击"立即更新"开始下载并安装',
        buttons: ['立即更新', '稍后提醒'],
        defaultId: 0,
      }).then((result: any) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
          log('开始下载更新...');
        } else {
          log('用户跳过本次更新');
        }
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    log('已是最新版本');
  });

  autoUpdater.on('download-progress', (progress: any) => {
    const percent = Math.round(progress.percent);
    log(`下载进度: ${percent}%`);
    if (mainWindow) {
      mainWindow.webContents.send('update-progress', percent);
    }
  });

  autoUpdater.on('update-downloaded', (info: any) => {
    log(`更新下载完成 v${info.version}，准备安装`);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '更新就绪',
        message: `v${info.version} 已下载完成`,
        detail: '点击"立即安装"将关闭应用并完成更新',
        buttons: ['立即安装', '稍后安装'],
        defaultId: 0,
      }).then((result: any) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
    }
  });

  autoUpdater.on('error', (err: any) => {
    log(`更新检查失败: ${err.message}`);
  });

  // 启动 5 秒后检查
  setTimeout(() => {
    log('检查更新...');
    autoUpdater.checkForUpdates().catch((err: any) => {
      log(`更新检查错误: ${err.message}`);
    });
  }, 5000);

  // 每小时检查一次
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 60 * 60 * 1000);
}

function checkForUpdatesManually(log: (msg: string) => void): void {
  log('手动检查更新...');
  autoUpdater.checkForUpdates().catch((err: any) => {
    log(`更新检查错误: ${err.message}`);
  });
}

module.exports = { setupAutoUpdater, checkForUpdatesManually };
