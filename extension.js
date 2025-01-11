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
let statsPanel = null;  // Global variable to store the webview panel

const UPDATE_INTERVAL = 100;
const TIME_BUFFER = 3;

function activate(context) {
  initializeDatabase(context);
  initializeStatusBarItem();
  context.subscriptions.push(
    vscode.commands.registerCommand("timeforge.setTimer", setTimer),
    vscode.commands.registerCommand("timeforge.pauseTimer", togglePause),
    vscode.commands.registerCommand("timeforge.stopTimer", stopTimer),
    vscode.commands.registerCommand("timeforge.handleClick", handleClick),
    vscode.commands.registerCommand("timeforge.stats", () => showStats(context))
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
  timerStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0
  );
  timerStatusBarItem.text = "$(watch) TimeForge";
  timerStatusBarItem.command = "timeforge.handleClick";
  timerStatusBarItem.show();
}

function handleClick() {
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

  vscode.window
    .showInputBox({ prompt: "Enter timer duration in minutes" })
    .then((value) => {
      const duration = parseFloat(value);
      if (duration && !isNaN(duration)) {
        totalTime = duration * 60;
        startTime = Date.now();
        isPaused = false;
        elapsedTime = 0;
        timeSpentPaused = 0;
        timerStatusBarItem.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.prominentBackground"
        );
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
  const startTimeStr = new Date(startTime)
    .toISOString()
    .split("T")[1]
    .split(".")[0];
  const day = new Date().toISOString().split("T")[0];
  const workspaceId = getWorkspaceId();

  db.run(
    `INSERT INTO time_records (day, start_time, workspace_id) VALUES (?, ?, ?)`,
    [day, startTimeStr, workspaceId],
    function (err) {
      if (err) {
        console.error("Error inserting start time", err);
      } else {
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
      recordEndTime(elapsedTime + TIME_BUFFER);
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
    timerStatusBarItem.text = `$(watch) TimeForge: ${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }
}

function showBlinkingAnimation(preciseElapsedTime) {
  let blinkCount = 0;
  const blinkInterval = 100;
  const totalBlinks = 6;
  const totalSteps = totalBlinks * (500 / blinkInterval);
  const startBlinkTime = Date.now();

  const blinkTimer = setInterval(() => {
    const currentElapsed =
      preciseElapsedTime + (Date.now() - startBlinkTime) / 1000;
    const remainingTime = Math.max(0, totalTime - currentElapsed);
    const minutes = Math.floor(remainingTime / 60);
    const seconds = Math.floor(remainingTime % 60);
    timerStatusBarItem.text = `$(watch) TimeForge: ${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;

    if (Math.floor(blinkCount / (500 / blinkInterval)) % 2 === 0) {
      timerStatusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
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
  timerStatusBarItem.backgroundColor = new vscode.ThemeColor(
    "statusBarItem.errorBackground"
  );
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
    timerStatusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.prominentBackground"
    );
  } else {
    pauseStartTime = Date.now();
    timerStatusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  }
  isPaused = !isPaused;
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);

    if (isPaused) {
      timeSpentPaused += (Date.now() - pauseStartTime) / 1000;
    }

    elapsedTime = (Date.now() - startTime) / 1000 - timeSpentPaused;
    recordEndTime(elapsedTime);
    setTimeout(() => {
      resetUIState();
    }, 1000);
  }
}

function recordEndTime(elapsedTime) {
  const secondsElapsed = Math.floor(elapsedTime);

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
  } else {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days > 1 ? "s" : ""}`;
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

async function showStats(context) {
  // Check if the panel already exists and is open
  if (statsPanel) {
    statsPanel.dispose();  // Close the existing panel
  }

  const workspaceId = getWorkspaceId();
  const totalTimeSpent = await getTotalTimeSpent(workspaceId);
  const formattedTime = formatTime(totalTimeSpent);

  // Fetch heatmap data
  const heatmapData = await generateHeatmapData(workspaceId);
  console.log(heatmapData);

  const htmlContent = generateHTML(heatmapData, formattedTime);
  statsPanel = vscode.window.createWebviewPanel(
    "timeforgeStats",
    "TimeForge Stats",
    vscode.ViewColumn.One,
    {
      enableScripts: true, // allow running scripts in webview
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, "media")),
      ], // resource path for the extension (optional)
    }
  );
  statsPanel.webview.html = htmlContent;
}

async function generateHeatmapData() {
  const currentYear = new Date().getFullYear().toString();
  console.log("Current year:", currentYear); // Log the current year

  return new Promise((resolve, reject) => {
    db.all(
      `SELECT day, SUM(seconds_elapsed) AS total_time 
       FROM time_records 
       WHERE strftime('%Y', day) = ? 
       GROUP BY day 
       ORDER BY day DESC`,
      [currentYear],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          console.log("Rows:", rows); // Log the result of the query

          // Map the rows to heatmapData objects that include both the day and the heatmap value
          const heatmapData = rows.map((row) => {
            const totalTime = row.total_time || 0;
            let heatmapValue;

            if (totalTime > 7 * 3600) heatmapValue = 4; // 7 hours
            else if (totalTime > 5 * 3600) heatmapValue = 3; // 5 hours
            else if (totalTime > 3 * 3600) heatmapValue = 2; // 3 hours
            else if (totalTime > 1 * 3600) heatmapValue = 1; // 1 hour
            else heatmapValue = 0; // Less than 1 hour

            return {
              day: row.day, // Include the actual day
              value: heatmapValue, // Include the heatmap level
            };
          });

          console.log("Heatmap data:", heatmapData); // Log the heatmap data
          resolve(heatmapData);
        }
      }
    );
  });
}

function generateHTML(heatmapData, formattedTime) {
  // Get the current year
  const currentYear = new Date().getFullYear();

  // Get the number of days in the current year
  const isLeapYear =
    currentYear % 4 === 0 &&
    (currentYear % 100 !== 0 || currentYear % 400 === 0);
  const totalDaysInYear = isLeapYear ? 366 : 365;

  // Initialize the full year heatmap with level-0 (default value for no data)
  const fullYearHeatmapData = Array(totalDaysInYear).fill(0); // Default all days to level-0 (no data)

  // Map heatmap data to the correct days
  heatmapData.forEach((data) => {
    const dayOfYear = Math.floor(
      (new Date(data.day) - new Date(`${currentYear}-01-01`)) /
        (1000 * 60 * 60 * 24)
    );
    fullYearHeatmapData[dayOfYear] = data.value || 0; // Use data value for that day
  });

  // Generate the grid items (HTML divs) with correct level classes
  const gridItems = fullYearHeatmapData
    .map((value, index) => {
      const level = Math.min(value, 4); // Limit value to 4 to match levels 0-4

      // Calculate the current date for the tooltip
      const currentDate = new Date(`${currentYear}-01-01`);
      currentDate.setDate(currentDate.getDate() + index);
      const formattedDate = currentDate.toISOString().slice(0, 10); // Date in YYYY-MM-DD format

      return `
      <div class="day level-${level}" data-value="${value}" data-date="${formattedDate}"></div>
    `;
    })
    .join(""); // Join the items into a single string

  // Return the complete HTML structure
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Timeforge 📈</title>
      <style>
        body {
          font-family: 'Arial', sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #f9f9f9;
          color: #333;
        }

        #heatmap {
          display: grid;
          grid-template-columns: repeat(53, 14px);  /* 53 weeks */
          gap: 2px;
          margin: auto;
          justify-content: center;
          padding: 20px;
          border-radius: 10px;
          box-shadow: -1px 1px 6px rgba(40, 40, 40, 0.09);
          min-width: 850px;
          max-width: 1000px;
        }

        .day {
          width: 12px;
          height: 12px;
          background-color: #ebedf0; /* Default background */
          border-radius: 2px;
          transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease; /* Smooth animation */
        }

        .day:hover {
          transform: scale(1.5); /* Slightly enlarge the element */
          border-radius: 4px; /* Slightly rounder corners */
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.1); /* Subtle shadow effect */
        }

        .level-0 { background-color: #ebedf0; }
        .level-1 { background-color: #c6e48b; }
        .level-2 { background-color: #7bc96f; }
        .level-3 { background-color: #239a3b; }
        .level-4 { background-color: #196127; }


        #legend {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          margin-top: 16px;
          padding-top: 8px;
        }

        #legend .day {
          width: 12px;
          height: 12px;
        }

        .tooltip-card {
          background-color: #ffffff; /* White background */
          border-radius: 10px; /* Rounded corners */
          box-shadow: 0px 4px 6px rgba(40, 40, 40, 0.09); /* Subtle shadow */
          padding: 10px; /* Inner padding */
          font-size: 14px; /* Adjust font size */
          color: #333; /* Text color */
          text-align: left;
          line-height: 1.4;
          width: max-content; /* Card size adjusts to content */
        }

        .tooltip {
          position: absolute; /* Position relative to the event target */
          display: none; /* Initially hidden */
          z-index: 10; /* Ensure it appears on top */
          pointer-events: none; /* Prevent tooltip interference */
        }


        @media (max-width: 600px) {
          #heatmap {
            grid-template-columns: repeat(53, 10px);
            gap: 1px;
          }

          .day {
            width: 8px;
            height: 8px;
          }
        }
      </style>
    </head>
    <body>
      <h3>Workspace Statistics 🚀</h3>
      <h4>You have invested 🪴${formattedTime} so far !</h4>
      <div id="heatmap">
        ${gridItems}
      </div>
      <div id="legend">
        Less
        <span class="day level-0"></span>
        <span class="day level-1"></span>
        <span class="day level-2"></span>
        <span class="day level-3"></span>
        <span class="day level-4"></span>
        More
      </div>
      <div class="tooltip" id="tooltip"></div>

      <script>
        const heatmap = document.getElementById("heatmap");
        const tooltip = document.getElementById("tooltip");

        // Tooltip event listeners
        heatmap.addEventListener("mouseover", (event) => {
          if (event.target.classList.contains("day")) {
            const value = event.target.getAttribute("data-value");
            const date = event.target.getAttribute("data-date");

            // Style and update the tooltip content
            tooltip.style.display = "block";
            tooltip.innerHTML = 
              '<div class="tooltip-card">' +
                '<div><strong>Date:</strong> ' + date + '</div>' +
                '<div><strong>Hours:</strong> ' + value + '</div>' +
              '</div>';

          }
        });


        heatmap.addEventListener("mousemove", (event) => {
          tooltip.style.top = (event.pageY + 10) + "px";
          tooltip.style.left = (event.pageX + 10) + "px";
        });

        heatmap.addEventListener("mouseout", () => {
          tooltip.style.display = "none";
        });
      </script>
    </body>
    </html>
  `;
}

module.exports = {
  activate,
  deactivate,
};
