import { createServer } from './app.js';

const port = Number(process.env.PORT ?? 2567);
createServer().listen(port).then(() => console.log(`[museum] server listening on :${port}`));
