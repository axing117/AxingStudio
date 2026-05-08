import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('agentRuntime', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  getAgents: () => ipcRenderer.invoke('get-agents'),
  getApiUrl: () => ipcRenderer.invoke('get-api-url'),
  setApiUrl: (url: string) => ipcRenderer.invoke('set-api-url', url),
  rescan: () => ipcRenderer.invoke('rescan'),
  onStatusChange: (cb: (status: string) => void) => {
    ipcRenderer.on('status-change', (_, status) => cb(status));
  },
  onLog: (cb: (entry: string) => void) => {
    ipcRenderer.on('log', (_, entry) => cb(entry));
  },
  onShowLogs: (cb: (logs: string[]) => void) => {
    ipcRenderer.on('show-logs', (_, logs) => cb(logs));
  },
  onShowSettings: (cb: () => void) => {
    ipcRenderer.on('show-settings', () => cb());
  },
});
