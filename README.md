# @apifox/typegen

> 从 Apifox OpenAPI 规范生成 TypeScript 类型定义

[![NPM version](https://img.shields.io/npm/v/@apifox/typegen.svg)](https://www.npmjs.com/package/@apifox/typegen)
[![NPM downloads](https://img.shields.io/npm/dm/@apifox/typegen.svg)](https://www.npmjs.com/package/@apifox/typegen)

## ✨ 特性

- 🚀 自动生成 TypeScript 类型定义
- 🌐 支持中文接口名自动翻译
- 🎯 模块化生成，按需选择
- 📝 自动生成 JSDoc 注释
- ⚡️ 支持 ESM 和 CommonJS
- 🛠 灵活的配置选项

## 📦 安装

```bash
# npm
npm install @apifox/typegen

# yarn
yarn add @apifox/typegen

# pnpm
pnpm add @apifox/typegen
```

## 🔧 配置

创建 `apifox.config.js`：

```javascript
/** @type {import('@apifox/typegen').ApifoxConfig} */
module.exports = {
  // OpenAPI 规范地址
  url: "http://localhost:4523/export/openapi/2",

  // 输出目录
  outputDir: "src/types",

  // 类型前缀
  typePrefix: "Api",

  // 阿里云翻译配置（可选）
  alibabaCloud: {
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  },
};
```

## 🚀 使用

### CLI 命令行

```bash
# 交互式生成
npx apifox-typegen

# 非交互式生成
npx apifox-typegen --no-interactive

# 指定配置
npx apifox-typegen --url http://your-api-url --output src/types

# 指定模块
npx apifox-typegen --modules user,auth,order
```

### 编程式使用

```typescript
import { generateTypes } from "@apifox/typegen";

async function generate() {
  await generateTypes({
    moduleName: "user",
    tags: ["用户相关"],
    outputDir: "src/types",
    typePrefix: "Api",
  });
}
```

## ⚙️ 配置项

| 选项           | 类型     | 必填 | 默认值      | 说明             |
| -------------- | -------- | ---- | ----------- | ---------------- |
| `url`          | `string` | ✅   | -           | OpenAPI 规范地址 |
| `outputDir`    | `string` | -    | `src/types` | 输出目录         |
| `typePrefix`   | `string` | -    | `Api`       | 类型前缀         |
| `alibabaCloud` | `object` | -    | -           | 阿里云翻译配置   |

### 命令行选项

| 选项               | 简写 | 说明                     |
| ------------------ | ---- | ------------------------ |
| `--url`            | `-u` | OpenAPI 规范地址         |
| `--output`         | `-o` | 输出目录                 |
| `--prefix`         | `-p` | 类型前缀                 |
| `--modules`        | `-m` | 要生成的模块（逗号分隔） |
| `--no-interactive` | -    | 非交互式模式             |

## 📝 生成的类型示例

```typescript
/**
 * 接口 [获取用户信息↗](/api/user/info) 的 **返回类型**
 *
 * @分类 [用户相关↗](/api/user)
 * @请求头 `GET /api/user/info`
 * @更新时间 `2024-01-01 12:00:00`
 */
export interface ApiGetUserInfoResponse {
  /** 用户ID */
  id: number;
  /** 用户名称 */
  name: string;
  /** 用户角色 */
  role: "admin" | "user";
}
```

## 📄 支持的配置文件

- `apifox.config.js` (推荐)
- `apifox.config.cjs`
- `apifox.config.mjs`
- `.apifoxrc`
- `.apifoxrc.json`
- `package.json` 中的 `apifox` 字段

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📜 许可证

[MIT](./LICENSE)
