# KaloriFit Workspace

This folder contains two different app trees.

- `app/`: the web scanner app with the actual scanner and meal UI
- top-level Expo app: currently still the starter shell

## Run the scanner app

From this folder:

```bash
npm run scanner:stack
```

That starts:

- `food_detection_bot` on `127.0.0.1:8001`
- the local API on `127.0.0.1:8787`
- the Vite web app

If you only want the web app/API without auto-starting the bot:

```bash
npm run scanner:web
```

## Important

`npm start` and `expo start` launch the Expo starter shell, not the scanner UI you have been editing in the nested web app.
