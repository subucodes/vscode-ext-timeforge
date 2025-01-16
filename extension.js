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


  statsPanel = vscode.window.createWebviewPanel(
    "timeforgeStats",
    "TimeForge Stats",
    vscode.ViewColumn.One,
    {
      enableScripts: true, // allow running scripts in webview
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, "assets")),
      ], // resource path for the extension (optional)
    }
  );
  statsPanel.webview.html = generateHTML(heatmapData, formattedTime, statsPanel, context);;

  statsPanel.webview.onDidReceiveMessage(
    async message => {
        switch (message.command) {
            case 'requestData':
                // Execute your command here
                // Extract the date sent from the webview
                const clickedDate = message.date;
                console.log("Received date: " + clickedDate);

                try {
                  let dataToSend = await fetchDataForThisDate(clickedDate); // Call function to get data from SQLite
                  statsPanel.webview.postMessage({ command: 'sendData', data: dataToSend });
                } catch (error) {
                    console.error("Error fetching data:", error);
                    statsPanel.webview.postMessage({ command: 'sendData', data: "Error fetching data." });
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
          console.log("Rows:", rows); // Log the result of the query
          resolve(rows);
        }
      }
    );
  });
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

function generateHTML(heatmapData, formattedTime, statsPanel, context) {
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
      if(index === 0){

        const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
        let dayIndicators = "";
        for (const day of daysOfWeek) {
          dayIndicators += `<div style="padding-right: 10px; font-size: 12px;">${day}</div>`
        }

        const dayInNumber = currentDate.getDay()
        let fillerDivs = "";
        if(dayInNumber > 0){
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
const cssUri = statsPanel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'assets', 'tabulator.min.css')));
const jsUri = statsPanel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'assets', 'tabulator.min.js')));
const chartjsJsUri = statsPanel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'assets', 'chart.umd.min.js')));
const assistantFont = statsPanel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'assets', 'Assistant-Regular.ttf')));

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
                src: url('${assistantFont}') format('truetype'); /* Use the generated URI */
                font-weight: normal;
                font-style: normal;
            }

        body {
          font-family: 'Assistant',sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #f9f9f9;
          color: #333;
        }

        .flex-center{
          display:flex;
          justify-content: center;
        }

        #heatmap::before {
            content: "Jan            Feb            Mar            Apr            May            Jun            Jul            Aug            Sep            Oct            Nov            Dec";
            position: absolute;
            top: 10px;
            left: 145px;
            white-space: pre;
        }

        #heatmap {
          position: relative;
          display: grid;
          grid-template-rows: repeat(7, 14px); /* 7 rows (one row per day of the week) */
          grid-auto-flow: column;
          gap: 2px;
          margin: auto;
          justify-content: center;
          padding-top: 40px;
          padding-bottom: 40px;
          border-radius: 10px;
          /*box-shadow: -1px 1px 6px rgba(40, 40, 40, 0.09);*/
          box-shadow:  0px 0px 20px 5px rgba(40, 40, 40, 0.09);
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
          transform: translateY(-30px);
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

        #table-chart-container{
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          align-content: center;
          justify-content: center;
          align-items: center;
          gap: 50px;
        }

        .tabulator{
        background-color: #fff;
        border: 1px solid #fff;
        box-shadow:  0px 0px 20px 5px rgba(40, 40, 40, 0.09);
        box-sizing : border-box;
        border-radius : 10px;
        }

        .tabulator-row.tabulator-row-even {
       background-color:#fff; 
      }
          .tabulator .tabulator-header .tabulator-col {
        background-color:#fff; 
        border-right:1px solid #fff
          }



          .tabulator-row .tabulator-cell {
          border-right:1px solid #fff;
          padding-left : 10px;
          padding-top : 4px;
          padding-bottom : 4px;
          }

          .tabulator .tabulator-header {
          border-bottom : 1px solid #00000008;
          }

          .tabulator .tabulator-header .tabulator-col .tabulator-col-content {
          padding-top: 5px;
          padding-left: 10px;
          }

          .tabulator .tabulator-footer {
          background-color: #ffffff;
          border-top: 1px solid #9999996b;
          }

          .tabulator .tabulator-footer .tabulator-page {
          border: 1px solid #ffffff;
          color: #333;
          }

          .tabulator .tabulator-footer .tabulator-page.active{
          border: 2px solid #7bc96f4d;
          color: #333;
          font-weight: bold;
          }


        @media (max-width: 1050px) {
          #heatmap {
            display: none;
          }
          #legend{
          display:none;
          
          }

          #table-chart-container{
            flex-direction: column;
          }

        }


        

       
      </style>
    </head>
    <body>
      <h3 class="flex-center">Workspace Statistics 🚀</h3>
      <h4 class="flex-center">You have invested 🪴${formattedTime} so far !</h4>
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

      <h3 class="flex-center">Time spent across the Workspaces</h3>

      <div id="table-chart-container">
      <div style="width: 400px; height: 400px;">
          <canvas id="myPieChart"></canvas>
      </div>
        <div id="workspace-timspent-table"></div>
      </div>


      <script src="${jsUri}"></script> <!-- Link to Tabulator JS -->
      <script src="${chartjsJsUri}"></script> <!-- Link to Chart JS -->
        
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
        const vscode = acquireVsCodeApi();

        const daysInYear = document.querySelectorAll("#heatmap .day");
        daysInYear.forEach((node) => {
          node.addEventListener('click', () => {
            console.log("Element clicked!" + node.dataset.date);
            let result = vscode.postMessage({ command: 'requestData', date: node.dataset.date });
            console.log(result)
          });
        });

        let myPieChart;
        
        window.addEventListener('message', event => {
          const message = event.data; // The JSON data sent from the extension
          if (message.command === 'sendData') {
              console.log("here is the message from the panel" + JSON.stringify(message.data, null, 2) );

              let table = new Tabulator("#workspace-timspent-table", {
              data: message.data, // Load data into the table
              height:"400px",
              layout: "fitColumns", // Auto-resize columns to fit content
              addRowPos:"top",          //when adding a new row, add it to the top of the table
              pagination:"local",       //paginate the data
              paginationSize:10,         //allow 10 rows per page of data
              paginationCounter:"rows", //display count of paginated rows in footer
              movableColumns:true,      //allow column order to be changed
              initialSort:[             //set the initial sort order of the data
                  {column:"workspace_id", dir:"asc"},
              ],
              columns:[
              {title:"Workspace", field:"workspace_id", width:400},
              {title:"Time spent", field:"total_time", width:150},
              ],
              });

              table.on("tableBuilt", function(){
              document.querySelector('.tabulator-page[aria-label="First Page"]').textContent = '<';
              document.querySelector('.tabulator-page[aria-label="Next Page"]').textContent = '>';
              document.querySelector('.tabulator-page[aria-label="Prev Page"]').textContent = '<<';
              document.querySelector('.tabulator-page[aria-label="Last Page"]').textContent = '>>';
              });


              
              const ctx = document.getElementById('myPieChart').getContext('2d');
              // Destroy the existing chart if it exists
              if (myPieChart) {
                  myPieChart.destroy();
              }
              myPieChart = new Chart(ctx, {
                  type: 'pie',
                  data: {
                      labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple'],
                      datasets: [{
                          label: 'Votes',
                          data: [12, 19, 3, 5, 2],
                          backgroundColor: [
                              'rgba(255, 99, 132, 0.2)',
                              'rgba(54, 162, 235, 0.2)',
                              'rgba(255, 206, 86, 0.2)',
                              'rgba(75, 192, 192, 0.2)',
                              'rgba(153, 102, 255, 0.2)'
                          ],
                          borderColor: [
                              'rgba(255, 99, 132, 1)',
                              'rgba(54, 162, 235, 1)',
                              'rgba(255, 206, 86, 1)',
                              'rgba(75, 192, 192, 1)',
                              'rgba(153, 102, 255, 1)'
                          ],
                          borderWidth: 1
                      }]
                  },
                  options: {
                      responsive: true,
                      plugins: {
                          legend: {
                              position: 'top',
                          },
                          tooltip: {
                              callbacks: {
                                  label: function(tooltipItem) {
                                      return tooltipItem.label + ': ' + tooltipItem.raw;
                                  }
                              }
                          }
                      }
                  }
              });

          }
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
