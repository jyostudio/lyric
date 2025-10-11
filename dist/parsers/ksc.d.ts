import Lyric from "../lyric";
/**
 * KSC 歌词解析器（文本脚本格式）
 * 形如：
 *   karaoke.add('01:01.069', '01:02.897', '终于做了这个决定', '229,264,229,...');
 * @class
 */
export declare class KscParser {
    /**
     * 解析 KSC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @param source - 包含 KSC 歌词数据的 ArrayBuffer
     */
    static parse(lyric: Lyric, source: ArrayBuffer): void;
    /**
     * 解析 KSC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @param text - 包含 KSC 歌词数据的文本
     */
    static parse(lyric: Lyric, text: string): void;
}
/**
 * KSC 歌词生成器
 * @class
 */
export declare class KscGenerator {
    /**
     * 生成 KSC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @returns 包含 KSC 歌词数据的 ArrayBuffer
     */
    static generate(lyric: Lyric): ArrayBuffer;
}
//# sourceMappingURL=ksc.d.ts.map