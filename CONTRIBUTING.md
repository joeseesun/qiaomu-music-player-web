# Contributing

Thanks for helping improve Qiaomu Music Player Web.

## Development

```bash
npm install --legacy-peer-deps
ADMIN_PASSWORD=replace-with-local-password npm run dev:server
npm run dev
```

Open `http://127.0.0.1:5173`.

## Checks

Before opening a PR, run:

```bash
npm run check
npm run build
```

For the iOS app:

```bash
xcodebuild -project ios/QiaomuMusic/QiaomuMusic.xcodeproj -target QiaomuMusic -configuration Debug -sdk iphonesimulator build
xcodebuild -project ios/QiaomuMusic/QiaomuMusic.xcodeproj -target QiaomuMusic -configuration Debug -sdk iphoneos CODE_SIGNING_ALLOWED=NO build
```

## Privacy

Do not include private uploads, real user libraries, `.env` files, API keys, tokens, or generated Suno job data in PRs.
