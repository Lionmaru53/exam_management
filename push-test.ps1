# テストファイルを含めてテスト用 GAS プロジェクトに push する
# 使い方: ./push-test.ps1
#
# 前提: .clasp.test.json の scriptId にテスト用 GAS プロジェクトの ID を設定済みであること

Set-Location $PSScriptRoot

# src_test/ を再作成（前回の残骸をクリア）
Remove-Item -Recurse -Force src_test -ErrorAction SilentlyContinue
New-Item -ItemType Directory src_test | Out-Null

# src/ の全ファイルをコピー
Copy-Item src\* src_test\

# tests/ の全ファイルをコピー
Copy-Item tests\* src_test\

# テスト用 GAS プロジェクトに push
clasp push --project .clasp.test.json

Write-Host ""
Write-Host "テスト用 GAS に push 完了。"
Write-Host "GAS エディタで以下の手順を実行してください:"
Write-Host "  1. initTestData() を実行"
Write-Host "  2. runAllTests() を実行"
Write-Host "  3. ログで PASS / FAIL を確認"
Write-Host "  4. clearTestData() でテストデータを削除"
