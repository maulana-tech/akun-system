const { app, BrowserWindow, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "SIAKUNT - Professional Accounting",
    backgroundColor: '#1e293b' // matches slate-800
  });

  // In development, load from the dev server
  // In production, load from the build folder
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  const isDev = !app.isPackaged;
  let backendDir = path.join(__dirname, 'backend');
  
  if (!isDev) {
    // When packaged, point to the unpacked version
    backendDir = backendDir.replace('app.asar', 'app.asar.unpacked');
  }

  const scriptPath = path.join(backendDir, 'src/app.js');
  const dbPath = path.join(app.getPath('userData'), 'database.db');
  const templateDbPath = path.join(backendDir, 'template.sqlite');

  // Ensure database exists
  if (!fs.existsSync(dbPath)) {
    console.log('Database not found, copying template...');
    try {
      if (fs.existsSync(templateDbPath)) {
        fs.copyFileSync(templateDbPath, dbPath);
        console.log('Template database copied successfully');
      } else {
        console.error('Template database not found at:', templateDbPath);
      }
    } catch (err) {
      console.error('Failed to copy template database:', err);
    }
  }

  console.log(`Starting backend from: ${scriptPath}`);

  backendProcess = utilityProcess.fork(scriptPath, [], {
    cwd: backendDir,
    env: { 
      ...process.env, 
      DATABASE_URL: `file:${dbPath}`,
      PORT: '3000'
    }
  });

  backendProcess.on('spawn', () => {
    console.log('Backend process spawned successfully');
  });

  backendProcess.on('exit', (code) => {
    console.log(`Backend process exited with code: ${code}`);
  });
}

app.on('ready', () => {
  startBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (backendProcess) backendProcess.kill();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('will-quit', () => {
  if (backendProcess) backendProcess.kill();
});
