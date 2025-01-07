const vscode = require("vscode");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

let timerStatusBarItem;
let timer = null;
let startTime = 0;
let elapsedTime = 0;
let totalTime = 0;
let isPaused = false;
let pauseStartTime = 0;
let timeSpentPaused = 0;
let clickTimeout = null;
let db;
let lastInsertedId;

const UPDATE_INTERVAL = 100;
const TIME_BUFFER = 3;

function activate(context) {
  initializeDatabase(context);
  initializeStatusBarItem();
  context.subscriptions.push(
    vscode.commands.registerCommand("timeforge.setTimer", setTimer),
    vscode.commands.registerCommand("timeforge.pauseTimer", togglePause),
    vscode.commands.registerCommand("timeforge.stopTimer", stopTimer),
    vscode.commands.registerCommand("timeforge.handleClick", handleClick)
  );
}

function initializeDatabase(context) {
  const dbDir = context.globalStorageUri.fsPath;
  const dbPath = path.join(dbDir, "timeforge.db");

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error("Error opening database", err);
    } else {
      db.run(
        `CREATE TABLE IF NOT EXISTS time_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          day TEXT,
          start_time TEXT,
          seconds_elapsed INTEGER,
          workspace_id TEXT
        )`
      );
    }
  });
}

function initializeStatusBarItem() {
  timerStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  timerStatusBarItem.text = "$(watch) TimeForge";
  timerStatusBarItem.command = "timeforge.handleClick";
  timerStatusBarItem.show();
}

function handleClick() {
  // Prevent double-click action in the last 3 seconds if the timer is running
  if (timer && elapsedTime >= totalTime - TIME_BUFFER) {
    return;
  }

  if (clickTimeout) {
    clearTimeout(clickTimeout);
    clickTimeout = null;
    if (timer) showRedBackgroundBeforeStop();
  } else {
    clickTimeout = setTimeout(() => {
      clickTimeout = null;
      timer ? togglePause() : setTimer();
    }, 300);
  }
}

function setTimer() {
  if (timer) {
    vscode.window.showInformationMessage("Timer is already running.");
    return;
  }

  vscode.window.showInputBox({ prompt: "Enter timer duration in minutes" }).then((value) => {
    const duration = parseFloat(value);
    if (duration && !isNaN(duration)) {
      totalTime = duration * 60;
      startTime = Date.now();
      isPaused = false;
      elapsedTime = 0;
      timeSpentPaused = 0;
      timerStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
      timer = setInterval(updateTimer, UPDATE_INTERVAL);
      recordStartTime();
    }
  });
}

function getWorkspaceId() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  return workspaceFolders ? workspaceFolders[0].uri.fsPath : "unknown";
}

function recordStartTime() {
  const startTimeStr = new Date(startTime).toISOString().split("T")[1].split(".")[0];
  const day = new Date().toISOString().split("T")[0];
  const workspaceId = getWorkspaceId();

  db.run(
    `INSERT INTO time_records (day, start_time, workspace_id) VALUES (?, ?, ?)`,
    [day, startTimeStr, workspaceId],
    function (err) {
      if (err) {
        console.error("Error inserting start time", err);
      } else {
        // Save the last inserted ID for later use
        lastInsertedId = this.lastID;
      }
    }
  );
}

function updateTimer() {
  if (!isPaused) {
    elapsedTime = (Date.now() - startTime) / 1000 - timeSpentPaused;
    updateProgress(elapsedTime);
    if (elapsedTime >= totalTime - TIME_BUFFER) {
      clearInterval(timer);
      timer = null;
      showBlinkingAnimation(elapsedTime);
      recordEndTime(elapsedTime + TIME_BUFFER); // Add buffer to elapsed time
    }
  }
}

