/**
 * 纯 TypeScript 的 DES 实现与工具函数
 * 导出：
 * - ENCRYPT_MODE / DECRYPT_MODE
 * - generateKeySchedule
 * - processDesBlock
 * - desProcess（ECB，无填充，截断到输入长度）
 */
export declare const ENCRYPT_MODE = 1;
export declare const DECRYPT_MODE = 0;
/**
 * 生成密钥调度
 * @param masterKey - 8 字节主密钥
 * @param keySched - 密钥调度数组
 * @param mode - 模式（加密或解密）
 */
export declare function generateKeySchedule(masterKey: Uint8Array, keySched: Uint8Array[], mode: number): void;
/**
 * 处理 DES 块
 * @param input - 8 字节输入块
 * @param keySched - 密钥调度数组
 * @returns 处理后的 8 字节输出块
 */
export declare function processDesBlock(input: Uint8Array, keySched: Uint8Array[]): Uint8Array;
/**
 * DES 加密/解密
 * @param data - 输入数据
 * @param key8 - 8 字节密钥
 * @param mode - 模式（加密或解密）
 * @returns - 处理后的数据
 */
export declare function desProcess(data: Uint8Array, key8: Uint8Array, mode: number): Uint8Array;
//# sourceMappingURL=des.d.ts.map