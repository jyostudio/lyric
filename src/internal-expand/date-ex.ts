/**
 * 扩展 Date 类
 * @class
 */
export default class DateEx extends Date {
    /**
     * 格式化日期时间
     * @param fmt - 格式字符串，支持的占位符有：
     *   y+ - 年（1~4 位）
     *   M+ - 月（1~2 位）
     *   d+ - 日（1~2 位）
     *   H+ - 时（0~23）
     *   m+ - 分（0~59）
     *   s+ - 秒（0~59）
     *   q+ - 季度（1~4）
     *   S  - 毫秒（0~999）
     * @returns 格式化后的字符串
     */
    format(fmt: string): string {
        const o: Record<string, number> = {
            "M+": this.getMonth() + 1,
            "d+": this.getDate(),
            "H+": this.getHours(),
            "m+": this.getMinutes(),
            "s+": this.getSeconds(),
            "q+": Math.floor((this.getMonth() + 3) / 3),
            "S": this.getMilliseconds()
        };
        if (/(y+)/.test(fmt)) {
            fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
        }
        for (const k in o) {
            if (new RegExp("(" + k + ")").test(fmt)) {
                fmt = fmt.replace(RegExp.$1, RegExp.$1.length === 1 ? String(o[k]) : ("00" + o[k]).substr(("" + o[k]).length));
            }
        }
        return fmt;
    }
}
