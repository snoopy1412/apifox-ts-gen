#!/usr/bin/env node

import inquirer from "inquirer";
import { Command } from "commander";
import { fetchOpenApiSpec, generateTypes } from "./core/generator";
import { translateText } from "./core/translator";
import { API_CONFIG, initConfig } from "./config/apiConfig";
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

    // 翻译模块名称
    for (const module of modules) {
      if (!module.englishName) {
        try {
          module.englishName = await translateText(module.name);
        } catch (error) {
          console.error(`Translation failed for ${module.name}:`, error);
          module.englishName = module.name;
        }
      }
    }

    // 在非交互模式下使用配置文件的值
    if (nonInteractive) {
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

      // 使用配置文件的值
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
    const outputFile = await generateTypes({
      moduleName: module.englishName!,
      tags: [module.name],
      outputDir,
      typePrefix,
    });

    console.log(`Generated types for ${module.name} -> ${outputFile}`);
  }
}

if (require.main === module) {
  run().catch(console.error);
}
