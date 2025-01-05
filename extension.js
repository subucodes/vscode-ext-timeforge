const vscode = require("vscode");

let timerStatusBarItem;
let timer = null;
let startTime = 0;
let elapsedTime = 0;
let totalTime = 0;
let isPaused = false;
let pauseStartTime = 0;
let timeSpentPaused = 0;
let clickTimeout = null;

const UPDATE_INTERVAL = 100;

function activate(context) {
  initializeStatusBarItem();
  context.subscriptions.push(
    vscode.commands.registerCommand("timeforge.setTimer", setTimer),
    vscode.commands.registerCommand("timeforge.pauseTimer", togglePause),
    vscode.commands.registerCommand("timeforge.stopTimer", stopTimer),
    vscode.commands.registerCommand("timeforge.handleClick", handleClick)
  );
}

function initializeStatusBarItem() {
  timerStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  timerStatusBarItem.text = "$(watch) TimeForge";
  timerStatusBarItem.command = "timeforge.handleClick";
  timerStatusBarItem.show();
}

function handleClick() {
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
    }
  });
}

function updateTimer() {
  if (!isPaused) {
    elapsedTime = (Date.now() - startTime) / 1000 - timeSpentPaused;
    updateProgress(elapsedTime);
    if (elapsedTime >= totalTime - 3) {
      clearInterval(timer);
      timer = null;
      showBlinkingAnimation(elapsedTime);
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
    setTimeout(() => {
      resetUIState();
    }, 1000);
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
}

function disposeStatusBarItem() {
  timerStatusBarItem?.dispose();
}

module.exports = {
  activate,
  deactivate,
};
