import Lyric from "../lyric";
/**
 * QRC 歌词解析器
 * @class
 */
export declare class QrcParser {
    /** 可在运行时覆盖 XOR_KEY_HEX，以兼容不同来源的 QRC 变种 */
    static setXorKeyHex(hex: string): void;
    /**
     * 解析 QRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @param source - 输入的 QRC 文件数据
     * @returns 无返回值
     */
    static parse(lyric: Lyric, source: ArrayBuffer): void;
}
/**
 * QRC 歌词生成器
 * @class
 */
export declare class QrcGenerator {
    /**
     * 生成 QRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @returns 生成的 QRC 文件数据
     */
    static generate(lyric: Lyric): ArrayBuffer;
}
//# sourceMappingURL=qrc.d.ts.map