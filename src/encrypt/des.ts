/**
 * 纯 TypeScript 的 DES 实现与工具函数
 * 导出：
 * - ENCRYPT_MODE / DECRYPT_MODE
 * - generateKeySchedule
 * - processDesBlock
 * - desProcess（ECB，无填充，截断到输入长度）
 */

export const ENCRYPT_MODE = 1;
export const DECRYPT_MODE = 0;

// S 盒
const SBOXES: number[][] = [
    [
        14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
        0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
        4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
        15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13
    ],
    [
        15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
        3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5,
        0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
        13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9
    ],
    [
        10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
        13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
        13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
        1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12
    ],
    [
        7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
        13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
        10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
        3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14
    ],
    [
        2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
        14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
        4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
        11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3
    ],
    [
        12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
        10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
        9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
        4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13
    ],
    [
        4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
        13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
        1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
        6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12
    ],
    [
        13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
        1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
        7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
        2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11
    ]
];

/**
 * 从字节数组中提取指定位置的比特
 * @param data - 输入的字节数组（长度至少 8）
 * @param bitPos - 比特位置（0-63）
 * @param shift - 左移位数
 * @returns 提取的比特值
 */
function extractBitFromBytes(data: Uint8Array, bitPos: number, shift: number): number {
    const byteIndex = Math.floor(bitPos / 32) * 4 + 3 - Math.floor(bitPos % 32 / 8);
    const bitInByte = 7 - (bitPos % 8);
    return (((data[byteIndex] >> bitInByte) & 1) << shift) >>> 0;
}

/**
 * 从整数中提取指定位置的比特
 * @param data - 输入的整数
 * @param bitPos - 比特位置（0-31）
 * @param shift - 左移位数
 * @returns 提取的比特值
 */
function extractBitFromInt(data: number, bitPos: number, shift: number): number {
    return (((data >> (31 - bitPos)) & 1) << shift) >>> 0;
}

/**
 * 从整数中提取指定位置的比特并左移
 * @param data - 输入的整数
 * @param bitPos - 比特位置（0-31）
 * @param shift - 左移位数
 * @returns 提取的比特值
 */
function extractBitLeftShift(data: number, bitPos: number, shift: number): number {
    return (((data << bitPos) & 0x80000000) >>> shift) >>> 0;
}

/**
 * 准备 S-Box 索引
 * @param input - 输入值（0-63）
 * @returns 准备好的 S-Box 索引
 */
function prepareSboxIndex(input: number): number {
    return (input & 0x20) | ((input & 0x1f) >> 1) | ((input & 1) << 4);
}

/**
 * 初始置换
 * @param state - 状态数组
 * @param input - 输入字节数组
 */
function initialPermutation(state: Int32Array, input: Uint8Array) {
    state[0] = (
        extractBitFromBytes(input, 57, 31) | extractBitFromBytes(input, 49, 30) | extractBitFromBytes(input, 41, 29) | extractBitFromBytes(input, 33, 28) |
        extractBitFromBytes(input, 25, 27) | extractBitFromBytes(input, 17, 26) | extractBitFromBytes(input, 9, 25) | extractBitFromBytes(input, 1, 24) |
        extractBitFromBytes(input, 59, 23) | extractBitFromBytes(input, 51, 22) | extractBitFromBytes(input, 43, 21) | extractBitFromBytes(input, 35, 20) |
        extractBitFromBytes(input, 27, 19) | extractBitFromBytes(input, 19, 18) | extractBitFromBytes(input, 11, 17) | extractBitFromBytes(input, 3, 16) |
        extractBitFromBytes(input, 61, 15) | extractBitFromBytes(input, 53, 14) | extractBitFromBytes(input, 45, 13) | extractBitFromBytes(input, 37, 12) |
        extractBitFromBytes(input, 29, 11) | extractBitFromBytes(input, 21, 10) | extractBitFromBytes(input, 13, 9) | extractBitFromBytes(input, 5, 8) |
        extractBitFromBytes(input, 63, 7) | extractBitFromBytes(input, 55, 6) | extractBitFromBytes(input, 47, 5) | extractBitFromBytes(input, 39, 4) |
        extractBitFromBytes(input, 31, 3) | extractBitFromBytes(input, 23, 2) | extractBitFromBytes(input, 15, 1) | extractBitFromBytes(input, 7, 0)
    ) | 0;
    state[1] = (
        extractBitFromBytes(input, 56, 31) | extractBitFromBytes(input, 48, 30) | extractBitFromBytes(input, 40, 29) | extractBitFromBytes(input, 32, 28) |
        extractBitFromBytes(input, 24, 27) | extractBitFromBytes(input, 16, 26) | extractBitFromBytes(input, 8, 25) | extractBitFromBytes(input, 0, 24) |
        extractBitFromBytes(input, 58, 23) | extractBitFromBytes(input, 50, 22) | extractBitFromBytes(input, 42, 21) | extractBitFromBytes(input, 34, 20) |
        extractBitFromBytes(input, 26, 19) | extractBitFromBytes(input, 18, 18) | extractBitFromBytes(input, 10, 17) | extractBitFromBytes(input, 2, 16) |
        extractBitFromBytes(input, 60, 15) | extractBitFromBytes(input, 52, 14) | extractBitFromBytes(input, 44, 13) | extractBitFromBytes(input, 36, 12) |
        extractBitFromBytes(input, 28, 11) | extractBitFromBytes(input, 20, 10) | extractBitFromBytes(input, 12, 9) | extractBitFromBytes(input, 4, 8) |
        extractBitFromBytes(input, 62, 7) | extractBitFromBytes(input, 54, 6) | extractBitFromBytes(input, 46, 5) | extractBitFromBytes(input, 38, 4) |
        extractBitFromBytes(input, 30, 3) | extractBitFromBytes(input, 22, 2) | extractBitFromBytes(input, 14, 1) | extractBitFromBytes(input, 6, 0)
    ) | 0;
}

