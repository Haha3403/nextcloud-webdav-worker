
const express = require('express');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'Proxy running!' });
});

app.all('/proxy/*', async (req, res) => {
    try {
        const targetUrl = req.originalUrl.replace('/proxy/', '');
        const response = await fetch(targetUrl);
        const text = await response.text();
        res.send(text);
    } catch (e) {
        res.status(500).send(`Error: ${e.message}`);
    }
});

app.listen(port, () => console.log(`Proxy listening on port ${port}`));
