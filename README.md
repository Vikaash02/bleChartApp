
***

```markdown
# Medical Sensor BLE Bridge (RumaH Protocol)

**Version:** 1.0.0  
**Framework:** React Native (0.72+)  
**Target OS:** Android (Active), iOS (Pending)

## 📖 Overview

This application acts as a high-performance bridge between a specific Medical BLE Sensor and a mobile interface. It implements the **RumaH Protocol** to handshake with the sensor, configure transmission parameters, and visualize high-frequency (5ms interval) ECG/PPG waveforms in real-time.

The project is structured to prioritize performance, using circular buffers and batched state updates to ensure the UI thread remains responsive while processing incoming high-throughput BLE notifications.

---

## 🛠 Prerequisites

Before starting, ensure your development environment meets the following requirements.

### General
*   **Node.js:** v18.x or newer (LTS recommended).
*   **npm:** v9.x or newer.
*   **Git:** For version control.

### Android Development
*   **Android Studio:** Hedgehog (2023.1.1) or newer.
*   **Android SDK:** Android 13 (API 33) or higher.
*   **Java Development Kit (JDK):** Version 17.
    *   *Note:* It is highly recommended to use the JDK bundled with Android Studio to avoid `JAVA_HOME` path issues.

### iOS Development (For future implementation)
*   **macOS:** Sonoma or newer.
*   **Xcode:** 15.x or newer.
*   **CocoaPods:** v1.12 or newer.

---

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/Vikaash02/bleChartApp.git
cd bleChartApp
```

### 2. Install Dependencies
Install the JavaScript libraries.
```bash
npm install
```

### 3. Environment Configuration (Crucial)

#### A. Configure UUIDs
The application functions will **fail** if the specific sensor UUIDs are not defined. The codebase currently uses placeholders or previously known UUIDs. You must verify these against your specific hardware.

1.  Open `src/api/BleProtocol.js`.
2.  Update the `SENSOR_UUIDS` object:

```javascript
export const SENSOR_UUIDS = {
  SERVICE: "YOUR_TARGET_SERVICE_UUID",      // e.g., 0000180D...
  WRITE_CHAR: "YOUR_WRITE_CHARACTERISTIC",  // UUID for sending Commands (0x08, 0x18, etc.)
  NOTIFY_CHAR: "YOUR_NOTIFY_CHARACTERISTIC" // UUID for receiving Data Packets (0x8E)
};
```

#### B. Android Environment
If you haven't configured your `JAVA_HOME` on Windows:
1.  Open Android Studio.
2.  Go to **Settings > Build, Execution, Deployment > Build Tools > Gradle**.
3.  Copy the path under **"Gradle JDK"**.
4.  Set this path as your system's `JAVA_HOME` environment variable.

---

## 🏃‍♂️ Running the App (Android)

### 1. Start Metro Bundler
This process bundles the JavaScript code. Keep this terminal open.
```bash
npx react-native start
```
*Tip: If you encounter caching issues, run `npx react-native start --reset-cache`.*

### 2. Build and Launch
Open a **new terminal** and run:
```bash
npx react-native run-android
```
This command compiles the native Android code and installs the app on your connected device or emulator.

---

## 🍎 iOS Implementation Guide (Handover Note)

**Status:** The JavaScript logic is cross-platform, but the native iOS project requires configuration. The next developer must perform the following steps to enable iOS support:

### 1. Install Pods
On a Mac, navigate to the iOS folder to install native dependencies:
```bash
cd ios
pod install
cd ..
```

### 2. Configure Permissions (`Info.plist`)
BLE on iOS requires strict permission strings. Open `ios/BleChartApp/Info.plist` (or via Xcode) and add these keys:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>We use Bluetooth to connect to the medical sensor for real-time monitoring.</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>We use Bluetooth to connect to the medical sensor for real-time monitoring.</string>
```

### 3. Build for iOS
Once configured, run:
```bash
npx react-native run-ios
```

---

## 🏗 Project Architecture

The project follows a "Separation of Concerns" pattern to make the code testable and portable.

```text
src/
├── api/             # The Medical Protocol Layer
│   └── BleProtocol.js  # Command definitions, Packet parsing, Endianness handling
├── components/      # UI Components
│   └── SensorChart.js  # Performance-optimized LineChart (downsampled rendering)
├── hooks/           # Business Logic (The "ViewModel")
│   └── useSensorLogic.js # Handles the Connection State Machine (Connect -> Handshake -> Stream)
├── screens/         # View Layer
│   └── DashboardScreen.js # Main UI (Scan List & Chart view)
└── utils/           # Helpers
    └── DataBuffer.js   # Circular buffer logic
```

### Logic Flow
1.  **Handshake:** `useSensorLogic.js` sends `CMD_SYS_SETTING_SET` (0x08) followed by `CMD_SCAN_START` (0x18).
2.  **Buffering:** Incoming packets (every ~5ms) are parsed in `BleProtocol.js` and pushed to a `useRef` buffer to avoid blocking the JS thread.
3.  **Rendering:** A `setInterval` ticks every 25ms to move data from the Buffer to the React State, triggering a Chart update.

---

## 📡 Protocol Reference (RumaH)

*See `src/api/BleProtocol.js` for implementation.*

| Command | Hex | Payload | Description |
| :--- | :--- | :--- | :--- |
| **SYS_SETTING_SET** | `0x08` | Mode (0x32), Freq (200) | Configures sensor to RAW mode. |
| **SCAN_START** | `0x18` | None | Triggers the sensor to start streaming. |
| **UNSOL_DATA** | `0x8E` | [Header, Data...] | Unsolicited data packet containing waveforms. |

**Data Packet Format:**
*   **Endianness:** Big Endian (MSB First).
*   **Structure:** 2 sets of (PPG IR [16-bit], PPG Red [16-bit], ECG [16-bit]).

---

## ❓ Troubleshooting

### `JAVA_HOME` is set to an invalid directory
Your computer doesn't know where Java is. Point your `JAVA_HOME` environment variable to the `jbr` folder inside your Android Studio installation.

### `npm error code ECOMPROMISED`
Your npm cache is corrupted. Run:
```bash
npm cache clean --force
npm install
```

### App installs but closes immediately
This is a native crash. Run the log command to see why:
```bash
npx react-native log-android
```
*Common cause: Missing permissions in AndroidManifest.xml (already fixed in this repo) or missing runtime permissions (User denied Bluetooth).*

### Chart is blank after connection
1.  Check the Metro terminal logs.
2.  Verify `SENSOR_UUIDS` in `BleProtocol.js` match the device.
3.  Verify the sensor is actually sending data (use nRF Connect app to debug).
```
