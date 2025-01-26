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
let statsPanel = null; // Global variable to store the webview panel

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
  console.log("workspace", workspaceFolders ? workspaceFolders[0] : 'none')
  return workspaceFolders ? workspaceFolders[0].name : "Void";
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
          message: `You've spent ${formattedTime} in this workspace so far.`,
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

  // Delay the execution of postMessage by 3 seconds
  setTimeout(() => {
    if (statsPanel && statsPanel.webview && !statsPanel.webview.isDisposed) {
      // Use an async function inside the setTimeout to handle await
      (async () => {
        try {
          // Call function to get data from SQLite using await
          const dataToSend = await fetchDataForThisDate(
            new Date().toISOString().split("T")[0]
          );
          const totalSpentTime = await getTotalTimeSpent(getWorkspaceId());
          const formattedTime = formatTime(totalSpentTime);
          statsPanel.webview.postMessage({
            command: "sendData",
            data: dataToSend,
            currentDate: new Date().toISOString().split("T")[0],
            timeSpent: formattedTime,
          });
        } catch (error) {
          console.error("Error fetching data:", error);
        }
      })(); // Immediately invoke the async function
    }
  }, 3000); // 3000 milliseconds = 3 seconds to match the end of the timer
}

function getTotalTimeSpent(workspaceId, year = null) {
  year = year === null ? new Date().getFullYear().toString() : year;
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT SUM(seconds_elapsed) AS total_time FROM time_records WHERE workspace_id = ? and strftime('%Y', day) = ?`,
      [workspaceId, year],
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

function getYearsBoundary() {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(MIN(strftime('%Y', day)), strftime('%Y', 'now')) AS min_year, COALESCE(MAX(strftime('%Y', day)), strftime('%Y', 'now')) AS max_year FROM time_records`,
      (err, row) => {
        if (err) {
          console.error(
            "Error fetching the year boundary from time_records:",
            err
          );
          return reject(err);
        }
        resolve({
          min_year: row?.min_year || null,
          max_year: row?.max_year || null,
        });
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
    statsPanel.dispose(); // Close the existing panel
  }

  const workspaceId = getWorkspaceId();
  const totalTimeSpent = await getTotalTimeSpent(workspaceId);
  const formattedTime = formatTime(totalTimeSpent);

  // Fetch heatmap data
  const heatmapData = await generateHeatmapData();
  const yearBoundary = await getYearsBoundary();

  statsPanel = vscode.window.createWebviewPanel(
    "timeforgeStats",
    "TimeForge 📈",
    vscode.ViewColumn.One,
    {
      enableScripts: true, // allow running scripts in webview
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, "assets")),
      ], // resource path for the extension (optional)
    }
  );
  const iconPath = vscode.Uri.file(
    path.join(context.extensionPath, "assets", "whiteWatch.png")
  );
  statsPanel.iconPath = iconPath;
  statsPanel.webview.html = generateHTML(
    yearBoundary,
    heatmapData,
    formattedTime,
    statsPanel,
    context
  );

  async function prepareHeatMapForRequestedYear(currentYear) {
    let heatmapDataForcurrentYear = await generateHeatmapData(currentYear); // Call function to get data from SQLite
    // Get the number of days in the current year
    const isLeapYear =
      currentYear % 4 === 0 &&
      (currentYear % 100 !== 0 || currentYear % 400 === 0);
    const totalDaysInYear = isLeapYear ? 366 : 365;

    // Initialize the full year heatmap with level-0 (default value for no data)
    const fullYearHeatmapData = Array(totalDaysInYear).fill(0); // Default all days to level-0 (no data)

    // Map heatmap data to the correct days
    heatmapDataForcurrentYear.forEach((data) => {
      const dayOfYear = Math.floor(
        (new Date(data.day) - new Date(`${currentYear}-01-01`)) /
          (1000 * 60 * 60 * 24)
      );
      fullYearHeatmapData[dayOfYear] = data.value || 0; // Use data value for that day
    });

    // Generate the grid items (HTML divs) with correct level classes
    const currentYearGridItems = fullYearHeatmapData
      .map((value, index) => {
        const level = Math.min(value, 4); // Limit value to 4 to match levels 0-4

        // Calculate the current date for the tooltip
        const currentDate = new Date(`${currentYear}-01-01`);
        currentDate.setDate(currentDate.getDate() + index);
        const formattedDate = currentDate.toISOString().slice(0, 10); // Date in YYYY-MM-DD format

        // Inject filler divs to set the day inicator and the week offset if the date starts not from sunday (first of week)
        if (index === 0) {
          const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
          let dayIndicators = "";
          for (const day of daysOfWeek) {
            dayIndicators += `<div style="padding-right: 10px; font-size: 12px;">${day}</div>`;
          }

          const dayInNumber = currentDate.getDay();
          let fillerDivs = "";
          if (dayInNumber > 0) {
            for (let i = 0; i < dayInNumber; i++) {
              fillerDivs += `<div style="opacity: 0; pointer-events: none;"></div>`;
            }
          }
          return `
            ${dayIndicators}
            ${fillerDivs}
            <div class="day level-${level}" data-value="${value}" data-date="${formattedDate}"></div>
          `;
        }
        return `
        <div class="day level-${level}" data-value="${value}" data-date="${formattedDate}"></div>
      `;
      })
      .join(""); // Join the items into a single string

    return currentYearGridItems;
  }

  statsPanel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case "requestData":
          const clickedDate = message.date;
          try {
            let dataToSend = await fetchDataForThisDate(clickedDate); // Call function to get data from SQLite
            statsPanel.webview.postMessage({
              command: "sendData",
              data: dataToSend,
            });
          } catch (error) {
            console.error("Error fetching data:", error);
            statsPanel.webview.postMessage({
              command: "sendData",
              data: "Error fetching data.",
            });
          }
          return;
        case "repaintHeatmapWithCurrentYear":
          const requestedYear = message.year;
          try {
            const currentYearGridItems = await prepareHeatMapForRequestedYear(
              requestedYear
            );
            const totalTimeSpent = await getTotalTimeSpent(
              getWorkspaceId(),
              message.year
            );
            const formattedTime = formatTime(totalTimeSpent);
            statsPanel.webview.postMessage({
              command: "dataToRepaintHeatmapWithCurrentYear",
              data: currentYearGridItems,
              timeSpent: formattedTime,
            });
          } catch (error) {
            console.error("Error fetching data:", error);
            statsPanel.webview.postMessage({
              command: "sendData",
              data: "Error fetching data.",
            });
          }
          return;
      }
    },
    undefined,
    context.subscriptions
  );
}

