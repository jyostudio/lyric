import path from "path";
import { CleanWebpackPlugin } from "clean-webpack-plugin";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import { WebpackStatsViewerPlugin } from "webpack-stats-viewer-plugin";
import TerserPlugin from "terser-webpack-plugin";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// 通过绝对路径解析 Babel 预设和插件，避免在 ESM/虚拟路径下的解析问题
const babelPresetTs = require.resolve("@babel/preset-typescript");
const babelPluginDecorators = require.resolve("@babel/plugin-proposal-decorators");

// webpack中的所有配置信息
export default {
    // 指定入口文件（多个构建：核心库 + WebComponent）
    entry: {
        lyric: "./src/lyric.ts",
        "jyo-lyric": "./src/jyo-lyric.ts"
    },
    // 开发模式（构建脚本会覆盖为 production）
    mode: "development",
    // 指定打包文件所在目录
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "[name].js",
        // 确保任何非入口 chunk 具有唯一文件名，避免与入口 index.js 冲突
        chunkFilename: "[id].js",
        environment: { arrowFunction: false },
        libraryTarget: "module"
    },
    experiments: {
        outputModule: true
    },
    module: {
        rules: [
            // 项目源码：完整类型检查
            {
                test: /\.tsx?$/,
                include: [path.resolve(__dirname, "src")],
                exclude: /node_modules/,
                loader: "ts-loader",
                options: { transpileOnly: false }
            },
            // 第三方包中的 TS（@jyostudio/*）：仅转译以通过 webpack 解析
            {
                test: /\.tsx?$/,
                include: [path.resolve(__dirname, "node_modules/@jyostudio")],
                use: {
                    loader: "babel-loader",
                    options: {
                        babelrc: false,
                        configFile: false,
                        // 直接用 Babel 解析 TS，并下编译装饰器（legacy）
                        presets: [[babelPresetTs, { allowDeclareFields: true }]],
                        plugins: [[babelPluginDecorators, { legacy: true }]]
                    }
                }
            }
        ]
    },
    plugins: [
        new CleanWebpackPlugin(),
        // new BundleAnalyzerPlugin(),
        // new WebpackStatsViewerPlugin({ open: true })
    ],
    optimization: {
        moduleIds: "deterministic",
        chunkIds: "deterministic",
        splitChunks: false,
        minimize: true,
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    compress: {
                        defaults: true,
                        drop_console: true,
                        drop_debugger: true
                    },
                    mangle: true,
                    format: { comments: false }
                }
            })
        ]
    },
    resolve: {
        extensions: [".ts", ".js"]
    }
}