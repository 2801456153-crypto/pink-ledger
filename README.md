# 我的记账 🌸

一款淡粉色暖色调的 Windows 个人记账桌面软件，数据完全保存在本机、不联网。

## 功能

- 📅 记账日历（月历 / 年历），每日收支一目了然
- 📄 月账单 / 年账单（日期、收入、支出、结余）
- 💰 月预算 / 年预算（分类预算 + 总预算），超支红绿提醒
- 🏦 资产管理（资产 / 负债 / 净资产图表与走势）
- 📚 多账本（共享资产池）
- 🔁 周期自动记账（房租、水电等固定费用）
- 🏷 分类自定义（emoji 图标 + 上传图片图标）
- 🖼️ 图片备注（记账时可添加图片）
- 🔍 搜索（分类 / 备注 / 金额）
- 📊 一键导出 Excel

## 技术栈

- Electron
- 原生 HTML / CSS / JavaScript
- Chart.js（图表）
- SheetJS（Excel 导出）

## 本地运行

```bash
npm install
npm start
```

## 打包成安装包

```bash
npm run build
```

> 打包产物在 `dist/` 目录，安装包为 `dist/我的记账 Setup 0.1.0.exe`。

## 说明

- 数据保存在系统用户目录（`%APPDATA%/pink-ledger/`），与代码分离。
- 首次打包时若遇到 winCodeSign 符号链接报错，见 `make-icon.js` 同级的打包说明，需对 app-builder 的 `-snld` 参数做补丁。
