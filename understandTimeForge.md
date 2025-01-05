# TimeForge Extension - Developer Guide

## Code Structure

### Main Functions

1. **activate(context)**: Initializes the extension, database, and registers commands.
2. **initializeDatabase(context)**: Sets up the SQLite database for storing time records.
3. **initializeStatusBarItem()**: Creates and configures the status bar item.
4. **handleClick()**: Handles single and double-click interactions on the status bar item.
5. **setTimer()**: Prompts the user to set a timer duration and starts the timer.
6. **recordStartTime()**: Logs the start time of the timer into the database.
7. **updateTimer()**: Updates the timer at regular intervals.
8. **updateProgress(preciseElapsedTime)**: Updates the status bar item with the remaining time.
9. **showBlinkingAnimation(preciseElapsedTime)**: Displays a blinking animation when the timer is about to finish.
10. **showRedBackgroundBeforeStop()**: Changes the background color to red before stopping the timer.
11. **timeIsUp()**: Displays a notification when the timer is up.
12. **togglePause()**: Pauses or resumes the timer.
13. **stopTimer()**: Stops the timer and logs the elapsed time.
14. **recordEndTime(elapsedTime)**: Logs the elapsed time into the database.
15. **resetUIState()**: Resets the timer variables and UI state.
16. **deactivate()**: Cleans up when the extension is deactivated.
17. **disposeStatusBarItem()**: Disposes of the status bar item.

### Flow Diagram

```
User Clicks Status Bar
    ├── Single Click
    │   └── handleClick
    │       ├── No Timer
    │       │   └── setTimer
    │       │       └── recordStartTime
    │       └── Timer Running
    │           └── togglePause
    └── Double Click
        └── handleClick
            └── Timer Running
                └── showRedBackgroundBeforeStop
                    └── stopTimer
                        ├── recordEndTime
                        └── resetUIState
```

```
setTimer
    └── updateTimer
        ├── updateProgress
        │   ├── Time Up
        │   │   └── timeIsUp
        │   │       └── resetUIState
        │   └── showBlinkingAnimation
        │       └── resetUIState
        └── recordEndTime (on timer stop)
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

## Database Schema

The SQLite database stores time records in the following format:

- **Table Name**: `time_records`
  - `id`: INTEGER PRIMARY KEY AUTOINCREMENT
  - `day`: TEXT (YYYY-MM-DD format)
  - `start_time`: TEXT (HH:MM:SS format)
  - `seconds_elapsed`: INTEGER (Total time spent in seconds)

## How to Extend

To add new features or modify existing ones, follow these steps:

1. **Add New Commands**: Register new commands in the `activate` function.
2. **Modify UI**: Update the `initializeStatusBarItem` function to change the status bar item.
3. **Add New Functions**: Implement new functions and call them from existing ones as needed.

## Conclusion

This guide provides an overview of the TimeForge extension's code structure and functionality. Use this as a reference to understand and extend the extension's capabilities.

