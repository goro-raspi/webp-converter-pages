# WebP Converter (React + Vite + pnpm)

PNG/JPEG をブラウザ内で WebP へ圧縮するツール。

## Features
- PNG/JPEG → WebP
- 品質調整（50-95）
- 長辺リサイズ
- 複数枚変換 + 個別保存
- ZIP 一括ダウンロード
- 画像はローカル処理（サーバー送信なし）

## Dev
```bash
pnpm install
pnpm dev
```

## Build
```bash
pnpm build
```

## Deploy
GitHub Pages は Actions で `dist/` をデプロイ。
