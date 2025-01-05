# TimeForge Extension - Developer Guide

## Overview

TimeForge is a Visual Studio Code extension that provides a simple timer functionality. It allows users to set a timer, pause it, and stop it with intuitive single and double-click interactions on the status bar.

## Features

- Set a timer with a specified duration.
- Pause and resume the timer.
- Stop the timer with a double-click.
- Visual feedback with background color changes.
- Blinking animation when the timer is about to finish.
- Notification when the timer is up.

## Code Structure

### Main Functions

1. **activate(context)**: Initializes the extension and registers commands.
2. **initializeStatusBarItem()**: Creates and configures the status bar item.
3. **handleClick()**: Handles single and double-click interactions on the status bar item.
4. **setTimer()**: Prompts the user to set a timer duration and starts the timer.
5. **updateTimer()**: Updates the timer at regular intervals.
6. **updateProgress(preciseElapsedTime)**: Updates the status bar item with the remaining time.
7. **showBlinkingAnimation(preciseElapsedTime)**: Displays a blinking animation when the timer is about to finish.
8. **showRedBackgroundBeforeStop()**: Changes the background color to red before stopping the timer.
9. **timeIsUp()**: Displays a notification when the timer is up.
10. **togglePause()**: Pauses or resumes the timer.
11. **stopTimer()**: Stops the timer and resets the UI state.
12. **resetUIState()**: Resets the timer variables and UI state.
13. **deactivate()**: Cleans up when the extension is deactivated.
14. **disposeStatusBarItem()**: Disposes of the status bar item.

### Flow Diagram

```
User Clicks Status Bar
    ├── Single Click
    │   ├── handleClick
    │       ├── No Timer
    │       │   └── setTimer
    │       └── Timer Running
    │           └── togglePause
    └── Double Click
        ├── handleClick
            └── Timer Running
                └── showRedBackgroundBeforeStop
                    └── stopTimer
                        └── resetUIState
```

```
setTimer
    └── updateTimer
        └── updateProgress
            ├── Time Up
            │   └── timeIsUp
            │       └── resetUIState
            └── showBlinkingAnimation
                └── resetUIState
```

### Background Colors

- **Running**: `statusBarItem.prominentBackground`
- **Paused**: `statusBarItem.warningBackground`
- **Stopping**: `statusBarItem.errorBackground`

## Commands

- `timeforge.setTimer`: Sets and starts the timer.
- `timeforge.pauseTimer`: Pauses or resumes the timer.
- `timeforge.stopTimer`: Stops the timer.
- `timeforge.handleClick`: Handles click interactions on the status bar item.

## How to Extend

To add new features or modify existing ones, follow these steps:

1. **Add New Commands**: Register new commands in the `activate` function.
2. **Modify UI**: Update the `initializeStatusBarItem` function to change the status bar item.
3. **Add New Functions**: Implement new functions and call them from existing ones as needed.

## Conclusion

This guide provides an overview of the TimeForge extension's code structure and functionality. Use this as a reference to understand and extend the extension's capabilities.
