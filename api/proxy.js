// api/proxy.js
const https = require('https');
const http = require('http');
const zlib = require('zlib');  // 🔥 添加这个
const iconv = require('iconv-lite');  // 🔥 需要安装

module.exports = async function handler(req, res) {
    // ===== CORS设置 =====
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    // ===== 处理OPTIONS =====
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
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
                'Accept-Encoding': 'gzip, deflate, br',  // 接受压缩
                'Referer': 'https://hongniuzy.net/',
            },
            timeout: 15000,
        };
        
        const response = await new Promise((resolve, reject) => {
            const req = protocol.request(options, (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(chunks)  // 🔥 返回Buffer而不是字符串
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
        
        // ===== 🔥 关键：解压和编码转换 =====
        let bodyBuffer = response.body;
        const encoding = response.headers['content-encoding'];
        
        // 1. 解压
        try {
            if (encoding === 'gzip') {
                bodyBuffer = zlib.gunzipSync(bodyBuffer);
            } else if (encoding === 'deflate') {
                bodyBuffer = zlib.inflateSync(bodyBuffer);
            } else if (encoding === 'br') {
                bodyBuffer = zlib.brotliDecompressSync(bodyBuffer);
            }
        } catch (err) {
            console.error('解压失败:', err.message);
        }
        
        // 2. 检测编码并转换
        let html = bodyBuffer.toString('utf8');
        
        // 如果UTF-8解码后还有乱码，尝试GBK
        if (html.includes('�') || html.includes('��')) {
            try {
                // 需要安装: npm install iconv-lite
                html = iconv.decode(bodyBuffer, 'gbk');
            } catch (err) {
                // 如果没有iconv-lite，尝试gb2312
                try {
                    html = iconv.decode(bodyBuffer, 'gb2312');
                } catch (e) {
                    console.error('编码转换失败:', e.message);
                }
            }
        }
        
        // 3. 设置正确的Content-Type
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', origin);
        
        console.log(`✅ 请求成功，长度: ${html.length}`);
        res.status(response.statusCode).send(html);
        
    } catch (error) {
        console.error('❌ 代理错误:', error.message);
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.status(502).json({ 
            error: 'Proxy failed', 
            message: error.message 
        });
    }
};
