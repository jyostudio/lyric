import Line from "./line";
export { default as LyricController } from "./controller";
/**
 * 歌词类
 */
export default class Lyric {
    #private;
    /**
     * 歌词元数据，键值对形式
     * @returns 元数据 Map 实例
     */
    get metadata(): Map<string, string | number>;
    /**
     * 多行歌词数组，按 startTime 升序排列
     * @returns 行数组
     */
    get lines(): Line[];
    /**
     * 获取数据是否为空
     */
    get isEmpty(): boolean;
    /**
     * 构造函数
     * @param buffer - 包含歌词数据的 ArrayBuffer
     * @returns 无返回值
     */
    constructor(buffer: ArrayBuffer);
    /**
     * 从资源 URI 创建歌词实例
     * @param uri - 包含歌词数据的资源 URI
     * @returns 用 Promise 包裹的歌词实例
     */
    static createFromUri(uri: string): Promise<Lyric>;
    /**
     * 统一的行级工具：判断该行是否支持逐字（存在非 singleLine 且 duration>0 的词）
     * @param line - 歌词行实例
     * @returns 是否支持逐字
     */
    static supportsPerWord(line: Line | undefined | null): boolean;
    /**
     * 生成指定类型的歌词数据
     * @param lyric - 歌词实例
     * @param type - 歌词类型
     * @returns 生成的歌词数据 ArrayBuffer
     */
    static generate(lyric: Lyric, type: "lrc" | "trc" | "qrc" | "krc" | "ksc"): ArrayBuffer;
    /**
     * 设置当前播放时间
     * @param time - 当前播放时间，单位：毫秒
     * @returns 当前行和当前词的索引
     */
    setCurrentTime(time: number): {
        /**
         * 当前行索引，-1 表示早于第一行，lines.length 表示晚于最后一行
         */
        lineIndex: number;
        /**
         * 当前词索引，-1 表示当前行无词或无当前词
         */
        wordIndex: number;
    };
}
//# sourceMappingURL=lyric.d.ts.map