/**
 * 逆初始置换
 * @param state - 状态数组
 * @param out - 输出字节数组
 */
function inversePermutation(state: Int32Array, out: Uint8Array) {
    out[3] = (
        extractBitFromInt(state[1], 7, 7) | extractBitFromInt(state[0], 7, 6) | extractBitFromInt(state[1], 15, 5) | extractBitFromInt(state[0], 15, 4) |
        extractBitFromInt(state[1], 23, 3) | extractBitFromInt(state[0], 23, 2) | extractBitFromInt(state[1], 31, 1) | extractBitFromInt(state[0], 31, 0)
    ) & 0xff;
    out[2] = (
        extractBitFromInt(state[1], 6, 7) | extractBitFromInt(state[0], 6, 6) | extractBitFromInt(state[1], 14, 5) | extractBitFromInt(state[0], 14, 4) |
        extractBitFromInt(state[1], 22, 3) | extractBitFromInt(state[0], 22, 2) | extractBitFromInt(state[1], 30, 1) | extractBitFromInt(state[0], 30, 0)
    ) & 0xff;
    out[1] = (
        extractBitFromInt(state[1], 5, 7) | extractBitFromInt(state[0], 5, 6) | extractBitFromInt(state[1], 13, 5) | extractBitFromInt(state[0], 13, 4) |
        extractBitFromInt(state[1], 21, 3) | extractBitFromInt(state[0], 21, 2) | extractBitFromInt(state[1], 29, 1) | extractBitFromInt(state[0], 29, 0)
    ) & 0xff;
    out[0] = (
        extractBitFromInt(state[1], 4, 7) | extractBitFromInt(state[0], 4, 6) | extractBitFromInt(state[1], 12, 5) | extractBitFromInt(state[0], 12, 4) |
        extractBitFromInt(state[1], 20, 3) | extractBitFromInt(state[0], 20, 2) | extractBitFromInt(state[1], 28, 1) | extractBitFromInt(state[0], 28, 0)
    ) & 0xff;
    out[7] = (
        extractBitFromInt(state[1], 3, 7) | extractBitFromInt(state[0], 3, 6) | extractBitFromInt(state[1], 11, 5) | extractBitFromInt(state[0], 11, 4) |
        extractBitFromInt(state[1], 19, 3) | extractBitFromInt(state[0], 19, 2) | extractBitFromInt(state[1], 27, 1) | extractBitFromInt(state[0], 27, 0)
    ) & 0xff;
    out[6] = (
        extractBitFromInt(state[1], 2, 7) | extractBitFromInt(state[0], 2, 6) | extractBitFromInt(state[1], 10, 5) | extractBitFromInt(state[0], 10, 4) |
        extractBitFromInt(state[1], 18, 3) | extractBitFromInt(state[0], 18, 2) | extractBitFromInt(state[1], 26, 1) | extractBitFromInt(state[0], 26, 0)
    ) & 0xff;
    out[5] = (
        extractBitFromInt(state[1], 1, 7) | extractBitFromInt(state[0], 1, 6) | extractBitFromInt(state[1], 9, 5) | extractBitFromInt(state[0], 9, 4) |
        extractBitFromInt(state[1], 17, 3) | extractBitFromInt(state[0], 17, 2) | extractBitFromInt(state[1], 25, 1) | extractBitFromInt(state[0], 25, 0)
    ) & 0xff;
    out[4] = (
        extractBitFromInt(state[1], 0, 7) | extractBitFromInt(state[0], 0, 6) | extractBitFromInt(state[1], 8, 5) | extractBitFromInt(state[0], 8, 4) |
        extractBitFromInt(state[1], 16, 3) | extractBitFromInt(state[0], 16, 2) | extractBitFromInt(state[1], 24, 1) | extractBitFromInt(state[0], 24, 0)
    ) & 0xff;
}

