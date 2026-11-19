# armazi-hud for Claude Code

A Claude Code port of [Caqtus/armazi-hud](https://github.com/Caqtus/armazi-hud), originally a HUD for the DeepSeek Harness web GUI.

A live, read-only strip in the band above the prompt. It shows each activity type as a colored dot with its count (think, bash, read, edit, skill, grep, search, agent, todo, mcp). The running activity lights green while the others dim. A compaction chip shows the count, a live timer while compacting, and the final duration for a few seconds afterwards. Press **details** to unfold the latest reasoning/text preview, the model, tok/s, context use, turn time, subagent count, cost, and per-tool bars with time spent and the most recent action.

It changes nothing about the model: no prompts, no tools, no extra model calls.

## Install

This plugin lives on the `claude/armazi-hud` branch of `RezoGvelesiani/crystal-clean`. At the prompt of a Claude Code session, add the branch as a marketplace, then install:

```
/plugin marketplace add https://github.com/RezoGvelesiani/crystal-clean.git#claude/armazi-hud
/plugin install armazi-hud@armazi-hud
```

If the repository is private, your own computer needs GitHub access to it (for example `gh auth login`).
