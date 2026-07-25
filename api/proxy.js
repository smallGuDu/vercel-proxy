// api/proxy.js
const https = require('https');
const http = require('http');

module.exports = async function handler(req, res) {
    // ===== 1. 先设置CORS（最高优先级） =====
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    // ===== 2. 立即处理OPTIONS =====
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // ===== 3. 只允许GET =====
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // ===== 4. 获取目标URL =====
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing ?url= parameter' });
    }
    
    try {
        const urlObj = new URL(targetUrl);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://hongniuzy.net/',
            },
            timeout: 15000,
        };
        
        const response = await new Promise((resolve, reject) => {
            const req = protocol.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                });
            });
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            req.end();
        });
        
        // ===== 5. 再次确保CORS头存在（关键！） =====
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
        
        // 转发内容类型
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        
        res.status(response.statusCode).send(response.body);
        
    } catch (error) {
        console.error('代理错误:', error.message);
        // 错误响应也要加CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(502).json({ 
            error: 'Proxy failed', 
            message: error.message 
        });
    }
};
