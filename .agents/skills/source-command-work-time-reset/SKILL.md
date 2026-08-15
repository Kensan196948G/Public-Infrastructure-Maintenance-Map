---
name: "source-command-work-time-reset"
description: "現セッションの最大作業時間をデフォルト 300 分に戻す"
---

# source-command-work-time-reset

Use this skill when the user asks to run the migrated source command `work-time-reset`.

## Command Template

# /work-time-reset — 作業時間リセット

デフォルト 300 分に戻す。内部的には `/work-time-set 300` と等価。

Windows 版では現在の session JSON を PowerShell で更新する。

```powershell
/work-time-set 300
```

実行後、Mission Control または `Show-SessionInfoTab.ps1` で残り時間を確認する。
