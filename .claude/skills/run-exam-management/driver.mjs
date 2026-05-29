#!/usr/bin/env node
/**
 * exam-management admin screen driver
 *
 * Prerequisites:
 *   - System Chrome at C:\Program Files\Google\Chrome\Application\chrome.exe
 *   - Google login session in .playwright-mcp/user-data/ (create once with `login` command)
 *
 * Usage:
 *   node .claude/skills/run-exam-management/driver.mjs [command]
 *
 * Commands:
 *   login               Open headed Chrome, log in to Google, save session (one-time)
 *   screenshot          Capture admin top page (default)
 *   screenshot <tab>    Capture a specific tab: patterns|exams|students|import|branches|master
 *   screenshot <tab> <outDir>  Save to a custom directory
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
// テスト環境（個人アカウント / HEAD デプロイ）。clasp push 後すぐ反映。Playwright はここのみ使用。
const EXEC_URL = 'https://script.google.com/macros/s/AKfycbyz4MLhrFoP3W7a9FDRk9LP4IiExBVn7xvBHVMZHECr/dev';
const OUTPUT_DIR = resolve(ROOT, '.playwright-mcp');

const VALID_TABS = ['patterns', 'exams', 'students', 'import', 'files', 'adminUsers', 'branches', 'masterData'];

/** 校舎セレクターで最初の校舎を選択し、ローディングが終わるまで待つ */
async function selectFirstBranch(gasFrame, page) {
  const sel = gasFrame.locator('#branch-select');
  if (await sel.count() === 0) return;
  const firstVal = await sel.evaluate(el => {
    const opt = [...el.options].find(o => o.value !== '');
    return opt ? opt.value : '';
  });
  if (!firstVal) return;
  await sel.selectOption(firstVal);
  // ローディングオーバーレイが消えるまで最大10秒待つ
  const overlay = gasFrame.locator('#loading-overlay.active');
  for (let i = 0; i < 20; i++) {
    if (await overlay.count() === 0) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(800);
}

/** Google ログインして管理画面が開くまで待ち、セッションを保存する */
async function runLogin() {
  mkdirSync(USER_DATA_DIR, { recursive: true });

  console.log('ブラウザを起動しています...');
  const browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto(`${EXEC_URL}?page=admin`, { waitUntil: 'networkidle', timeout: 60000 });

  console.log('ブラウザで Google アカウントにログインしてください（最大 3 分待機）...');

  // 管理画面の nav が出るまでポーリング（= ログイン完了の合図）
  let gasFrame;
  for (let i = 0; i < 180; i++) {
    for (const frame of page.frames()) {
      const count = await frame.$$eval('#admin-nav button', els => els.length).catch(() => 0);
      if (count > 0) { gasFrame = frame; break; }
    }
    if (gasFrame) break;
    await page.waitForTimeout(1000);
  }

  if (gasFrame) {
    console.log('ログイン成功！セッションを保存しました:', USER_DATA_DIR);
  } else {
    console.error('タイムアウト: 管理画面が検出できませんでした。');
    console.error('ログイン完了後に再度 login コマンドを実行してください。');
  }

  await browser.close();
}

async function main() {
  const [,, cmd = 'screenshot', arg, outDirArg] = process.argv;

  // login コマンド：セッション作成（user-data-dir が無くてもOK）
  if (cmd === 'login') {
    await runLogin();
    return;
  }

  if (!existsSync(USER_DATA_DIR)) {
    console.error('ERROR: Google セッションが見つかりません:', USER_DATA_DIR);
    console.error('');
    console.error('先に login コマンドでセッションを作成してください:');
    console.error('  node .claude/skills/run-exam-management/driver.mjs login');
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
      console.error('ERROR: セッション期限切れまたはログインが必要です。');
      console.error('再ログイン: node .claude/skills/run-exam-management/driver.mjs login');
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
      // 校舎を自動選択（データ表示のため）
      await selectFirstBranch(gasFrame, page);

      if (arg) {
        const tabBtn = gasFrame.locator(`#admin-nav button[data-section="${arg}"]`);
        if (await tabBtn.count() > 0) {
          await tabBtn.click();
          await page.waitForTimeout(2000);
        } else {
          console.warn(`Tab "${arg}" not found. Valid tabs: ${VALID_TABS.join(', ')}`);
        }
      }

      const baseDir = outDirArg ? resolve(outDirArg) : OUTPUT_DIR;
      mkdirSync(baseDir, { recursive: true });
      const filename = arg ? `admin-${arg}.png` : 'admin-top.png';
      const outPath = resolve(baseDir, filename);
      await page.screenshot({ path: outPath, fullPage: true });
      console.log('Screenshot saved:', outPath);

    } else {
      console.error('Unknown command:', cmd);
      console.error('Usage: node driver.mjs [login|screenshot [tab [outDir]]|check]');
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
