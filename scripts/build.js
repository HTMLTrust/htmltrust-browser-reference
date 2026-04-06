/**
 * Build script for the Content Signing browser extension
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

// Define browsers to build for
const browsers = ['chromium', 'firefox', 'safari'];

// Get the target browser from command line arguments
const targetBrowser = process.argv[2];

// Validate the target browser
if (targetBrowser && !browsers.includes(targetBrowser)) {
  console.error(`Invalid browser: ${targetBrowser}`);
  console.error(`Valid browsers: ${browsers.join(', ')}`);
  process.exit(1);
}

// Build for the specified browser or all browsers
const browsersToProcess = targetBrowser ? [targetBrowser] : browsers;

/**
 * Build the extension for a specific browser
 * @param {string} browser The browser to build for
 */
function buildExtension(browser) {
  console.log(`Building for ${browser}...`);
  
  try {
    // Run webpack with the browser-specific configuration
    execSync(`cross-env TARGET_BROWSER=${browser} webpack --mode=production`, {
      stdio: 'inherit',
    });
    
    // Create a zip file for the extension
    createZipFile(browser);
    
    console.log(`Successfully built for ${browser}`);
  } catch (error) {
    console.error(`Failed to build for ${browser}:`, error);
    process.exit(1);
  }
}

/**
 * Create a zip file for the extension
 * @param {string} browser The browser to create a zip file for
 */
function createZipFile(browser) {
  const buildDir = path.resolve(__dirname, '..', 'build', browser);
  const zipFile = path.resolve(__dirname, '..', 'build', `content-signing-${browser}.zip`);
  
  // Create a write stream for the zip file
  const output = fs.createWriteStream(zipFile);
  const archive = archiver('zip', {
    zlib: { level: 9 }, // Maximum compression
  });
  
  // Listen for errors
  archive.on('error', (error) => {
    throw error;
  });
  
  // Pipe the archive to the output file
  archive.pipe(output);
  
  // Add the build directory to the archive
  archive.directory(buildDir, false);
  
  // Finalize the archive
  archive.finalize();
  
  console.log(`Created zip file: ${zipFile}`);
}

// Process each browser
browsersToProcess.forEach(buildExtension);