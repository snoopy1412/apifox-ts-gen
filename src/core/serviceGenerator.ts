import { writeFileSync, mkdirSync } from "node:fs";
import { join, relative, dirname, sep } from "node:path";
import { formatModuleName, formatTypeName } from "../utils/formatters";
import type { PathItemObject, OperationObject } from "../types/openapi";
import { API_CONFIG } from "../config/apiConfig";
import { fetchOpenApiSpec } from "./generator";

interface ModuleDefinition {
  moduleName: string;
  tags: string[];
}

interface ServiceGenerateOptions {
  modules: ModuleDefinition[];
}

type HelperName =
  | "omitParams"
  | "buildFormData"
  | "buildUrlEncoded"
  | "extractArrayBody";

const HELPER_FILE_NAME = "generatedRequestHelpers.ts";

const helperDefinitions: Record<HelperName, string> = {
  omitParams: `export function omitParams<T>(
  params: T | undefined,
  keys: readonly string[]
): Partial<T> {
  if (!params) {
    return {} as Partial<T>;
  }

  const source = params as Record<string, unknown>;
  if (!keys.length) {
    return { ...source } as Partial<T>;
  }

  const result: Record<string, unknown> = {};
  Object.entries(source).forEach(([key, value]) => {
    if (!keys.includes(key)) {
      result[key] = value;
    }
  });

  return result as Partial<T>;
}`,
  buildFormData: `export function buildFormData<T>(params: T | undefined): FormData {
  const formData = new FormData();
  if (!params) {
    return formData;
  }

  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (value instanceof File) {
      formData.append(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === undefined || item === null) {
          return;
        }

        if (item instanceof File) {
          formData.append(key, item);
        } else {
          formData.append(key, String(item));
        }
      });
    } else {
      formData.append(key, String(value));
    }
  });

  return formData;
}`,
  buildUrlEncoded: `export function buildUrlEncoded<T>(
  params: T | FormData | undefined
): URLSearchParams | FormData {
  if (!params) {
    return new URLSearchParams();
  }

  if (params instanceof FormData) {
    return params;
  }

  const pairs: [string, string][] = [];
  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    pairs.push([key, String(value)]);
  });

  return new URLSearchParams(pairs);
}`,
  extractArrayBody: `export function extractArrayBody<T>(
  params: { requestBody?: T } | undefined
): T | [] {
  if (!params) {
    return [];
  }

  const body = (params as Record<string, unknown>).requestBody as T | undefined;
  return body ?? [];
}`,
};

function normalizeImportPath(pathValue: string): string {
  const normalized = pathValue.split(sep).join("/");
  if (normalized.startsWith(".")) {
    return normalized;
  }
  return `./${normalized}`;
}

function getContentType(operation: OperationObject): string {
  if (operation.requestBody?.content) {
    if (operation.requestBody.content["multipart/form-data"]) {
      return "multipart/form-data";
    }
    if (operation.requestBody.content["application/x-www-form-urlencoded"]) {
      return "application/x-www-form-urlencoded";
    }
  }
  return "application/json";
}

