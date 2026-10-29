import { createApp } from './app.js';
const port=Number(process.env.PORT||3000);
const host=process.env.HOST||'127.0.0.1';
createApp().listen(port,host,()=>console.log(`Investment Game: http://${host}:${port}`));
