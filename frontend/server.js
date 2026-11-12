const express = require('express');
const path = require('path');
const app = express();
app.use(express.static(__dirname));
app.get(/^\/(?!api).*/, (_q, r) => r.sendFile(path.join(__dirname, 'index.html')));
app.listen(5500, () => console.log('WEB → http://localhost:5500'));