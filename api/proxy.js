// 文件: api/proxy.js
const https = require('https');
const http = require('http');
const zlib = require('zlib');

function parseQuery(queryString) {
    const params = new URLSearchParams(queryString);
    const result = {};
    for (const [key, value] of params) {
        result[key] = value;
    }
    return result;
}

function fetchWithNode(url, headers) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: headers,
            timeout: 15000,
        };

        const protocol = urlObj.protocol === 'https:' ? https : http;
        const req = protocol.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const encoding = res.headers['content-encoding'];
                let bodyBuffer = buffer;
                
                try {
                    if (encoding === 'gzip') {
                        bodyBuffer = zlib.gunzipSync(buffer);
                    } else if (encoding === 'deflate') {
                        bodyBuffer = zlib.inflateSync(buffer);
                    } else if (encoding === 'br') {
                        bodyBuffer = zlib.brotliDecompressSync(buffer);
                    }
                } catch (err) {
                    // 解压失败时保留原始 buffer
                }

                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: bodyBuffer.toString('utf8')
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
        req.end();
    });
}

module.exports = async function handler(req, res) {
    // 增强的 CORS 设置
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    // 处理预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url: targetUrl } = req.query;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing ?url= parameter' });
    }

    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://hongniuzy.net/',
            'Cache-Control': 'no-cache',
        };

        const response = await fetchWithNode(targetUrl, headers);
        
        // 转发原始内容类型
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        
        res.status(response.statusCode).send(response.body);
        
    } catch (error) {
        console.error('代理请求失败:', error.message);
        res.status(502).json({ error: 'Proxy request failed', message: error.message });
    }
};
