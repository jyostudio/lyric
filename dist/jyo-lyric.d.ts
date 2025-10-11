/**
 * 歌词显示组件
 * @class
 */
export declare class JyoLyricElement extends HTMLElement {
    #private;
    static get observedAttributes(): string[];
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, _old: string | null, val: string | null): void;
    /**
     * 设置主题颜色
     * @param colors 颜色配置项
     */
    setColors(colors: {
        /**
         * 未播放部分颜色
         */
        before?: string;
        /**
         * 已播放部分颜色
         */
        after?: string;
        /**
         * 当前播放部分颜色
         */
        highlight?: string;
        /**
         * 翻译文字颜色
         */
        translation?: string;
    }): void;
    /**
     * 从 URL 加载歌词
     * @param url 歌词文件 URL
     */
    loadFromUrl(url: string): Promise<void>;
    /**
     * 从文本加载歌词
     * @param text 歌词文本
     */
    loadFromText(text: string): void;
    /**
     * 从 Uint8Array 加载歌词
     * @param buf Uint8Array 数据
     */
    loadFromBuffer(buf: Uint8Array): void;
    /**
     * 清除所有数据
     */
    clear(): void;
    /**
     * 设置当前播放时间，单位秒
     * @param s 当前播放时间，单位秒
     */
    setCurrentTime(s: number): void;
    /**
     * 手动滚动到当前行
     * @param immediate 是否立即滚动
     */
    scrollToCurrent(immediate?: boolean): void;
}
export default JyoLyricElement;
//# sourceMappingURL=jyo-lyric.d.ts.map