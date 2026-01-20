# Weebdex Uploader

A web-based tool for uploading and managing manga chapters to Weebdex.
  
## Setup Instructions

### Prerequisites

Before you start, you need to install the following software:

#### 1. Install Node.js

**Windows:**
1. Go to [https://nodejs.org/](https://nodejs.org/)
2. Download the "LTS" (Long Term Support) version
3. Run the installer and follow the installation wizard
4. Accept all default settings
5. Restart your computer after installation

**Mac:**
1. Go to [https://nodejs.org/](https://nodejs.org/)
2. Download the "LTS" (Long Term Support) version
3. Open the downloaded `.pkg` file
4. Follow the installation wizard
5. Accept all default settings

To verify Node.js is installed, open Terminal (Mac) or Command Prompt (Windows) and type:
```sh
node --version
```
You should see a version number like `v20.x.x`

#### 2. Install pnpm

Once Node.js is installed, you need to install pnpm (package manager).

**Windows:**
1. Open Command Prompt as Administrator (search for "cmd" in Start menu, right-click, select "Run as administrator")
2. Run this command:
```sh
npm install -g pnpm
```

**Mac:**
1. Open Terminal
2. Run this command:
```sh
npm install -g pnpm
```

To verify pnpm is installed:
```sh
pnpm --version
```
You should see a version number like `9.x.x`

### Installing the Project

1. **Download the project**
   - If you have the project as a ZIP file, extract it to a folder
   - Or if using git: `git clone <repository-url>`

2. **Open Terminal/Command Prompt in the project folder**
   
   **Windows:**
   - Open File Explorer and navigate to the project folder
   - Click in the address bar at the top, type `cmd`, and press Enter
   
   **Mac:**
   - Open Finder and navigate to the project folder
   - Right-click the folder and select "New Terminal at Folder"

3. **Install dependencies**
   
   Run this command:
   ```sh
   pnpm install
   ```
   
   This will download all the necessary packages. It may take a few minutes.

### Running the Application

To start the development server:

```sh
pnpm run dev
```

The application will be available at `http://localhost:5173/` (the exact URL will be shown in the terminal).

To automatically open the app in your browser:
```sh
pnpm run dev -- --open
```

To stop the server, press `Ctrl+C` in the terminal.

## Running Chrome with CORS Disabled

You will need to disable CORS to be able to use this properly, as there is just a website that interacts with a 3rd party backend.

### Windows

1. **Close all Chrome windows completely** (check Task Manager to make sure no Chrome processes are running)

2. **Open Command Prompt** and run:
   ```sh
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%TEMP%\chrome-dev-session" --disable-web-security --disable-features=IsolateOrigins,site-per-process
   ```

   Note: If Chrome is installed in a different location, try:
   ```sh
   "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --user-data-dir="%TEMP%\chrome-dev-session" --disable-web-security --disable-features=IsolateOrigins,site-per-process
   ```

### Mac

1. **Close all Chrome windows completely**
   - Quit Chrome completely (Cmd+Q)
   - Make sure it's not running in the background

2. **Open Terminal** and run:
   ```sh
   open -na "Google Chrome" --args --user-data-dir="/tmp/chrome-dev-session" --disable-web-security --disable-features=IsolateOrigins,site-per-process
   ```


### What these flags do:
- `--user-data-dir`: Uses a separate Chrome profile so your normal browsing data stays safe
- `--disable-web-security`: Disables CORS checks
- `--disable-features=IsolateOrigins,site-per-process`: Additional flags to ensure CORS is fully disabled

### Verify CORS is disabled
When Chrome starts, you should see a warning banner saying "You are using an unsupported command-line flag". This confirms the flags are active.

## Troubleshooting

**"pnpm: command not found"**
- Make sure you installed pnpm: `npm install -g pnpm`
- Restart your terminal after installation

**"Cannot find module" errors**
- Delete the `node_modules` folder and `pnpm-lock.yaml`
- Run `pnpm install` again

**Port already in use**
- Another application is using port 5173
- Close other development servers or specify a different port: `pnpm run dev -- --port 3000`

**Chrome shortcut doesn't work**
- Verify the Chrome installation path is correct
- On Windows, Chrome might be in `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe` instead
