import { cosmiconfig } from "cosmiconfig";
import chalk from "chalk";
import { pathToFileURL } from "url";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import type { ApifoxConfig } from "../types/config";
import { resolveConfigPath } from "../utils/path";
import { createErrorBox } from "../utils/messages";

function validateConfig(config: Partial<ApifoxConfig>): config is ApifoxConfig {
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

  const accessKeyId = config.alibabaCloud?.accessKeyId?.trim();
  const accessKeySecret = config.alibabaCloud?.accessKeySecret?.trim();

  if (!accessKeyId && !accessKeySecret) {
    if (config.alibabaCloud) {
      console.warn(
        chalk.yellow(
          "Alibaba Cloud 翻译未配置或缺少凭证，翻译功能将被跳过。"
        )
      );
    }
    delete config.alibabaCloud;
  } else if (!accessKeyId || !accessKeySecret) {
    const message = createErrorBox(
      "Missing Credentials",
      `
${chalk.yellow.bold("Required credentials:")}
  ${chalk.red("✖")} ${chalk.cyan("alibabaCloud.accessKeyId")}
  ${chalk.red("✖")} ${chalk.cyan("alibabaCloud.accessKeySecret")}

${chalk.yellow.bold("Solution:")}
Provide both credentials or remove the ${chalk.cyan("alibabaCloud")}
block from your ${chalk.cyan.underline("apifox.config.js")}.`
    );

    throw new Error(message);
  } else {
    config.alibabaCloud = {
      accessKeyId,
      accessKeySecret,
    };
  }

  if (config.requestConfig) {
    const requiredRequestFields = [
      "importPath",
      "servicesPath",
      "typesPath",
    ] as const;
    const missingRequestFields = requiredRequestFields.filter(
      (field) => !config.requestConfig?.[field]
    );

    if (missingRequestFields.length > 0) {
      throw new Error(
        `Missing required requestConfig fields: ${missingRequestFields.join(
          ", "
        )}`
      );
    }
  }

  return true;
}

// 默认配置 - 只保留非敏感的默认值
const defaultConfig: ApifoxConfig = {
  url: "",
  outputDir: "src/types",
  typePrefix: "Api",
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
async function loadConfig(): Promise<ApifoxConfig> {
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

    const configDir = result.filepath ? dirname(result.filepath) : process.cwd();
    const projectRoot = process.cwd();

    const config = {
      ...defaultConfig,
      ...result.config,
    };

    if (config.outputDir) {
      config.outputDir = resolveConfigPath(
        config.outputDir,
        configDir,
        projectRoot
      );
    }

    if (config.requestConfig) {
      const rawTypesPath = config.requestConfig.typesPath;
      const trimmedTypesPath =
        typeof rawTypesPath === "string" ? rawTypesPath.trim() : "";
      const preserveTypesPath =
        trimmedTypesPath.startsWith("@") ||
        trimmedTypesPath.startsWith("#") ||
        trimmedTypesPath.startsWith("./") ||
        trimmedTypesPath.startsWith("../");

      config.requestConfig = {
        ...config.requestConfig,
        servicesPath: resolveConfigPath(
          config.requestConfig.servicesPath,
          configDir,
          projectRoot
        ),
        typesPath: preserveTypesPath
          ? trimmedTypesPath.replace(/\/+$/, "")
          : resolveConfigPath(
              config.requestConfig.typesPath,
              configDir,
              projectRoot
            ),
      };
    }

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

export let API_CONFIG: ApifoxConfig = defaultConfig;

export async function initConfig() {
  API_CONFIG = await loadConfig();
}
