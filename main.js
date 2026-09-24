const { app, BrowserWindow, ipcMain, Tray, Menu, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 600,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: false, // Let user manage it, alwaysOnTop can be annoying but maybe configurable
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');
}

let tray = null;

app.whenReady().then(() => {
  createWindow();
  
  autoUpdater.checkForUpdatesAndNotify();
  
  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'A new version of London Live Departures has been downloaded. Would you like to restart the app and install it now?',
      buttons: ['Restart and Install', 'Later']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });
  
  // Create the tray icon
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Show/Hide Widget', 
      click: () => {
        if (mainWindow.isVisible()) mainWindow.hide();
        else mainWindow.show();
      } 
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } }
  ]);
  
  tray.setToolTip('London Live Departures');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('close-widget', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('check-updates', () => {
  autoUpdater.checkForUpdates().then((updateCheckResult) => {
    if (!updateCheckResult || !updateCheckResult.updateInfo) {
      dialog.showMessageBox({ type: 'info', title: 'Up to Date', message: 'You are currently on the latest version!' });
    }
  }).catch(err => {
    dialog.showErrorBox('Update Error', 'Failed to check for updates:\n' + err.toString());
  });
});
