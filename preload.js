// 预加载脚本：在渲染进程里安全地暴露主进程能力
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  saveImage: (name, dataUrl) => ipcRenderer.invoke('image:save', { name, dataUrl }),
  loadImage: (relPath) => ipcRenderer.invoke('image:load', relPath),
  exportExcel: (defaultName, base64) => ipcRenderer.invoke('export:save', { defaultName, base64 })
});