/**
 * Feistel函数
 * @param state - 状态
 * @param roundKey - 轮密钥
 * @returns - 处理后的状态
 */
function feistelFunction(state: number, roundKey: Uint8Array): number {
    const t1 = (
        extractBitLeftShift(state, 31, 0) | ((state & 0xf0000000) >>> 1) | extractBitLeftShift(state, 4, 5) | extractBitLeftShift(state, 3, 6) |
        ((state & 0x0f000000) >>> 3) | extractBitLeftShift(state, 8, 11) | extractBitLeftShift(state, 7, 12) | ((state & 0x00f00000) >>> 5) |
        extractBitLeftShift(state, 12, 17) | extractBitLeftShift(state, 11, 18) | ((state & 0x000f0000) >>> 7) | extractBitLeftShift(state, 16, 23)
    );
    const t2 = (
        extractBitLeftShift(state, 15, 0) | ((state & 0x0000f000) << 15) | extractBitLeftShift(state, 20, 5) | extractBitLeftShift(state, 19, 6) |
        ((state & 0x00000f00) << 13) | extractBitLeftShift(state, 24, 11) | extractBitLeftShift(state, 23, 12) | ((state & 0x000000f0) << 11) |
        extractBitLeftShift(state, 28, 17) | extractBitLeftShift(state, 27, 18) | ((state & 0x0000000f) << 9) | extractBitLeftShift(state, 0, 23)
    );
    const expanded = new Uint8Array(6);
    expanded[0] = (t1 >>> 24) & 0xff;
    expanded[1] = (t1 >>> 16) & 0xff;
    expanded[2] = (t1 >>> 8) & 0xff;
    expanded[3] = (t2 >>> 24) & 0xff;
    expanded[4] = (t2 >>> 16) & 0xff;
    expanded[5] = (t2 >>> 8) & 0xff;
    for (let i = 0; i < 6; i++) expanded[i] ^= roundKey[i];
    const sIn = new Uint8Array(8);
    sIn[0] = expanded[0] >> 2;
    sIn[1] = ((expanded[0] & 0x03) << 4) | (expanded[1] >> 4);
    sIn[2] = ((expanded[1] & 0x0F) << 2) | (expanded[2] >> 6);
    sIn[3] = expanded[2] & 0x3F;
    sIn[4] = expanded[3] >> 2;
    sIn[5] = ((expanded[3] & 0x03) << 4) | (expanded[4] >> 4);
    sIn[6] = ((expanded[4] & 0x0F) << 2) | (expanded[5] >> 6);
    sIn[7] = expanded[5] & 0x3F;
    let sOut = 0;
    for (let i = 0; i < 8; i++) {
        sOut |= (SBOXES[i][prepareSboxIndex(sIn[i])] & 0x0f) << ((7 - i) * 4);
    }
    return (
        extractBitLeftShift(sOut, 15, 0) | extractBitLeftShift(sOut, 6, 1) | extractBitLeftShift(sOut, 19, 2) | extractBitLeftShift(sOut, 20, 3) |
        extractBitLeftShift(sOut, 28, 4) | extractBitLeftShift(sOut, 11, 5) | extractBitLeftShift(sOut, 27, 6) | extractBitLeftShift(sOut, 16, 7) |
        extractBitLeftShift(sOut, 0, 8) | extractBitLeftShift(sOut, 14, 9) | extractBitLeftShift(sOut, 22, 10) | extractBitLeftShift(sOut, 25, 11) |
        extractBitLeftShift(sOut, 4, 12) | extractBitLeftShift(sOut, 17, 13) | extractBitLeftShift(sOut, 30, 14) | extractBitLeftShift(sOut, 9, 15) |
        extractBitLeftShift(sOut, 1, 16) | extractBitLeftShift(sOut, 7, 17) | extractBitLeftShift(sOut, 23, 18) | extractBitLeftShift(sOut, 13, 19) |
        extractBitLeftShift(sOut, 31, 20) | extractBitLeftShift(sOut, 26, 21) | extractBitLeftShift(sOut, 2, 22) | extractBitLeftShift(sOut, 8, 23) |
        extractBitLeftShift(sOut, 18, 24) | extractBitLeftShift(sOut, 12, 25) | extractBitLeftShift(sOut, 29, 26) | extractBitLeftShift(sOut, 5, 27) |
        extractBitLeftShift(sOut, 21, 28) | extractBitLeftShift(sOut, 10, 29) | extractBitLeftShift(sOut, 3, 30) | extractBitLeftShift(sOut, 24, 31)
    ) >>> 0;
}

