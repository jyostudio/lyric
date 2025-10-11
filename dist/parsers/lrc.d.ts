import Lyric from "../lyric";
/**
 * LRC 歌词解析器
 * 支持 TRC 格式以及兼容了一些特殊变种格式
 * @class
 */
export declare class LrcParser {
    #private;
    /** 歌词末尾时长无限大以确保兼容 */
    static optionLastLyricIsInfinity: boolean;
    /**
     * 解析 LRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @param source - 输入的 LRC 文件数据
     * @returns 无返回值
     */
    static parse(lyric: Lyric, source: ArrayBuffer): void;
    /**
     * 解析 LRC 歌词文本
     * @param lyric - 目标 Lyric 实例
     * @param text - 输入的 LRC 歌词文本
     * @returns 无返回值
     */
    static parse(lyric: Lyric, text: string): void;
}
/**
 * TRC 歌词生成器
 * @class
 */
export declare class TrcGenerator {
    #private;
    /**
     * 生成 TRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @returns 生成的 TRC 文件数据
     */
    static generate(lyric: Lyric): ArrayBuffer;
}
/**
 * LRC 歌词生成器
 * @class
 */
export declare class LrcGenerator {
    /**
     * 生成 LRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @returns 生成的 LRC 文件数据
     */
    static generate(lyric: Lyric): ArrayBuffer;
}
//# sourceMappingURL=lrc.d.ts.map