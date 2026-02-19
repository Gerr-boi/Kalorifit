import 'dotenv/config';
import { createApp } from './createApp.js';

const port = Number(process.env.PORT ?? 8787);
const app = createApp();

app.listen(port, () => {
  console.log(`Food detection API listening on http://localhost:${port}`);
});

