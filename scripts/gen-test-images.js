// 生成用于人工验证插件的示例 PNG 图片（纯 Node 实现，无第三方依赖）
// 用法：node scripts/gen-test-images.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
    return out;
}

function makePng(width, height, pixel) {
    const raw = Buffer.alloc((width * 3 + 1) * height);
    let off = 0;
    for (let y = 0; y < height; y++) {
        raw[off++] = 0; // filter: none
        for (let x = 0; x < width; x++) {
            const [r, g, b] = pixel(x, y);
            raw[off++] = r;
            raw[off++] = g;
            raw[off++] = b;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // color type: truecolor RGB
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return Buffer.concat([
        signature,
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

// 双向渐变生成器：横向 r0→r1，纵向 g0→g1，b 随对角线变化
function gradient(r0, g0, b0, r1, g1, b1) {
    return (x, y, w, h) => {
        const fx = w > 1 ? x / (w - 1) : 0;
        const fy = h > 1 ? y / (h - 1) : 0;
        return [
            Math.round(r0 + (r1 - r0) * fx),
            Math.round(g0 + (g1 - g0) * fy),
            Math.round(b0 + (b1 - b0) * (fx + fy) / 2),
        ];
    };
}

const outDir = path.join(__dirname, '..', 'test-images');
fs.mkdirSync(outDir, { recursive: true });

const files = [
    // img_10 / img_20 用于验证自然排序：应排在 img_5 之后而不是 img_2 之前
    ['img_1.png', 240, 160, gradient(30, 60, 200, 200, 230, 60)],
    ['img_2.png', 320, 240, gradient(200, 40, 40, 255, 200, 80)],
    ['img_3.png', 200, 200, gradient(20, 150, 80, 180, 240, 220)],
    ['img_4.png', 480, 270, gradient(90, 30, 150, 250, 120, 200)],
    ['img_5.png', 160, 320, gradient(240, 140, 20, 120, 60, 200)],
    ['img_10.png', 300, 200, gradient(40, 40, 60, 230, 230, 250)],
    ['img_20.png', 260, 260, gradient(0, 120, 190, 180, 240, 120)],
    ['示例图片.png', 220, 300, gradient(30, 200, 220, 220, 40, 120)], // 验证中文文件名
];

for (const [name, w, h, fn] of files) {
    fs.writeFileSync(path.join(outDir, name), makePng(w, h, (x, y) => fn(x, y, w, h)));
}
console.log(`已生成 ${files.length} 张测试图片到 ${outDir}`);
