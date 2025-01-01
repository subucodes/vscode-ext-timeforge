const vscode = require("vscode");

// Status bar items
let timerStatusBarItem;
let controlStatusBarItem;
let stopStatusBarItem;

// Timer variables
let timer = null;
let startTime = 0;
let elapsedTime = 0;
let totalTime = 0;
let isPaused = false;
let pauseStartTime = 0; // Store the time when the pause occurs
let timeSpentPaused = 0; // Total time spent during pause

const UPDATE_INTERVAL = 100; // Update interval for smooth updates (100ms)

function activate(context) {
  // Create status bar items
  initializeStatusBarItems();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("timeforge.setTimer", setTimer),
    vscode.commands.registerCommand("timeforge.pauseTimer", togglePause),
    vscode.commands.registerCommand("timeforge.stopTimer", stopTimer)
  );
}

function initializeStatusBarItems() {
  timerStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    2
  );
  controlStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    1
  );
  stopStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0
  );

  timerStatusBarItem.text = "TimeForge";
  controlStatusBarItem.text = "$(debug-start)";
  stopStatusBarItem.text = "$(debug-stop)";

  controlStatusBarItem.command = "timeforge.setTimer";
  stopStatusBarItem.command = "timeforge.stopTimer";

  timerStatusBarItem.show();
  controlStatusBarItem.show();
  stopStatusBarItem.hide();
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
        totalTime = duration * 60; // Total time in seconds
        startTime = Date.now();
        isPaused = false;
        elapsedTime = 0;
        timeSpentPaused = 0; // Reset time spent paused

        // Update control status bar for pause functionality
        controlStatusBarItem.text = "$(debug-pause)";
        controlStatusBarItem.command = "timeforge.pauseTimer";
        stopStatusBarItem.show();

        // Start the timer with smooth updates
        timer = setInterval(updateTimer, UPDATE_INTERVAL);
      }
    });
}

function updateTimer() {
  if (!isPaused) {
    elapsedTime = (Date.now() - startTime) / 1000 - timeSpentPaused;
    updateProgress(elapsedTime);

    // Stop timer when elapsed time reaches total time
    if (elapsedTime >= totalTime - 3) {
      // Start blinking 3 seconds before end
      if (!isPaused && timer !== null) {
        clearInterval(timer);
        timer = null;
        showBlinkingAnimation(elapsedTime);
      }
    }
  }
}

function updateProgress(preciseElapsedTime) {
  const remainingTime = totalTime - preciseElapsedTime; // Remaining time

  if (remainingTime <= 0) {
    // Timer finished
    timerStatusBarItem.text = `TimeForge: 00:00`;
    timeIsUp().then(() => resetUIState());
  } else {
    // Update timer display in MM:SS format
    const minutes = Math.floor(remainingTime / 60);
    const seconds = Math.floor(remainingTime % 60);
    timerStatusBarItem.text = `TimeForge: ${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }
}

function showBlinkingAnimation(preciseElapsedTime) {
  let blinkCount = 0;
  const blinkInterval = 100; // Smaller interval for smoother transitions (in ms)
  const totalBlinks = 6; // Total number of blinks (3 seconds at 500ms intervals)
  const totalSteps = totalBlinks * (500 / blinkInterval); // Total steps for smooth animation

  const startBlinkTime = Date.now();

  const blinkTimer = setInterval(() => {
    const currentElapsed =
      preciseElapsedTime + (Date.now() - startBlinkTime) / 1000;
    const remainingTime = Math.max(0, totalTime - currentElapsed);

    // Update timer display
    const minutes = Math.floor(remainingTime / 60);
    const seconds = Math.floor(remainingTime % 60);
    timerStatusBarItem.text = `TimeForge: ${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;

    // Alternate background color for blinking effect
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

function timeIsUp() {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Time is up! Well done!",
      cancellable: false,
    },
    async (progress) => {
      for (let i = 0; i <= 100; i++) {
        progress.report({ increment: 1 });
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    }
  );
}

function togglePause() {
  if (isPaused) {
    // Calculate the time spent during pause and add it to the total time
    timeSpentPaused += (Date.now() - pauseStartTime) / 1000;
    controlStatusBarItem.text = "$(debug-pause)";
  } else {
    // Save the current time when the timer is paused
    pauseStartTime = Date.now();
    controlStatusBarItem.text = "$(debug-start)";
  }

  isPaused = !isPaused;
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    resetUIState();
  }
}

function resetUIState() {
  timer = null;
  isPaused = false;
  elapsedTime = 0;
  timeSpentPaused = 0; // Reset paused time
  timerStatusBarItem.text = "TimeForge";
  controlStatusBarItem.text = "$(debug-start)";
  controlStatusBarItem.command = "timeforge.setTimer";
  stopStatusBarItem.hide();
}

function deactivate() {
  if (timer) {
    clearInterval(timer);
  }
  disposeStatusBarItems();
}

function disposeStatusBarItems() {
  timerStatusBarItem?.dispose();
  controlStatusBarItem?.dispose();
  stopStatusBarItem?.dispose();
}

module.exports = {
  activate,
  deactivate,
};
