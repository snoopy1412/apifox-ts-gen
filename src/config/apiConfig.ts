import { cosmiconfig, Loader } from "cosmiconfig";
import chalk from "chalk";
import { pathToFileURL } from "url";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import type { ApifoxConfig } from "../types/config";

interface ApiConfig {
  url: string;
  outputDir: string;
  typePrefix: string;
  alibabaCloud: {
    accessKeyId: string;
    accessKeySecret: string;
  };
}

function createErrorBox(title: string, content: string) {
  const boxWidth = 80;
  const line = chalk.gray("─".repeat(boxWidth));
  const padding = " ".repeat(2);

  return `
${line}
${padding}${chalk.bgRed.white.bold(" ERROR ")} ${chalk.red.bold(title)}
${line}

${content}

${line}`;
}

function validateConfig(config: Partial<ApiConfig>): config is ApiConfig {
  const requiredFields = ["url", "outputDir", "typePrefix"] as const;
  const missingFields = requiredFields.filter((field) => !config[field]);

  if (missingFields.length > 0) {
    const message = createErrorBox(
      "Missing Configuration",
      `
${chalk.yellow.bold("Required fields:")}
${missingFields
  .map((field) => `  ${chalk.red("✖")} ${chalk.cyan(field)}`)
  .join("\n")}

${chalk.yellow.bold("Solution:")}
Create or update ${chalk.cyan.underline("apifox.config.js")} with the following:

${chalk.magenta("module.exports")} ${chalk.white("= {")}
  ${chalk.cyan("url")}: ${chalk.green(
        '"http://your-apifox-url/export/openapi/2"'
      )},
  ${chalk.cyan("outputDir")}: ${chalk.green('"src/types"')},
  ${chalk.cyan("typePrefix")}: ${chalk.green('"Api"')},
  ${chalk.cyan("alibabaCloud")}: {
    ${chalk.cyan("accessKeyId")}: ${chalk.green('"your-access-key-id"')},
    ${chalk.cyan("accessKeySecret")}: ${chalk.green('"your-access-key-secret"')}
  }
${chalk.white("};")}
`
    );

    throw new Error(message);
  }

  if (
    !config.alibabaCloud?.accessKeyId ||
    !config.alibabaCloud?.accessKeySecret
  ) {
    const message = createErrorBox(
      "Missing Credentials",
      `
${chalk.yellow.bold("Required credentials:")}
  ${chalk.red("✖")} ${chalk.cyan("alibabaCloud.accessKeyId")}
  ${chalk.red("✖")} ${chalk.cyan("alibabaCloud.accessKeySecret")}

${chalk.yellow.bold("Solution:")}
Add the following to your ${chalk.cyan.underline("apifox.config.js")}:

${chalk.magenta("module.exports")} ${chalk.white("= {")}
  ${chalk.cyan("alibabaCloud")}: {
    ${chalk.cyan("accessKeyId")}: ${chalk.green('"your-access-key-id"')},
    ${chalk.cyan("accessKeySecret")}: ${chalk.green('"your-access-key-secret"')}
  }
${chalk.white("};")}
`
    );

    throw new Error(message);
  }

  return true;
}

// 默认配置 - 只保留非敏感的默认值
const defaultConfig: ApiConfig = {
  url: "", // 移除默认 URL，强制用户提供
  outputDir: "src/types",
  typePrefix: "Api",
  alibabaCloud: {
    accessKeyId: "",
    accessKeySecret: "",
  },
};

// 添加检测项目类型的函数
function isESMPackage(configPath: string): boolean {
  try {
    // 从配置文件位置向上查找 package.json
    const searchPath = configPath;
    const dir = dirname(searchPath);
    const packageJsonPath = resolve(dir, "package.json");

    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      return packageJson.type === "module";
    } catch {
      return false; // 如果找不到 package.json 或解析失败，默认为 CommonJS
    }
  } catch {
    return false;
  }
}

// 加载配置文件
async function loadConfig(): Promise<ApiConfig> {
  try {
    const explorer = cosmiconfig("apifox", {
      searchPlaces: [
        "apifox.config.js",
        "apifox.config.mjs",
        "apifox.config.cjs",
        ".apifoxrc",
        ".apifoxrc.json",
      ],
      loaders: {
        ".js": async (filepath: string) => {
          try {
            const isESM = isESMPackage(filepath);

            if (isESM) {
              // 如果是 ESM 项目，使用 import()
              const fileUrl = pathToFileURL(filepath).href;
              const module = await import(fileUrl);
              return module.default || module;
            } else {
              // 如果是 CommonJS 项目，使用 require()
              return require(filepath);
            }
          } catch (error) {
            console.error(`Error loading ${filepath}:`, error);
            throw error;
          }
        },
        ".mjs": async (filepath: string) => {
          try {
            const fileUrl = pathToFileURL(filepath).href;
            const module = await import(fileUrl);
            return module.default || module;
          } catch (error) {
            console.error(
              `Error loading ${filepath}: Make sure your MJS file uses proper ES Module syntax\n`,
              error
            );
            throw error;
          }
        },
        ".cjs": (filepath: string) => {
          try {
            return require(filepath);
          } catch (error) {
            console.error(`Error loading ${filepath}:`, error);
            throw error;
          }
        },
      },
    });
    const result = await explorer.search();

    if (!result || !result.config) {
      const message = createErrorBox(
        "Configuration Not Found",
        `
${chalk.yellow.bold("Create one of these files:")}
  ${chalk.green("✓")} ${chalk.cyan.underline("apifox.config.js")}  ${chalk.gray(
          "(recommended)"
        )}
  ${chalk.dim("○")} ${chalk.gray(".apifoxrc")}
  ${chalk.dim("○")} ${chalk.gray(".apifoxrc.json")}

${chalk.yellow.bold("Example configuration:")}
${chalk.gray("// apifox.config.js")}
${chalk.magenta("module.exports")} ${chalk.white("= {")}
  ${chalk.cyan("url")}: ${chalk.green(
          '"http://your-apifox-url/export/openapi/2"'
        )},
  ${chalk.cyan("outputDir")}: ${chalk.green('"src/types"')},
  ${chalk.cyan("typePrefix")}: ${chalk.green('"Api"')},
  ${chalk.cyan("alibabaCloud")}: {
    ${chalk.cyan("accessKeyId")}: ${chalk.green('"your-access-key-id"')},
    ${chalk.cyan("accessKeySecret")}: ${chalk.green('"your-access-key-secret"')}
  }
${chalk.white("};")}
`
      );

      throw new Error(message);
    }

    const config = {
      ...defaultConfig,
      ...result.config,
    };

    // 验证配置
    validateConfig(config);

    return config;
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

export let API_CONFIG: ApiConfig = defaultConfig;

export async function initConfig() {
  API_CONFIG = await loadConfig();
}
