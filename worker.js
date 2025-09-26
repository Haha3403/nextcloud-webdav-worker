const ALLOWED_ORIGINS = [
    'http://localhost',
    'http://127.0.0.1',
    'https://haha3403.github.io'
];

const ALLOWED_METHODS = 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, MOVE, MKCOL';
const ALLOWED_HEADERS = 'Content-Type, Authorization, X-Nextcloud-Server, X-Nextcloud-User, X-Nextcloud-Pass, X-Nextcloud-Path, X-Destination';

/**
 * Hàm hỗ trợ xử lý Headers CORS.
 * @param {string | null} origin - Giá trị Origin từ yêu cầu.
 * @returns {Headers} Các Headers CORS.
 */
function getCorsHeaders(origin) {
    const allowOrigin = ALLOWED_ORIGINS.some(allowed => origin && origin.startsWith(allowed)) ? origin : null;

    const headers = new Headers();
    if (allowOrigin) {
        headers.set('Access-Control-Allow-Origin', allowOrigin);
    }
    headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
    headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    headers.set('Access-Control-Max-Age', '86400'); // Cache preflight requests
    return headers;
}

/**
 * Xử lý yêu cầu OPTIONS (Preflight).
 * @param {Request} request
 * @param {Headers} corsHeaders
 * @returns {Response}
 */
function handleOptions(request, corsHeaders) {
    if (
        request.headers.get('Origin') &&
        request.headers.get('Access-Control-Request-Method') &&
        request.headers.get('Access-Control-Request-Headers')
    ) {
        return new Response(null, { status: 204, headers: corsHeaders });
    }
    return new Response(null, {
      headers: { 'Allow': ALLOWED_METHODS },
    });
}


export default {
    async fetch(request) {
        const origin = request.headers.get('Origin');
        const corsHeaders = getCorsHeaders(origin);
        
        // 1. Xử lý OPTIONS (Preflight)
        if (request.method === 'OPTIONS') {
            return handleOptions(request, corsHeaders);
        }

        // 2. Kiểm tra Origin
        const isAllowedOrigin = corsHeaders.has('Access-Control-Allow-Origin');
        if (!isAllowedOrigin) {
            return new Response(JSON.stringify({ error: `Origin '${origin}' is not allowed.` }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // 3. Lấy thông tin Nextcloud
        const ncServer = request.headers.get('X-Nextcloud-Server');
        const ncUser = request.headers.get('X-Nextcloud-User');
        const ncPass = request.headers.get('X-Nextcloud-Pass');
        const ncPath = request.headers.get('X-Nextcloud-Path');

        if (!ncServer || !ncUser || !ncPass || !ncPath) {
            return new Response(JSON.stringify({ error: 'Missing required Nextcloud headers (Server, User, Pass, or Path).' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...Object.fromEntries(corsHeaders) },
            });
        }

        // 4. Xây dựng Yêu cầu WebDAV
        const webdavUrl = `https://${ncServer}/remote.php/dav/files/${ncUser}/${ncPath}`;
        const authString = btoa(`${ncUser}:${ncPass}`);

        const requestHeaders = new Headers(request.headers);
        
        // Cài đặt Headers Chính thức và dọn dẹp headers tùy chỉnh
        requestHeaders.set('Authorization', `Basic ${authString}`);
        requestHeaders.delete('X-Nextcloud-Server');
        requestHeaders.delete('X-Nextcloud-User');
        requestHeaders.delete('X-Nextcloud-Pass');
        requestHeaders.delete('X-Nextcloud-Path');
        requestHeaders.delete('Origin'); 
        
        // Xử lý header MOVE
        if (request.method === 'MOVE') {
            const destination = request.headers.get('X-Destination');
            if (destination) {
                const fullDestination = `https://${ncServer}/remote.php/dav/files/${ncUser}/${destination}`;
                requestHeaders.set('Destination', fullDestination);
            }
            requestHeaders.delete('X-Destination'); 
        }

        try {
            // 5. Gửi yêu cầu đến Nextcloud
            const response = await fetch(webdavUrl, {
                method: request.method,
                headers: requestHeaders,
                body: request.body,
            });

            // 6. Xây dựng Phản hồi và đính kèm Headers CORS
            const proxiedResponse = new Response(response.body, response);
            
            for (const [key, value] of corsHeaders.entries()) {
                proxiedResponse.headers.set(key, value);
            }
            
            return proxiedResponse;

        } catch (error) {
            return new Response(JSON.stringify({ error: 'Failed to connect to the Nextcloud server.', details: error.message }), {
                status: 502,
                headers: { 'Content-Type': 'application/json', ...Object.fromEntries(corsHeaders) },
            });
        }
    },
};