function updateProgress(preciseElapsedTime) {
  const remainingTime = totalTime - preciseElapsedTime;
  if (remainingTime <= 0) {
    timerStatusBarItem.text = `$(watch) TimeForge: 00:00`;
    timeIsUp().then(() => {
      resetUIState();
    });
  } else {
    const minutes = Math.floor(remainingTime / 60);
    const seconds = Math.floor(remainingTime % 60);
    timerStatusBarItem.text = `$(watch) TimeForge: ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
}

function showBlinkingAnimation(preciseElapsedTime) {
  let blinkCount = 0;
  const blinkInterval = 100;
  const totalBlinks = 6;
  const totalSteps = totalBlinks * (500 / blinkInterval);
  const startBlinkTime = Date.now();

  const blinkTimer = setInterval(() => {
    const currentElapsed = preciseElapsedTime + (Date.now() - startBlinkTime) / 1000;
    const remainingTime = Math.max(0, totalTime - currentElapsed);
    const minutes = Math.floor(remainingTime / 60);
    const seconds = Math.floor(remainingTime % 60);
    timerStatusBarItem.text = `$(watch) TimeForge: ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    if (Math.floor(blinkCount / (500 / blinkInterval)) % 2 === 0) {
      timerStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else {
      timerStatusBarItem.backgroundColor = undefined;
    }

    blinkCount++;
    if (blinkCount >= totalSteps) {
      clearInterval(blinkTimer);
      timerStatusBarItem.backgroundColor = undefined;
      resetUIState();
      timeIsUp();
    }
  }, blinkInterval);
}

function showRedBackgroundBeforeStop() {
  timerStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
  setTimeout(() => {
    stopTimer();
  }, 1000);
}

async function timeIsUp() {
  const workspaceId = getWorkspaceId();
  const totalTimeSpent = await getTotalTimeSpent(workspaceId);
  const formattedTime = formatTime(totalTimeSpent);

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Timeforge: `,
      cancellable: false,
    },
    async (progress) => {
      for (let i = 0; i <= 120; i++) {
        progress.report({
          increment: 1,
          message: `You've invested ${formattedTime} in this workspace so far.`,
        });
        await new Promise((resolve) => setTimeout(resolve, 30)); // Simulate progress
      }
    }
  );
}



function togglePause() {
  if (isPaused) {
    timeSpentPaused += (Date.now() - pauseStartTime) / 1000;
    timerStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
  } else {
    pauseStartTime = Date.now();
    timerStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }
  isPaused = !isPaused;
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);

    // If the timer is paused and immediately stopped, the pause time should not be counted
    if (isPaused) {
      timeSpentPaused += (Date.now() - pauseStartTime) / 1000;
    }

    console.log(`timeSpentPaused  ${timeSpentPaused}`);
    elapsedTime = ((Date.now() - startTime) / 1000) - timeSpentPaused; // Recalculate elapsed time
    recordEndTime(elapsedTime); // Do not add buffer to elapsed time
    setTimeout(() => {
      resetUIState();
    }, 1000);
  }
}

function recordEndTime(elapsedTime) {
  const secondsElapsed = Math.floor(elapsedTime); // Use the exact elapsed time

  if (!lastInsertedId) {
    console.error("No lastInsertedId available for updating the record.");
    return;
  }

  db.run(
    `UPDATE time_records SET seconds_elapsed = ? WHERE id = ?`,
    [secondsElapsed, lastInsertedId],
    function (err) {
      if (err) {
        console.error("Error updating end time", err);
      }
    }
  );
}

function getTotalTimeSpent(workspaceId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT SUM(seconds_elapsed) AS total_time FROM time_records WHERE workspace_id = ?`,
      [workspaceId],
      (err, row) => {
        if (err) {
          console.error("Error fetching total time spent for workspace:", err);
          return reject(err);
        }
        resolve(row?.total_time || 0);
      }
    );
  });
}

function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds} seconds`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  } else if (seconds < 2592000) {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days > 1 ? "s" : ""}`;
  } else if (seconds < 31536000) {
    const months = Math.floor(seconds / 2592000);
    return `${months} month${months > 1 ? "s" : ""}`;
  } else {
    const years = Math.floor(seconds / 31536000);
    return `${years} year${years > 1 ? "s" : ""}`;
  }
}



function resetUIState() {
  timer = null;
  isPaused = false;
  elapsedTime = 0;
  timeSpentPaused = 0;
  timerStatusBarItem.text = "$(watch) TimeForge";
  timerStatusBarItem.backgroundColor = undefined;
}

function deactivate() {
  if (timer) {
    clearInterval(timer);
  }
  disposeStatusBarItem();
  if (db) {
    db.close((err) => {
      if (err) {
        console.error("Error closing database", err);
      }
    });
  }
}

function disposeStatusBarItem() {
  timerStatusBarItem?.dispose();
}

module.exports = {
  activate,
  deactivate,
};
