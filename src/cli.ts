#!/usr/bin/env node

import { relative } from "node:path";
import inquirer from "inquirer";
import { Command } from "commander";
import chalk from "chalk";
import {
  fetchOpenApiSpec,
  generateTypes,
  OpenApiSpecError,
} from "./core/generator";
import { translateText } from "./core/translator";
import { API_CONFIG, initConfig } from "./config/apiConfig";
import { generateServices } from "./core/serviceGenerator";
import { formatModuleName } from "./utils/formatters";
import { createErrorBox, renderBanner } from "./utils/messages";
import type { OpenAPISpec, PathItemObject, Tag } from "./types/openapi";
import {
  PROMPT_PREFIX,
  PROMPT_SUFFIX,
  formatModuleChoice,
  formatModuleLabel,
  logInfo,
  logSuccess,
  logWarn,
  styleAnswer,
  stylePathDisplay,
  stylePromptMessage,
  styleValidationError,
} from "./utils/ui";

const program = new Command();

program
  .name("apifox-ts-gen")
  .description("Generate TypeScript types from Apifox OpenAPI specification")
  .option("-u, --url <url>", "OpenAPI specification URL")
  .option("-o, --output <dir>", "Output directory")
  .option("-p, --prefix <prefix>", "Type prefix")
  .option("-m, --modules <modules>", "Modules to generate (comma-separated)")
  .option("--no-interactive", "Run in non-interactive mode")
  .parse(process.argv);

const options = program.opts();

interface ModuleConfig {
  name: string;
  englishName?: string;
  selected: boolean;
}

function collectModuleTags(spec: OpenAPISpec): Tag[] {
  const moduleMap = new Map<string, Tag>();

  if (Array.isArray(spec.tags)) {
    for (const tag of spec.tags) {
      if (!tag || typeof tag.name !== "string") continue;
      const trimmedName = tag.name.trim();
      if (!trimmedName) continue;
      if (!moduleMap.has(trimmedName)) {
        moduleMap.set(trimmedName, {
          name: trimmedName,
          description: tag.description,
        });
      }
    }
  }

  const pathEntries = spec.paths ?? {};
  const httpMethods: Array<keyof PathItemObject> = [
    "get",
    "put",
    "post",
    "delete",
    "options",
    "head",
    "patch",
    "trace",
  ];

  for (const pathItem of Object.values(pathEntries)) {
    if (!pathItem) continue;
    for (const method of httpMethods) {
      const operation = (pathItem as PathItemObject)[method];
      const tags = operation?.tags;
      if (!Array.isArray(tags)) continue;

      for (const tagName of tags) {
        if (typeof tagName !== "string") continue;
        const trimmedName = tagName.trim();
        if (!trimmedName) continue;
        if (!moduleMap.has(trimmedName)) {
          moduleMap.set(trimmedName, { name: trimmedName });
        }
      }
    }
  }

  return Array.from(moduleMap.values());
}

// 添加批量处理函数
async function batchTranslate(modules: ModuleConfig[], batchSize = 20) {
  // 将模块分组
  const batches: ModuleConfig[][] = [];
  for (let i = 0; i < modules.length; i += batchSize) {
    batches.push(modules.slice(i, i + batchSize));
  }

  // 逐批并行处理
  for (const batch of batches) {
    await Promise.all(
      batch.map(async (module) => {
        if (!module.englishName) {
          try {
            const translated = await translateText(module.name);
            module.englishName = formatModuleName(translated);
          } catch (error) {
            console.error(`Translation failed for ${module.name}:`, error);
            module.englishName = formatModuleName(module.name);
          }
        } else {
          module.englishName = formatModuleName(module.englishName);
        }
      })
    );
  }
}