/**
 * 生成密钥调度
 * @param masterKey - 8 字节主密钥
 * @param keySched - 密钥调度数组
 * @param mode - 模式（加密或解密）
 */
export function generateKeySchedule(masterKey: Uint8Array, keySched: Uint8Array[], mode: number) {
    const keyRotation = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
    const keyPermC = [
        56, 48, 40, 32, 24, 16, 8, 0, 57, 49, 41, 33, 25, 17, 9, 1,
        58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35
    ];
    const keyPermD = [
        62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5,
        60, 52, 44, 36, 28, 20, 12, 4, 27, 19, 11, 3
    ];
    const keyCompression = [
        13, 16, 10, 23, 0, 4, 2, 27, 14, 5, 20, 9, 22, 18, 11, 3,
        25, 7, 15, 6, 26, 19, 12, 1, 40, 51, 30, 36, 46, 54, 29, 39,
        50, 44, 32, 47, 43, 48, 38, 55, 33, 52, 45, 41, 49, 35, 28, 31
    ];
    let left = 0, right = 0; let j = 31;
    for (let i = 0; i < 28; i++) { left |= extractBitFromBytes(masterKey, keyPermC[i], j); j--; }
    j = 31; for (let i = 0; i < 28; i++) { right |= extractBitFromBytes(masterKey, keyPermD[i], j); j--; }
    for (let round = 0; round < 16; round++) {
        const shift = keyRotation[round];
        left = ((left << shift) | (left >>> (28 - shift))) & 0xfffffff0;
        right = ((right << shift) | (right >>> (28 - shift))) & 0xfffffff0;
        const idx = (mode === DECRYPT_MODE) ? (15 - round) : round;
        const rk = keySched[idx]; rk.fill(0);
        for (let k = 0; k < 24; k++) rk[k >> 3] |= extractBitFromInt(left, keyCompression[k], 7 - (k % 8));
        for (let k = 24; k < 48; k++) rk[k >> 3] |= extractBitFromInt(right, keyCompression[k] - 27, 7 - (k % 8));
    }
}

/**
 * 处理 DES 块
 * @param input - 8 字节输入块
 * @param keySched - 密钥调度数组
 * @returns 处理后的 8 字节输出块
 */
export function processDesBlock(input: Uint8Array, keySched: Uint8Array[]): Uint8Array {
    const state = new Int32Array(2);
    initialPermutation(state, input);
    for (let r = 0; r < 15; r++) {
        const tmp = state[1];
        state[1] = (feistelFunction(state[1], keySched[r]) ^ state[0]) | 0;
        state[0] = tmp | 0;
    }
    state[0] = (feistelFunction(state[1], keySched[15]) ^ state[0]) | 0;
    const out = new Uint8Array(8);
    inversePermutation(state, out);
    return out;
}

/**
 * DES 加密/解密
 * @param data - 输入数据
 * @param key8 - 8 字节密钥
 * @param mode - 模式（加密或解密）
 * @returns - 处理后的数据
 */
export function desProcess(data: Uint8Array, key8: Uint8Array, mode: number): Uint8Array {
    const ks: Uint8Array[] = Array.from({ length: 16 }, () => new Uint8Array(6));
    generateKeySchedule(key8, ks, mode);
    const res = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 8) {
        const block = data.subarray(i, Math.min(i + 8, data.length));
        let inb: Uint8Array = block.length === 8 ? block : (() => { const t = new Uint8Array(8); t.set(block); return t; })();
        const outb = processDesBlock(inb, ks);
        res.set(outb.subarray(0, block.length), i);
    }
    return res;
}
