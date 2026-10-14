// Ponte segura entre a interface e o processo principal.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (cb) => {
  const h = (_e, data) => cb(data);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('api', {
  info: () => ipcRenderer.invoke('app:info'),
  nvenc: () => ipcRenderer.invoke('app:nvenc'),
  pendingFile: () => ipcRenderer.invoke('app:pendingFile'),
  setCurrentProject: (id) => ipcRenderer.invoke('app:currentProject', id),
  logError: (msg) => ipcRenderer.invoke('app:logError', msg),
  errorLogPath: () => ipcRenderer.invoke('app:errorLogPath'),
  onOpenFile: on('app:openFile'),

  openMediaDialog: () => ipcRenderer.invoke('dialog:openMedia'),
  relinkDialog: (name) => ipcRenderer.invoke('dialog:relink', name),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },

  probe: (p) => ipcRenderer.invoke('media:probe', p),
  thumbs: (p, info) => ipcRenderer.invoke('media:thumbs', p, info),
  waveform: (p) => ipcRenderer.invoke('media:waveform', p),
  proxy: (p, kind, jobId) => ipcRenderer.invoke('media:proxy', p, kind, jobId),
  reverse: (p, kind, jobId) => ipcRenderer.invoke('media:reverse', p, kind, jobId),
  onProxyProgress: on('media:proxyProgress'),

  writeFile: (scope, name, bytes) => ipcRenderer.invoke('fs:write', scope, name, bytes),
  exists: (paths) => ipcRenderer.invoke('fs:exists', paths),
  statFiles: (paths) => ipcRenderer.invoke('media:stat', paths),
  findByName: (name, hints) => ipcRenderer.invoke('media:findByName', name, hints),
  replaceDialog: (name) => ipcRenderer.invoke('dialog:replace', name),
  captionModels: () => ipcRenderer.invoke('captions:models'),
  captionDownload: (id) => ipcRenderer.invoke('captions:download', id),
  captionTranscribe: (opts) => ipcRenderer.invoke('captions:transcribe', opts),
  captionCancel: () => ipcRenderer.invoke('captions:cancel'),
  onCaptionProgress: on('captions:progress'),
  fxCacheStatus: (key) => ipcRenderer.invoke('fxcache:status', key),
  fxCacheDone: (key) => ipcRenderer.invoke('fxcache:done', key),

  listDrafts: () => ipcRenderer.invoke('drafts:list'),
  loadDraft: (id) => ipcRenderer.invoke('drafts:load', id),
  saveDraft: (id, json, meta, cover) => ipcRenderer.invoke('drafts:save', id, json, meta, cover),
  deleteDraft: (id) => ipcRenderer.invoke('drafts:delete', id),
  renameDraft: (id, name) => ipcRenderer.invoke('drafts:rename', id, name),
  duplicateDraft: (id) => ipcRenderer.invoke('drafts:duplicate', id),
  saveProjectFile: (json, name) => ipcRenderer.invoke('project:saveFile', json, name),
  openProjectFile: (p) => ipcRenderer.invoke('project:openFile', p),

  pickExportPath: (name, ext, label) => ipcRenderer.invoke('export:pickPath', name, ext, label),
  exportStart: (job) => ipcRenderer.invoke('export:start', job),
  exportCancel: (jobId) => ipcRenderer.invoke('export:cancel', jobId),
  exportLogPath: () => ipcRenderer.invoke('export:logPath'),
  onExportProgress: on('export:progress'),

  showItem: (p) => ipcRenderer.invoke('shell:showItem', p),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),

  testCapture: (name) => ipcRenderer.invoke('test:capture', name),
  testLog: (msg) => ipcRenderer.invoke('test:log', msg),
  testFs: (op, a, b) => ipcRenderer.invoke('test:fs', op, a, b),
  testGesture: (code) => ipcRenderer.invoke('test:gesture', code),
});
