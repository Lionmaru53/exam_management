#!/usr/bin/env node
/**
 * exam-management admin screen driver
 *
 * Prerequisites:
 *   - Google login session saved in .playwright-mcp/user-data/ (run via Playwright MCP first)
 *   - System Chrome at C:\Program Files\Google\Chrome\Application\chrome.exe
 *
 * Usage:
 *   node .claude/skills/run-exam-management/driver.mjs [command]
 *
 * Commands:
 *   screenshot          Capture admin top page (default)
 *   screenshot <tab>    Capture a specific tab: patterns|exams|students|import|branches|master
 *   check               Verify admin screen loads and show tab list
 */

import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = resolve(ROOT, '.playwright-mcp/user-data');
const EXEC_URL = 'https://script.google.com/macros/s/AKfycbwQdmCh2CmSg0zFX5d_mCH9tR5Da4LkFIWbjDdMDHhdizNIVMm3srbG-88u2mQRyP4q0Q/exec';
const OUTPUT_DIR = resolve(ROOT, '.playwright-mcp');

const VALID_TABS = ['patterns', 'exams', 'students', 'import', 'files', 'adminUsers', 'branches', 'masterData'];

async function main() {
  const [,, cmd = 'screenshot', arg] = process.argv;

  if (!existsSync(USER_DATA_DIR)) {
    console.error('ERROR: User data dir not found:', USER_DATA_DIR);
    console.error('Run the Playwright MCP first and log in to Google.');
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();

  try {
    await page.goto(`${EXEC_URL}?page=admin`, { waitUntil: 'networkidle', timeout: 30000 });

    const title = await page.title();
    if (!title.includes('管理者用') && !title.includes('成績管理')) {
      console.error('ERROR: Unexpected page title:', title);
      console.error('Session may have expired. Re-login via Playwright MCP.');
      await browser.close();
      process.exit(1);
    }

    // GAS コンテンツは 3 重 iframe 構造: main > googleusercontent > #userHtmlFrame (/blank URL)
    // #admin-nav button が存在するフレームをポーリングで探す
    let gasFrame;
    for (let i = 0; i < 15; i++) {
      for (const frame of page.frames()) {
        const count = await frame.$$eval('#admin-nav button', els => els.length).catch(() => 0);
        if (count > 0) { gasFrame = frame; break; }
      }
      if (gasFrame) break;
      await page.waitForTimeout(1000);
    }
    if (!gasFrame) {
      console.error('ERROR: admin-nav not found in any frame after 15s');
      await browser.close();
      process.exit(1);
    }

    if (cmd === 'check') {
      const tabs = await gasFrame.$$eval('#admin-nav button[data-section]', els =>
        els.map(el => `${el.dataset.section}: ${el.textContent.trim()}`)
      );
      console.log('Admin screen loaded successfully');
      console.log('Title:', title);
      console.log('Tabs:', tabs);

    } else if (cmd === 'screenshot') {
      if (arg) {
        const tabBtn = gasFrame.locator(`#admin-nav button[data-section="${arg}"]`);
        if (await tabBtn.count() > 0) {
          await tabBtn.click();
          await page.waitForTimeout(1500);
        } else {
          console.warn(`Tab "${arg}" not found. Valid tabs: ${VALID_TABS.join(', ')}`);
        }
      }

      const filename = arg ? `admin-${arg}.png` : 'admin-top.png';
      const outPath = resolve(OUTPUT_DIR, filename);
      await page.screenshot({ path: outPath, fullPage: true });
      console.log('Screenshot saved:', outPath);

    } else {
      console.error('Unknown command:', cmd);
      console.error('Usage: node driver.mjs [screenshot [tab]|check]');
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
