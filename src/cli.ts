#!/usr/bin/env node

import inquirer from "inquirer";
import { Command } from "commander";
import { fetchOpenApiSpec, generateTypes } from "./core/generator";
import { translateText } from "./core/translator";
import { API_CONFIG, initConfig } from "./config/apiConfig";
import { generateServices } from "./core/serviceGenerator";
import { formatModuleName } from "./utils/formatters";
import type { Tag } from "./types/openapi";

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
            module.englishName = await translateText(module.name);
          } catch (error) {
            console.error(`Translation failed for ${module.name}:`, error);
            module.englishName = module.name;
          }
        }
      })
    );
  }
}

async function selectModules(nonInteractive = false) {
  try {
    const spec = await fetchOpenApiSpec();

    if (!spec.tags) {
      throw new Error("No tags found in OpenAPI specification");
    }

    const modules: ModuleConfig[] = spec.tags.map((tag: Tag) => ({
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
        throw new Error(
          "No modules specified. Provide --modules values or remove --no-interactive to select manually."
        );
      }

      const availableModuleNames = new Set(modules.map((module) => module.name));
      const unknownModules = requestedModules.filter(
        (name) => !availableModuleNames.has(name)
      );

      if (unknownModules.length > 0) {
        throw new Error(
          `Unknown module tags: ${unknownModules.join(", ")}\nAvailable tags: ${modules
            .map((module) => module.name)
            .join(", ")}`
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
        message: "Enter output directory:",
        default: API_CONFIG.outputDir,
      },
    ]);

    // 选择模块
    const { selectedModules } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedModules",
        message: "Select modules to generate types for:",
        choices: modules.map((module) => ({
          name: `${module.name} (${module.englishName})`,
          value: module.name,
          checked: module.selected,
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
            message: `Confirm or modify English name for "${module.name}":`,
            default: module.englishName,
            validate: (input: string) => {
              if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(input)) {
                return "Name must start with a letter and contain only letters and numbers";
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
        message: "Enter type prefix (e.g., Api):",
        default: API_CONFIG.typePrefix,
      },
    ]);

    return {
      modules: modules.filter((m) => m.selected),
      outputDir,
      typePrefix,
    };
  } catch (error) {
    console.error("Error in module selection:", error);
    throw error;
  }
}

export async function run() {
  // 初始化配置
  await initConfig();

  // 更新配置
  if (options.url) {
    API_CONFIG.url = options.url;
  }

  const { modules, outputDir, typePrefix } = await selectModules(
    options.interactive === false
  );

  for (const module of modules) {
    // Generate types
    const typesFile = await generateTypes({
      moduleName: module.englishName!,
      tags: [module.name],
      outputDir,
      typePrefix,
    });
  }

  if (modules.length > 0) {
    await generateServices({
      modules: modules.map((module) => ({
        moduleName: module.englishName!,
        tags: [module.name],
      })),
    });
  }
}

if (require.main === module) {
  run().catch(console.error);
}
