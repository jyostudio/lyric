import Lyric from "../lyric";
/**
 * KRC 歌词解析器
 * 先解密解压，再转为 LRC 格式，最后复用 LrcParser 解析
 * @class
 */
export declare class KrcParser {
    #private;
    /**
     * 解析 KRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @param source - 包含 KRC 歌词数据的 ArrayBuffer
     */
    static parse(lyric: Lyric, source: ArrayBuffer): void;
}
/**
 * KRC 歌词生成器
 * @class
 */
export declare class KrcGenerator {
    /**
     * 生成 KRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @returns KRC 歌词文件的字节数组
     */
    static generate(lyric: Lyric): ArrayBuffer;
}
//# sourceMappingURL=krc.d.ts.map