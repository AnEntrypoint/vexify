#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findModule(moduleName) {
  const searchPaths = [
    path.join(__dirname, '..', 'node_modules', moduleName),
    path.join(__dirname, '..', '..', moduleName),
    path.join(__dirname, '..', '..', '..', moduleName)
  ];

  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      return searchPath;
    }
  }
  return null;
}

function buildBetterSqlite3() {
  const betterSqlite3Path = findModule('better-sqlite3');

  if (!betterSqlite3Path) {
    return;
  }

  const buildPaths = [
    path.join(betterSqlite3Path, 'build', 'Release', 'better_sqlite3.node'),
    path.join(betterSqlite3Path, 'lib', 'binding', `node-v${process.versions.modules}-${process.platform}-${process.arch}`, 'better_sqlite3.node')
  ];

  const needsBuild = !buildPaths.some(p => fs.existsSync(p));

  if (needsBuild) {
    console.error('vexify: Building better-sqlite3 for Node.js v' + process.version + '...');
    try {
      execSync('npm run build-release', {
        cwd: betterSqlite3Path,
        stdio: 'pipe'
      });
      console.error('vexify: better-sqlite3 built successfully');
    } catch (error) {
      console.warn('vexify: Warning - Failed to auto-build better-sqlite3.');
    }
  }
}

function installSqliteVec() {
  const platformPackages = {
    'win32-x64': 'sqlite-vec-windows-x64',
    'darwin-x64': 'sqlite-vec-darwin-x64',
    'darwin-arm64': 'sqlite-vec-darwin-arm64',
    'linux-x64': 'sqlite-vec-linux-x64'
  };

  const platformKey = `${process.platform}-${process.arch}`;
  const packageName = platformPackages[platformKey];

  if (!packageName) {
    return;
  }

  const modulePath = findModule(packageName);
  if (modulePath) {
    return;
  }

  console.error(`vexify: Installing ${packageName}...`);
  try {
    const nodeModulesPath = path.join(__dirname, '..', '..');
    execSync(`npm install ${packageName}@^0.1.7-alpha.2 --no-save --legacy-peer-deps`, {
      cwd: nodeModulesPath,
      stdio: 'pipe'
    });
    console.error(`vexify: ${packageName} installed successfully`);
  } catch (error) {
    console.warn(`vexify: Warning - Failed to install ${packageName}.`);
  }
}

buildBetterSqlite3();
installSqliteVec();