async function selectModules(nonInteractive = false) {
  try {
    const spec = await fetchOpenApiSpec();

    const tags = collectModuleTags(spec);

    if (tags.length === 0) {
      throw new OpenApiSpecError(
        createErrorBox(
          "No Modules Found",
          `
${chalk.yellow.bold("Reason:")}
  The OpenAPI document does not expose any ${chalk.cyan("tags")} — neither top-level definitions nor endpoint tags.

${chalk.yellow.bold("Fix:")}
  Add modules in Apifox so every endpoint has a tag, or pass ${chalk.cyan(
            "--modules"
          )} to select modules manually.`
        )
      );
    }

    const modules: ModuleConfig[] = tags.map((tag: Tag) => ({
      name: tag.name,
      selected: false,
    }));

    // 替换原来的串行翻译
    await batchTranslate(modules);

    // 在非交互模式下使用配置文件的值
    if (nonInteractive && options.modules) {
      const requestedModules = options.modules
        .split(",")
        .map((name: string) => name.trim())
        .filter(Boolean);

      if (!requestedModules.length) {
        throw new OpenApiSpecError(
          createErrorBox(
            "Missing Modules",
            `
${chalk.yellow.bold("Fix:")}
  Provide at least one tag via ${chalk.cyan("--modules")} or run without ${chalk.cyan(
              "--no-interactive"
            )} to pick modules manually.`
          )
        );
      }

      const availableModuleNames = new Set(modules.map((module) => module.name));
      const unknownModules = requestedModules.filter(
        (name) => !availableModuleNames.has(name)
      );

      if (unknownModules.length > 0) {
        const formattedAvailable = modules
          .map((module) => formatModuleLabel(module.name, module.englishName))
          .join(chalk.gray(", "));
        throw new OpenApiSpecError(
          createErrorBox(
            "Unknown Modules",
            `
${chalk.yellow.bold("Provided:")}
  ${chalk.red(unknownModules.join(", "))}

${chalk.yellow.bold("Available:")}
  ${formattedAvailable}`
          )
        );
      }

      modules.forEach((module) => {
        module.selected = requestedModules.includes(module.name);
        if (module.selected && !module.englishName) {
          module.englishName = formatModuleName(module.name);
        }
      });

      return {
        modules: modules.filter((m) => m.selected),
        outputDir: options.output || API_CONFIG.outputDir,
        typePrefix: options.prefix || API_CONFIG.typePrefix,
      };
    }

    // 选择输出目录
    const { outputDir } = await inquirer.prompt([
      {
        type: "input",
        name: "outputDir",
        message: stylePromptMessage("Enter output directory"),
        prefix: PROMPT_PREFIX,
        suffix: PROMPT_SUFFIX,
        default: API_CONFIG.outputDir,
        transformer: (input: string) =>
          styleAnswer(input || API_CONFIG.outputDir || ""),
      },
    ]);

    // 选择模块
    const { selectedModules } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedModules",
        message: stylePromptMessage("Select modules to generate types for"),
        prefix: PROMPT_PREFIX,
        suffix: PROMPT_SUFFIX,
        pageSize: Math.min(12, modules.length || 12),
        choices: modules.map((module) => ({
          name: formatModuleChoice(module.name, module.englishName),
          value: module.name,
          checked: module.selected,
          short: formatModuleLabel(module.name, module.englishName),
        })),
      },
    ]);

    // 更新选中状态
    modules.forEach((module) => {
      module.selected = selectedModules.includes(module.name);
    });

    // 确认翻译结果
    for (const module of modules) {
      if (module.selected) {
        const { confirmedName } = await inquirer.prompt([
          {
            type: "input",
            name: "confirmedName",
            message: stylePromptMessage(
              `Confirm or modify English name for "${module.name}"`
            ),
            prefix: PROMPT_PREFIX,
            suffix: PROMPT_SUFFIX,
            default: module.englishName,
            transformer: (value: string) =>
              styleAnswer(value || module.englishName || ""),
            validate: (input: string) => {
              if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(input)) {
                return styleValidationError(
                  "Name must start with a letter and contain only letters and numbers"
                );
              }
              return true;
            },
          },
        ]);
        module.englishName = confirmedName;
      }
    }

    // 选择类型前缀
    const { typePrefix } = await inquirer.prompt([
      {
        type: "input",
        name: "typePrefix",
        message: stylePromptMessage("Enter type prefix (e.g., Api)"),
        prefix: PROMPT_PREFIX,
        suffix: PROMPT_SUFFIX,
        default: API_CONFIG.typePrefix,
        transformer: (input: string) =>
          styleAnswer(input || API_CONFIG.typePrefix || ""),
      },
    ]);

    return {
      modules: modules.filter((m) => m.selected),
      outputDir,
      typePrefix,
    };
  } catch (error) {
    if (error instanceof OpenApiSpecError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new OpenApiSpecError(
        createErrorBox(
          "Module Selection Failed",
          `
${chalk.yellow.bold("Reason:")}
  ${chalk.red(error.message)}
`
        )
      );
    }

    throw new OpenApiSpecError(
      createErrorBox(
        "Module Selection Failed",
        `
${chalk.yellow.bold("Reason:")}
  ${chalk.red("Unexpected error during module selection.")}
`
      )
    );
  }
}

export async function run() {
  // 初始化配置
  await initConfig();

  // 更新配置
  if (options.url) {
    API_CONFIG.url = options.url;
  }

  if (process.stdout.isTTY) {
    const banner = renderBanner("Apifox TypeScript Generator");
    if (banner) {
      console.log(banner);
    }
  }

  const { modules, outputDir, typePrefix } = await selectModules(
    options.interactive === false
  );

  if (modules.length === 0) {
    logWarn("未选择任何模块，已退出。");
    return;
  }

  const toDisplayPath = (target: string) => {
    const relativePath = relative(process.cwd(), target);
    if (!relativePath || relativePath.startsWith("..")) {
      return target;
    }
    return relativePath;
  };

  logInfo(
    `输出目录：${stylePathDisplay(toDisplayPath(outputDir))}  ${chalk.gray(
      "|"
    )}  类型前缀：${styleAnswer(typePrefix)}`
  );

  logInfo(
    `已选择 ${modules.length} 个模块：${modules
      .map((module) => formatModuleLabel(module.name, module.englishName))
      .join(chalk.gray(", "))}`
  );

  for (const module of modules) {
    // Generate types
    const typesFile = await generateTypes({
      moduleName: module.englishName!,
      tags: [module.name],
      outputDir,
      typePrefix,
    });
    logSuccess(
      `类型定义 ${formatModuleLabel(module.name, module.englishName)} → ${stylePathDisplay(
        toDisplayPath(typesFile)
      )}`
    );
  }

  if (API_CONFIG.requestConfig) {
    await generateServices({
      modules: modules.map((module) => ({
        moduleName: module.englishName!,
        tags: [module.name],
      })),
    });
    logSuccess(
      `服务文件输出目录：${stylePathDisplay(
        toDisplayPath(API_CONFIG.requestConfig.servicesPath)
      )}`
    );
  } else {
    logWarn("requestConfig 未配置，已跳过服务文件生成，仅生成类型定义。");
  }
}

if (require.main === module) {
  run().catch((error) => {
    if (error instanceof OpenApiSpecError) {
      console.error(error.message);
    } else if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  });
}