function formatMethodName(method: string, path: string): string {
  const cleanPath = path.replace(/\{([^}]+)\}/g, (_, param) => {
    return param
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  });

  const parts = cleanPath.split("/").filter(Boolean);

  const formattedParts = parts.map((part, index) => {
    if (!/[-_]/.test(part) && part.length > 0) {
      return index === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : part.charAt(0).toUpperCase() + part.slice(1);
    }

    return part
      .split(/[-_]/)
      .map((word, i) => {
        if (index === 0 && i === 0) {
          return word.toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join("");
  });

  const methodPrefix = method.toLowerCase();
  const pathPart = formattedParts.join("");
  const formattedPathPart =
    pathPart.charAt(0).toUpperCase() + pathPart.slice(1);

  return `${methodPrefix}${formattedPathPart}`;
}

function resolveSchema(
  schema: Record<string, unknown> | undefined,
  schemas: Record<string, unknown> | undefined,
  seen: Set<string> = new Set()
): Record<string, unknown> | undefined {
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const ref = (schema as { $ref?: unknown }).$ref;
  if (typeof ref === "string" && schemas) {
    const refName = ref.split("/").pop();

    if (!refName || seen.has(refName)) {
      return schema;
    }

    const refSchema = schemas[refName] as Record<string, unknown> | undefined;
    if (!refSchema) {
      return schema;
    }

    seen.add(refName);
    return resolveSchema(refSchema, schemas, seen) ?? refSchema;
  }

  return schema;
}

function isObjectLikeSchema(schema: Record<string, unknown> | undefined): boolean {
  if (!schema || typeof schema !== "object") {
    return false;
  }

  if ((schema as { type?: unknown }).type === "object") {
    return true;
  }

  const candidate = schema as {
    properties?: unknown;
    allOf?: unknown;
    oneOf?: unknown;
    anyOf?: unknown;
  };

  if (candidate.properties || candidate.allOf || candidate.oneOf || candidate.anyOf) {
    return true;
  }

  return false;
}

interface GeneratedMethod {
  code: string;
  helpers: Set<HelperName>;
  httpMethod: string;
  requestType: string;
  responseType: string;
}

function generateServiceMethod(
  path: string,
  method: string,
  operation: OperationObject,
  typePrefix: string,
  matchedTag: string,
  schemas: Record<string, unknown> | undefined
): GeneratedMethod {
  const methodName = formatMethodName(method, path);
  const interfaceBaseName = formatTypeName(path, method, typePrefix);
  const requestType = `${interfaceBaseName}Request`;
  const responseType = `${interfaceBaseName}Response`;
  const methodUpper = method.toUpperCase();
  const helpers = new Set<HelperName>();

  const pathParams =
    operation.parameters?.filter((param) => param.in === "path") || [];
  const queryParams =
    operation.parameters?.filter((param) => param.in === "query") || [];

  const hasQueryParams = queryParams.length > 0;

  let urlTemplate = path;
  pathParams.forEach((param) => {
    urlTemplate = urlTemplate.replace(
      `{${param.name}}`,
      "${params." + param.name + "}"
    );
  });

  let contentType = getContentType(operation);

  if (["POST", "PUT", "PATCH"].includes(methodUpper) && hasQueryParams) {
    contentType = "application/x-www-form-urlencoded";
  }

  const requestConfig: string[] = [];
  requestConfig.push(`    url: \`${urlTemplate}\``);

  if (["GET", "DELETE"].includes(methodUpper)) {
    if (pathParams.length > 0) {
      helpers.add("omitParams");
      requestConfig.push(
        `    params: omitParams(params, [${pathParams
          .map((p) => `"${p.name}"`)
          .join(", ")}])`
      );
    } else {
      requestConfig.push(`    params: params`);
    }
  } else {
    if (contentType === "multipart/form-data") {
      helpers.add("buildFormData");
      requestConfig.push(`    data: buildFormData(params)`);
    } else if (contentType === "application/x-www-form-urlencoded") {
      helpers.add("buildUrlEncoded");
      requestConfig.push(`    data: buildUrlEncoded(params)`);
    } else {
      const jsonSchema =
        operation.requestBody?.content?.["application/json"]?.schema;
      const resolvedSchema = resolveSchema(
        jsonSchema as Record<string, unknown>,
        schemas
      );
      const schemaForBody = (resolvedSchema ?? jsonSchema) as
        | (Record<string, unknown> & { type?: string })
        | undefined;

      const hasJsonRequestBody = Boolean(schemaForBody);
      const isObjectLikeJsonBody = isObjectLikeSchema(schemaForBody);

      if (hasJsonRequestBody && pathParams.length > 0) {
        if (isObjectLikeJsonBody) {
          helpers.add("omitParams");
          requestConfig.push(
            `    data: omitParams(params, [${pathParams
              .map((p) => `"${p.name}"`)
              .join(", ")}])`
          );
        } else {
          requestConfig.push(`    data: params?.body`);
        }
      } else if (pathParams.length > 0) {
        helpers.add("omitParams");
        requestConfig.push(
          `    data: omitParams(params, [${pathParams
            .map((p) => `"${p.name}"`)
            .join(", ")}])`
        );
      } else {
        requestConfig.push(`    data: params`);
      }
    }
  }

  requestConfig.push("    config");

  const commentTag = matchedTag || operation.tags?.[0] || "未分类";

  const code = `
/**
 * ${operation.summary || ""}
 * @分类 [${commentTag}↗](${path})
 * @请求头 \`${methodUpper} ${path}\`
 * @contentType ${contentType}
 */
export const ${methodName} = (
  params${
    !operation.parameters ||
    operation.parameters?.length === 0 ||
    operation.parameters?.every((p) => !p.required)
      ? "?"
      : ""
  }: ${requestType},
  config?: AxiosRequestConfig<${requestType}>
) => {
  return ${methodUpper}<unknown, ${responseType}>({
${requestConfig.join(",\n")}
  });
};`;

  return {
    code,
    helpers,
    httpMethod: methodUpper,
    requestType,
    responseType,
  };
}

function writeHelperFile(outputDir: string) {
  const helperFilePath = join(outputDir, HELPER_FILE_NAME);
  const helperContent = `// This file is auto-generated. DO NOT EDIT.
${Object.values(helperDefinitions).join("\n\n")}
`;
  writeFileSync(helperFilePath, helperContent);
}

export async function generateServices(options: ServiceGenerateOptions) {
  const { modules } = options;
  const { requestConfig, typePrefix } = API_CONFIG;

  if (
    !requestConfig?.importPath ||
    !requestConfig?.servicesPath ||
    !requestConfig?.typesPath
  ) {
    throw new Error("Missing requestConfig in apifox.config.js");
  }

  if (modules.length === 0) {
    throw new Error("No modules provided for service generation");
  }

  const outputDir = requestConfig.servicesPath;
  mkdirSync(outputDir, { recursive: true });

  writeHelperFile(outputDir);

  const spec = await fetchOpenApiSpec();
  const paths = spec.paths || {};

  const helperImportOrder: HelperName[] = [
    "omitParams",
    "buildFormData",
    "buildUrlEncoded",
    "extractArrayBody",
  ];

  const httpMethodOrder = ["GET", "POST", "PUT", "DELETE", "PATCH"];

  for (const module of modules) {
    const moduleFile = join(
      outputDir,
      `${formatModuleName(module.moduleName)}.ts`
    );
    const moduleDir = dirname(moduleFile);

    const types = new Set<string>();
    const helperUsage = new Set<HelperName>();
    const httpMethods = new Set<string>();
    const methodBlocks: string[] = [];

    for (const [path, pathItem] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(
        pathItem as PathItemObject
      )) {
        if (!operation) continue;

        const matchedTag = operation.tags?.find((tag) =>
          module.tags.includes(tag)
        );

        if (!matchedTag) continue;

        const generated = generateServiceMethod(
          path,
          method,
          operation,
          typePrefix,
          matchedTag,
          spec.components?.schemas as Record<string, unknown> | undefined
        );

        types.add(generated.requestType);
        types.add(generated.responseType);
        generated.helpers.forEach((helper) => helperUsage.add(helper));
        httpMethods.add(generated.httpMethod);
        methodBlocks.push(generated.code);
      }
    }

    if (methodBlocks.length === 0) {
      throw new Error(
        `No operations found for tags: ${module.tags.join(", ")}. Check your Apifox spec.`
      );
    }

    const orderedHelpers = helperImportOrder.filter((helper) =>
      helperUsage.has(helper)
    );

    const orderedHttpMethods = [
      ...httpMethodOrder.filter((method) => httpMethods.has(method)),
      ...Array.from(httpMethods).filter(
        (method) => !httpMethodOrder.includes(method)
      ),
    ];

    const typeList = Array.from(types).sort();

    let fileContent = `// This file is auto-generated. DO NOT EDIT.
import type { AxiosRequestConfig } from "axios";
import { ${orderedHttpMethods.join(", ")} } from "${
      requestConfig.importPath
    }";
`;

    if (orderedHelpers.length) {
      const helperImportPath = normalizeImportPath(
        relative(moduleDir, join(outputDir, HELPER_FILE_NAME)).replace(
          /\.ts$/,
          ""
        )
      );
      fileContent += `import { ${orderedHelpers.join(", ")} } from "${helperImportPath}";
`;
    }

    const typeImportBase = requestConfig.typesPath.trim();
    let typeImportPath: string;

    if (typeImportBase.startsWith("@") || typeImportBase.startsWith("#")) {
      const sanitizedBase = typeImportBase.replace(/\/+$/, "");
      typeImportPath = `${sanitizedBase}/${formatModuleName(module.moduleName)}.d`;
    } else if (/^\.{1,2}\//.test(typeImportBase)) {
      const sanitizedBase = typeImportBase.replace(/\/+$/, "");
      const combinedPath = `${sanitizedBase}/${formatModuleName(
        module.moduleName
      )}.d`;
      typeImportPath = normalizeImportPath(combinedPath);
    } else {
      const typeImportFile = join(
        requestConfig.typesPath.trim(),
        `${formatModuleName(module.moduleName)}.d`
      );
      typeImportPath = normalizeImportPath(relative(moduleDir, typeImportFile));
    }

    fileContent += `import type {
  ${typeList.join(",\n  ")},
} from "${typeImportPath}";

`;

    fileContent += methodBlocks.join("\n\n") + "\n";

    writeFileSync(moduleFile, fileContent);
  }
}