async function fetchDataForThisDate(inputDate) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
          workspace_id,
          CASE 
              WHEN SUM(seconds_elapsed) < 60 THEN 
                  printf('%d secs', SUM(seconds_elapsed)) 
              WHEN SUM(seconds_elapsed) >= 60 AND SUM(seconds_elapsed) < 3600 THEN 
                  printf('%d mins', SUM(seconds_elapsed) / 60) 
              ELSE 
                  printf('%d hrs', SUM(seconds_elapsed) / 3600)
          END AS total_time
      FROM time_records
      WHERE day = ?
      GROUP BY workspace_id
      ORDER BY workspace_id;`,
      [inputDate],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

async function generateHeatmapData(currentYear = null) {
  if (currentYear === null) {
    currentYear = new Date().getFullYear().toString();
  }

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

          resolve(heatmapData);
        }
      }
    );
  });
}

function generateHTML(
  yearBoundary,
  heatmapData,
  formattedTime,
  statsPanel,
  context
) {
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

      // Inject filler divs to set the day inicator and the week offset if the date starts not from sunday (first of week)
      if (index === 0) {
        const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
        let dayIndicators = "";
        for (const day of daysOfWeek) {
          dayIndicators += `<div style="padding-right: 10px; font-size: 12px;">${day}</div>`;
        }

        const dayInNumber = currentDate.getDay();
        let fillerDivs = "";
        if (dayInNumber > 0) {
          for (let i = 0; i < dayInNumber; i++) {
            fillerDivs += `<div style="opacity: 0; pointer-events: none;"></div>`;
          }
        }
        return `
          ${dayIndicators}
          ${fillerDivs}
          <div class="day level-${level}" data-value="${value}" data-date="${formattedDate}"></div>
        `;
      }
      return `
      <div class="day level-${level}" data-value="${value}" data-date="${formattedDate}"></div>
    `;
    })
    .join(""); // Join the items into a single string

  // Get paths to the CSS and JS files
  const cssUri = statsPanel.webview.asWebviewUri(
    vscode.Uri.file(
      path.join(context.extensionPath, "assets", "tabulator.min.css")
    )
  );
  const jsUri = statsPanel.webview.asWebviewUri(
    vscode.Uri.file(
      path.join(context.extensionPath, "assets", "tabulator.min.js")
    )
  );
  const assistantFont = statsPanel.webview.asWebviewUri(
    vscode.Uri.file(
      path.join(context.extensionPath, "assets", "Assistant-Regular.ttf")
    )
  );

  // Return the complete HTML structure
  return `
    <!DOCTYPE html>
    <html lang="en">

    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Timeforge 📈</title>
        <link rel="stylesheet" href="${cssUri}"> <!-- Link to Tabulator CSS -->
        <style>
            @font-face {
                font-family: 'Assistant';
                src: url('${assistantFont}') format('truetype');
                font-weight: normal;
                font-style: normal;
            }

            body {
                font-family: 'Assistant', sans-serif;
                margin: 0;
                padding: 20px;
                background-color: #f9f9f9;
                color: #333;
            }

            .flex-center {
                display: flex;
                justify-content: center;
            }

            #years-container {
                display: flex;
                flex-direction: row;
                justify-content: center;
                gap: 10px;
                align-items: center;
            }

            #years-container button {
                cursor: pointer;
                border: none;
                background-color: transparent;
                padding: 3px 6px;
                transition: background-color 0.1s ease-in-out;
                box-sizing: border-box;
                border-radius: 4px;
                font-weight: 400;
            }

            #years-container button:hover {
                background-color: #80808029;
            }


            #months {
                display: flex;
                position: relative;
                flex-direction: row;
                justify-content: center;
                align-items: center;
                gap: 44px;
                transform: translateY(30px);
            }


            #heatmap {
                position: relative;
                display: grid;
                /* 7 rows (one row per day of the week) */
                grid-template-rows: repeat(7, 14px);
                grid-auto-flow: column;
                gap: 2px;
                margin: auto;
                justify-content: center;
                padding-top: 40px;
                padding-bottom: 40px;
                border-radius: 10px;
                box-shadow: 0px 0px 20px 5px rgba(40, 40, 40, 0.09);
                min-width: 850px;
                max-width: 890px;
            }

            .day {
                width: 12px;
                height: 12px;
                background-color: #ebedf0;
                border-radius: 2px;
                transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
            }

            .day:hover {
                transform: scale(1.4);
                border-radius: 4px;
                box-shadow: 0px 0px 7px 0px rgba(0, 0, 0, 0.2), 0px 0px 7px 4px rgba(0, 0, 0, 0.1);
                
            }

            .day.active {
                transform: scale(1.4);
                border-radius: 4px;
                box-shadow: 0px 0px 7px 0px rgba(0, 0, 0, 0.2), 0px 0px 7px 4px rgba(0, 0, 0, 0.1);
            }

            .level-0 {
                background-color: rgb(211 212 213 / 52%);
            }

            .level-1 {
                background-color: #c6e48b;
            }

            .level-2 {
                background-color: #7bc96f;
            }

            .level-3 {
                background-color: #239a3b;
            }

            .level-4 {
                background-color: #196127;
            }


            #legend {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                transform: translateY(-30px);
            }

            #legend .day {
                width: 12px;
                height: 12px;
            }

            .tooltip-card {
                background-color: #ffffff;
                border-radius: 10px;
                box-shadow: 0px 4px 6px rgba(40, 40, 40, 0.09);
                padding: 10px;
                font-size: 14px;
                color: #333;
                text-align: left;
                line-height: 1.4;
                width: max-content;
            }

            .tooltip {
                position: absolute;
                display: none;
                z-index: 10;
                pointer-events: none;
            }

            #workspace-tbl-container {
                display: flex;
                flex-direction: row;
                flex-wrap: nowrap;
                align-content: center;
                justify-content: center;
                align-items: center;
                gap: 50px;
            }

            .tabulator {
                background-color: #fff;
                border: 1px solid #fff;
                box-shadow: 0px 0px 20px 5px rgba(40, 40, 40, 0.09);
                box-sizing: border-box;
                border-radius: 10px;
            }

            .tabulator-row.tabulator-row-even {
                background-color: #fff;
            }

            .tabulator .tabulator-header .tabulator-col {
                background-color: #fff;
                border-right: 1px solid #fff
            }

            .tabulator .tabulator-header .tabulator-header-contents .tabulator-headers {
                background: #fff;
            }

            .tabulator-row.tabulator-selectable:hover {
              background-color: #bbbbbb21;
              cursor: pointer;
            }

            .tabulator .tabulator-header .tabulator-col.tabulator-sortable.tabulator-col-sorter-element:hover {
                background-color: #bbbbbb21;
                cursor: pointer;
            }

            .tabulator-row .tabulator-cell {
                border-right: 1px solid #fff;
                padding-left: 10px;
                padding-top: 4px;
                padding-bottom: 4px;
            }

            .tabulator .tabulator-header {
                border-bottom: 1px solid #00000008;
            }

            .tabulator .tabulator-header .tabulator-col .tabulator-col-content {
                padding-top: 5px;
                padding-left: 10px;
            }

            .tabulator-row .tabulator-cell.tabulator-frozen.tabulator-frozen-left {
                border-right: none;
            }

            .tabulator .tabulator-header .tabulator-frozen.tabulator-frozen-left {
                border-right: none;
            }

            .tabulator .tabulator-footer {
                background-color: #ffffff;
                border-top: 1px solid #9999996b;
            }

            .tabulator .tabulator-footer .tabulator-page {
                border: 1px solid #ffffff;
                color: #333;
            }

            .tabulator .tabulator-footer .tabulator-page.active {
                border: 2px solid #7bc96f4d;
                color: #333;
                font-weight: bold;
            }

            /* Dark mode theme toggle */
            body.dark-mode {
                background-color: #1e1e1e;
                color: rgb(243, 238, 238);
                transition: background-color 0.3s ease;
            }

            .dark-mode #heatmap {
                background-color: #252526;
                box-shadow: 0px 4px 15px rgba(0, 0, 0, 0.3);
                border: 1px solid #3c3c3c;
            }

            .dark-mode .level-0 {
                background-color:rgb(247 247 247 / 45%);
            }

            .dark-mode .tabulator {
                background-color: #252526;
                color:rgb(243, 238, 238);
                border: 1px solid #3c3c3c;
            }

            .dark-mode .tabulator-header {
                background-color: #2d2d2d;
                border-bottom: 2px solid #3c3c3c;
            }

            .dark-mode .tabulator-header .tabulator-col {
                background-color: #2d2d2d;
                color: rgb(243, 238, 238);
                border-right: 1px solid #2d2d2d;
            }

            .dark-mode .tabulator-row {
                background-color: #252526;
            }

            .dark-mode .tabulator-row:hover {
                background-color:rgb(8 8 8 / 86%);
                cursor: pointer;
            }

            .dark-mode .tabulator .tabulator-header .tabulator-header-contents .tabulator-headers {
                background: #252526;
            }

            .dark-mode .tabulator-header .tabulator-col.tabulator-sortable.tabulator-col-sorter-element:hover {
                background-color: rgb(59 56 56 / 24%);
                cursor: pointer;
            }

            .dark-mode .tabulator-cell {
                color:rgb(243, 238, 238);
                border-right: 1px solid #2d2d2d;
            }

            .dark-mode .tabulator-footer {
                background-color: #2d2d2d;
                border-top: 2px solid #3c3c3c;
            }

            .dark-mode .tabulator-footer-contents{
                color:rgb(243, 238, 238);
            }
                
            .dark-mode .tabulator .tabulator-footer .tabulator-page {
              color:rgb(243, 238, 238);
              border: 1px solid #2d2d2d;
              background-color: #2d2d2d;
            }

            .dark-mode .tabulator .tabulator-footer .tabulator-page.active {
                border: 2px solid #7bc96f4d;
                color:rgb(243, 238, 238);
                font-weight: bold;
            }

            .dark-mode .tooltip-card {
                background-color: #252526;
                color: rgb(243, 238, 238);
                border: 1px solid #3c3c3c;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            }


            /* Theme Switcher Enhancements */
            .theme-switcher {
                position: absolute;
                top: 20px;
                right: 20px;
                cursor: pointer;
                z-index: 1000;
            }

            #theme-toggle {
                display: none;
            }

            .light-icon,
            .dark-icon {
                width: 24px;
                height: 24px;
                transition: opacity 0.3s ease, transform 0.3s ease;
            }

            .dark-icon {
                display: none;
                opacity: 0;
            }

            .light-icon {
                display: block;
                opacity: 1;
            }

            .dark-mode .dark-icon {
                display: block;
                opacity: 1;
            }

            .dark-mode .light-icon {
                display: none;
                opacity: 0;
            }

            .theme-switcher:hover svg {
                transform: scale(1.1);
            }

            .theme-switcher:active svg {
                transform: scale(0.95);
            }

            /* Year Navigation */
            .dark-mode #years-container button {
                color: rgb(243, 238, 238);
                border-radius: 3px;
                padding: 2px 8px;
                transition: all 0.2s ease;
            }

            .dark-mode #years-container button:disabled {
                color: #3c3c3c;
            }

            .dark-mode #years-container button:hover {
                background: rgb(247 249 247 / 16%);
                transform: scale(1.05);
            }

            /* Text Hierarchy */
            .dark-mode #months {
                z-index: 3;
            }
            .dark-mode #months span {
                color: rgb(243, 238, 238);
            }

            .dark-mode #legend {
                color: rgb(243, 238, 238);
            }

            .dark-mode h3, .dark-mode h4 {
                color: rgb(243, 238, 238);
            }

            .dark-mode .day:hover {
                transform: scale(1.4);
                border-radius: 4px;
                box-shadow: 0px 0px 7px 0px rgb(12 12 12 / 91%), 0px 0px 7px 4px rgb(8 8 8 / 48%);
            }

            .dark-mode .day.active {
                transform: scale(1.4);
                border-radius: 4px;
                box-shadow: 0px 0px 7px 0px rgb(12 12 12 / 91%), 0px 0px 7px 4px rgb(8 8 8 / 48%);
            }

            /* Smooth Transitions */
            .day, .tabulator, .theme-switcher, #years-container button {
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }

            /* Scrollbar Styling */
            .dark-mode ::-webkit-scrollbar {
                width: 8px;
            }

            .dark-mode ::-webkit-scrollbar-thumb {
                background-color: #3c3c3c;
                border-radius: 4px;
            }

            .dark-mode ::-webkit-scrollbar-track {
                background: #252526;
            }


            @media (max-width: 900px) {
                #months, #years-container,#heatmap,#legend   {
                    display: none;
                }
            }
                
            @media (max-width: 500px) {
                #workspace-tbl-container   {
                    display: none;
                }
            }

        </style>
    </head>

    <body>
      <div class="theme-switcher">
          <input type="checkbox" id="theme-toggle" />
          <label for="theme-toggle">
              <svg viewBox="0 0 24 24" width="24" height="24" class="light-icon">
                  <path fill="currentColor" d="M12,9c1.65,0,3,1.35,3,3s-1.35,3-3,3s-3-1.35-3-3S10.35,9,12,9 M12,7c-2.76,0-5,2.24-5,5s2.24,5,5,5s5-2.24,5-5 S14.76,7,12,7L12,7z M2,13l2,0c0.55,0,1-0.45,1-1s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S1.45,13,2,13z M20,13l2,0c0.55,0,1-0.45,1-1 s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S19.45,13,20,13z M11,2v2c0,0.55,0.45,1,1,1s1-0.45,1-1V2c0-0.55-0.45-1-1-1S11,1.45,11,2z M11,20v2c0,0.55,0.45,1,1,1s1-0.45,1-1v-2c0-0.55-0.45-1-1-1C11.45,19,11,19.45,11,20z M5.99,4.58c-0.39-0.39-1.03-0.39-1.41,0 c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0s0.39-1.03,0-1.41L5.99,4.58z M18.36,16.95 c-0.39-0.39-1.03-0.39-1.41,0c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0c0.39-0.39,0.39-1.03,0-1.41 L18.36,16.95z M19.42,5.99c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06c-0.39,0.39-0.39,1.03,0,1.41 s1.03,0.39,1.41,0L19.42,5.99z M7.05,18.36c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06 c-0.39,0.39-0.39,1.03,0,1.41s1.03,0.39,1.41,0L7.05,18.36z"></path>
              </svg>
              <svg viewBox="0 0 24 24" width="24" height="24" class="dark-icon">
                  <path fill="currentColor" d="M9.37,5.51C9.19,6.15,9.1,6.82,9.1,7.5c0,4.08,3.32,7.4,7.4,7.4c0.68,0,1.35-0.09,1.99-0.27C17.45,17.19,14.93,19,12,19 c-3.86,0-7-3.14-7-7C5,9.07,6.81,6.55,9.37,5.51z M12,3c-4.97,0-9,4.03-9,9s4.03,9,9,9s9-4.03,9-9c0-0.46-0.04-0.92-0.1-1.36 c-0.98,1.37-2.58,2.26-4.4,2.26c-2.98,0-5.4-2.42-5.4-5.4c0-1.81,0.89-3.42,2.26-4.4C12.92,3.04,12.46,3,12,3L12,3z"></path>
              </svg>
          </label>
      </div>
      </div>
        <h3 class="flex-center">Workspace Statistics 🚀</h3>
        <h4 id="ws-timespent-summary" class="flex-center">You have spent ${formattedTime} so far in this workspace !</h4>

        <div id="years-container">
            <button id="reduce-year">&lt;</button>
            <h4 id="active-year">${currentYear}</h4>
            <button id="increase-year">&gt;</button>
        </div>

        <div id="months">
            <span>Jan</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Apr</span>
            <span>May</span>
            <span>Jun</span>
            <span>Jul</span>
            <span>Aug</span>
            <span>Sep</span>
            <span>Oct</span>
            <span>Nov</span>
            <span>Dec</span>
        </div>
        <div id="heatmap">
            ${gridItems}
        </div>
        <div id="legend">
            less
            <span class="day level-0"></span>
            <span class="day level-1"></span>
            <span class="day level-2"></span>
            <span class="day level-3"></span>
            <span class="day level-4"></span>
            more
        </div>
        <div class="tooltip" id="tooltip"></div>

        <h4 class="flex-center time-spent-on"></h4>

        <div id="workspace-tbl-container">
            <div id="workspace-timspent-table"></div>
        </div>


        <script src="${jsUri}"></script> <!-- Link to Tabulator JS -->

        <script>

            const vscode = acquireVsCodeApi();

            function highlightSelectedDayInHeatmap(dayToHighlight = None) {
                const currentActiveDay = document.querySelector(".day.active");
                if (currentActiveDay) {
                    currentActiveDay.classList.remove("active");
                }
                const dayToHighlightInHeatmap = document.querySelector('[data-date="' + dayToHighlight + '"]');
                if (dayToHighlightInHeatmap) {
                    dayToHighlightInHeatmap.classList.add("active");
                }

            }

            function paintTableWithData(tableData) {
                let table = new Tabulator("#workspace-timspent-table", {
                    data: tableData, 
                    layout: "fitColumns", 
                    height:330,
                    autoResize:false, 
                    addRowPos: "top",          
                    pagination: "local",       
                    paginationSize: 10,         
                    paginationCounter: "rows",    
                    initialSort: [             
                        { column: "workspace_id", dir: "asc" },
                    ],
                    columns: [
                        { title: "Workspace", field: "workspace_id", width:350, resizable:false, frozen:true},
                        { title: "Spent", field: "total_time", width: 80, resizable:false, frozen:true},
                    ],
                });

                table.on("tableBuilt", function () {
                    document.querySelector('.tabulator-page[aria-label="First Page"]').textContent = '<';
                    document.querySelector('.tabulator-page[aria-label="Next Page"]').textContent = '>';
                    document.querySelector('.tabulator-page[aria-label="Prev Page"]').textContent = '<<';
                    document.querySelector('.tabulator-page[aria-label="Last Page"]').textContent = '>>';
                });
            }

            function attachEventListenersForHeatMap() {
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



                const daysInYear = document.querySelectorAll("#heatmap .day");
                daysInYear.forEach((node) => {
                    node.addEventListener('click', () => {
                        highlightSelectedDayInHeatmap(node.dataset.date)
                        const daySpentOnHeading = document.querySelector(".time-spent-on");
                        daySpentOnHeading.textContent = "Time spent on : " + node.dataset.date;
                        vscode.postMessage({ command: 'requestData', date: node.dataset.date });
                    });
                });

                // load timespent on workspace table for today's date by default
                const daySpentOnHeading = document.querySelector(".time-spent-on");
                let todayDate = new Date().toISOString().split('T')[0];

                // paintTableWithData
                const activeYear = document.getElementById("active-year").textContent;
                if (todayDate.includes(activeYear.toString())) {
                } else {
                    todayDate = activeYear + '-01-01'
                }

                highlightSelectedDayInHeatmap(todayDate)
                daySpentOnHeading.textContent = "Time spent on : " + todayDate;
                vscode.postMessage({ command: 'requestData', date: todayDate });
            }


            function initYearChangeEventListeners() {
                // getting the interpolation and JSON.stringify is needed
                const yearBoundary = ${JSON.stringify(yearBoundary)}
                const currentYear = ${currentYear}


                const reduceYearBtn = document.getElementById("reduce-year");
                const increaseYearBtn = document.getElementById("increase-year");

                // disable the increase and decrease year buttons based on the year boundary when page is loaded
                if (Number(currentYear) <= Number(yearBoundary.min_year)) {
                    reduceYearBtn.disabled = true;
                }
                if (Number(currentYear) >= Number(yearBoundary.max_year)) {
                    increaseYearBtn.disabled = true;
                }

                function repaintHeatmapWithCurrentYearsData(currentYear) {
                    vscode.postMessage({ command: 'repaintHeatmapWithCurrentYear', year: currentYear });
                }


                // event listeners for the years buttons
                reduceYearBtn.addEventListener("click", (event) => {
                    const activeYear = document.getElementById("active-year");
                    if (Number(activeYear.textContent) <= Number(yearBoundary.min_year)) {
                        event.target.disabled = true;
                    } else {
                        activeYear.textContent = Number(activeYear.textContent) - 1;
                        repaintHeatmapWithCurrentYearsData(activeYear.textContent)
                        // for minus 
                        if (Number(activeYear.textContent) <= Number(yearBoundary.min_year)) {
                            event.target.disabled = true;
                        } else {
                            event.target.disabled = false;
                        }
                        // for plus
                        if (Number(activeYear.textContent) >= Number(yearBoundary.max_year)) {
                            increaseYearBtn.disabled = true;
                        } else {
                            increaseYearBtn.disabled = false;
                        }
                    }

                });

                increaseYearBtn.addEventListener("click", (event) => {
                    const activeYear = document.getElementById("active-year");
                    if (Number(activeYear.textContent) >= Number(yearBoundary.max_year)) {
                        event.target.disabled = true;
                    } else {
                        activeYear.textContent = Number(activeYear.textContent) + 1;
                        repaintHeatmapWithCurrentYearsData(activeYear.textContent)
                        // for minus 
                        if (Number(activeYear.textContent) <= Number(yearBoundary.min_year)) {
                            reduceYearBtn.disabled = true;
                        } else {
                            reduceYearBtn.disabled = false;
                        }
                        // for plus
                        if (Number(activeYear.textContent) <= Number(yearBoundary.max_year)) {
                            event.target.disabled = true;
                        } else {
                            event.target.disabled = false;
                        }
                    }
                });
            
            }

            function updateTimeSpentSummary(timeSpent) {
                const timespentSummary = document.querySelector("#ws-timespent-summary");
                timespentSummary.textContent = "You have spent " + timeSpent + " so far in this workspace !"
            }


            function listenForMessagesFromVSCode() {
                window.addEventListener('message', event => {
                    const message = event.data; // The JSON data sent from the extension
                    if (message.command === 'sendData') {
                        // this scenario is when the message is sent when the timer is ended from extension
                        if (message?.currentDate) {
                            if (document.querySelector(".day.active").dataset.date == message?.currentDate) {
                                paintTableWithData(message.data);
                            }
                            if (message?.timeSpent && document.getElementById("active-year").textContent == new Date().getFullYear().toString()) {
                                updateTimeSpentSummary(message?.timeSpent)
                            }

                        } else {
                            // when user clicks or extension loads
                            paintTableWithData(message.data);
                        }
                    }
                    if (message.command === 'dataToRepaintHeatmapWithCurrentYear') {
                        document.querySelector("#heatmap").innerHTML = message.data;
                        attachEventListenersForHeatMap();
                        if (message?.timeSpent) {
                            updateTimeSpentSummary(message?.timeSpent)
                        }
                    }
                });

            }

            function initDarkLightThemeToggle(){
              const themeToggle = document.getElementById('theme-toggle');
              const body = document.body;

              // Initialize theme
              const savedTheme = localStorage.getItem('theme');
              const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              
              if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
                  body.classList.add('dark-mode');
                  themeToggle.checked = true;
              }

              themeToggle.addEventListener('change', () => {
                  body.classList.toggle('dark-mode');
                  localStorage.setItem('theme', themeToggle.checked ? 'dark' : 'light');
              });
            }

            function expectoDOMLoadum() {
                attachEventListenersForHeatMap();
                initYearChangeEventListeners();
                listenForMessagesFromVSCode();
                initDarkLightThemeToggle();
            }

            // Magic spell that waits for the DOM to load and then applies the magic
            document.addEventListener("DOMContentLoaded", expectoDOMLoadum);

            
        </script>
    </body>
    </html>
  `;
}

module.exports = {
  activate,
  deactivate,
};
