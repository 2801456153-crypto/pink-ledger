// 主进程：负责创建窗口、读写本地数据文件
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 统一数据目录名，保证开发版和安装版读同一份数据
app.setName('pink-ledger');

let dataFile = '';
let imagesDir = '';

// 确保数据文件和图片目录存在
function ensurePaths() {
  const userData = app.getPath('userData');
  dataFile = path.join(userData, 'data.json');
  imagesDir = path.join(userData, 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#fff5f7',
    title: '我的记账',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  ensurePaths();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- 数据读写 ----
ipcMain.handle('data:load', () => {
  ensurePaths();
  if (fs.existsSync(dataFile)) {
    try {
      return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    } catch (e) {
      return null;
    }
  }
  return null;
});

ipcMain.handle('data:save', (event, data) => {
  ensurePaths();
  // 先写临时文件再重命名，避免写入中断导致数据损坏
  const tmp = dataFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, dataFile);
  return true;
});

// ---- 图片保存/读取（第三步会用到，先预留）----
ipcMain.handle('image:save', (event, { name, dataUrl }) => {
  ensurePaths();
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const ext = (name.match(/\.(\w+)$/) || [null, 'png'])[1];
  const fname = Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.' + ext;
  fs.writeFileSync(path.join(imagesDir, fname), Buffer.from(base64, 'base64'));
  return path.join('images', fname);
});

ipcMain.handle('image:load', (event, relPath) => {
  ensurePaths();
  const p = path.join(app.getPath('userData'), relPath);
  if (!fs.existsSync(p)) return null;
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
  return 'data:' + mime + ';base64,' + fs.readFileSync(p).toString('base64');
});

// ---- 导出 Excel ----
ipcMain.handle('export:save', async (event, { defaultName, base64 }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '导出 Excel',
    defaultPath: defaultName,
    filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return { ok: true, filePath };
});
