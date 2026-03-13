const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

require("ts-node/register");

const apiConfig = require("../src/config/apiConfig");
const generator = require("../src/core/generator");
const { generateServices } = require("../src/core/serviceGenerator");

const ORIGINAL_API_CONFIG = apiConfig.API_CONFIG;
const ORIGINAL_FETCH_OPENAPI_SPEC = generator.fetchOpenApiSpec;
const MODULE_TAG = "1.6 产品碳足迹建模——碳BOM清单";

function createTempOutput() {
  return mkdtempSync(join(tmpdir(), "apifox-ts-gen-"));
}

function createBaseSpec(path, operation) {
  return {
    openapi: "3.0.1",
    info: {
      title: "",
      version: "1.0.0",
    },
    paths: {
      [path]: {
        post: operation,
      },
    },
    components: {
      schemas: {
        UploadResult: {
          type: "object",
          properties: {},
        },
      },
    },
  };
}

async function generateModuleFile(spec) {
  const outputRoot = createTempOutput();
  const servicesPath = join(outputRoot, "services");

  apiConfig.API_CONFIG = {
    url: "http://example.test/openapi.json",
    outputDir: join(outputRoot, "types"),
    typePrefix: "Api",
    requestConfig: {
      importPath: "@/utils/request",
      servicesPath,
      typesPath: "@/types",
    },
  };
  generator.fetchOpenApiSpec = async () => spec;

  try {
    await generateServices({
      modules: [
        {
          moduleName: "carbon-bom",
          tags: [MODULE_TAG],
        },
      ],
    });

    return {
      serviceCode: readFileSync(join(servicesPath, "carbonBom.ts"), "utf8"),
      helperCode: readFileSync(
        join(servicesPath, "generatedRequestHelpers.ts"),
        "utf8"
      ),
      cleanup() {
        rmSync(outputRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(outputRoot, { recursive: true, force: true });
    throw error;
  }
}

function createJsonResponse() {
  return {
    "200": {
      description: "",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/UploadResult",
          },
        },
      },
    },
  };
}

test("multipart/form-data 请求同时带 query 时，query 和文件体应分开发送", async () => {
  const spec = createBaseSpec("/model/carbonbom/v1/import", {
    summary: "导入碳BOM清单",
    tags: [MODULE_TAG],
    parameters: [
      {
        name: "modelId",
        in: "query",
        required: true,
        schema: { type: "string" },
      },
    ],
    requestBody: {
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            required: ["file"],
            properties: {
              file: {
                type: "string",
                format: "binary",
              },
            },
          },
        },
      },
    },
    responses: createJsonResponse(),
  });

  const result = await generateModuleFile(spec);

  try {
    assert.match(result.serviceCode, /@contentType multipart\/form-data/);
    assert.match(
      result.serviceCode,
      /params: params \? \{\s*"modelId": params\?\.\["modelId"\],\s*\} : undefined/
    );
    assert.match(
      result.serviceCode,
      /data: buildFormData\(omitParams\(params, \["modelId"\]\)\)/
    );
    assert.doesNotMatch(result.serviceCode, /buildUrlEncoded/);
  } finally {
    result.cleanup();
  }
});

test("application/x-www-form-urlencoded 请求同时带 query 时，query 不应混进请求体", async () => {
  const spec = createBaseSpec("/model/carbonbom/v1/bind", {
    summary: "绑定碳BOM清单",
    tags: [MODULE_TAG],
    parameters: [
      {
        name: "modelId",
        in: "query",
        required: true,
        schema: { type: "string" },
      },
    ],
    requestBody: {
      content: {
        "application/x-www-form-urlencoded": {
          schema: {
            type: "object",
            required: ["name"],
            properties: {
              name: {
                type: "string",
              },
            },
          },
        },
      },
    },
    responses: createJsonResponse(),
  });

  const result = await generateModuleFile(spec);

  try {
    assert.match(
      result.serviceCode,
      /params: params \? \{\s*"modelId": params\?\.\["modelId"\],\s*\} : undefined/
    );
    assert.match(
      result.serviceCode,
      /data: buildUrlEncoded\(omitParams\(params, \["modelId"\]\)\)/
    );
  } finally {
    result.cleanup();
  }
});

test("JSON 请求同时带 path 和 query 时，body 只保留真正的请求体字段", async () => {
  const spec = createBaseSpec("/model/carbonbom/v1/{bomId}/item", {
    summary: "更新碳BOM条目",
    tags: [MODULE_TAG],
    parameters: [
      {
        name: "bomId",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
      {
        name: "modelId",
        in: "query",
        required: true,
        schema: { type: "string" },
      },
    ],
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["name"],
            properties: {
              name: {
                type: "string",
              },
            },
          },
        },
      },
    },
    responses: createJsonResponse(),
  });

  const result = await generateModuleFile(spec);

  try {
    assert.match(
      result.serviceCode,
      /url: `\/model\/carbonbom\/v1\/\$\{params\.bomId\}\/item`/
    );
    assert.match(
      result.serviceCode,
      /params: params \? \{\s*"modelId": params\?\.\["modelId"\],\s*\} : undefined/
    );
    assert.match(
      result.serviceCode,
      /data: omitParams\(params, \["bomId", "modelId"\]\)/
    );
  } finally {
    result.cleanup();
  }
});

test("只有 query 参数的 POST 请求不应伪造 urlencoded 请求体", async () => {
  const spec = createBaseSpec("/model/carbonbom/v1/check", {
    summary: "校验碳BOM导入",
    tags: [MODULE_TAG],
    parameters: [
      {
        name: "modelId",
        in: "query",
        required: true,
        schema: { type: "string" },
      },
    ],
    responses: createJsonResponse(),
  });

  const result = await generateModuleFile(spec);

  try {
    assert.doesNotMatch(result.serviceCode, /buildUrlEncoded/);
    assert.doesNotMatch(result.serviceCode, /\n\s*data:/);
    assert.match(
      result.serviceCode,
      /params: params \? \{\s*"modelId": params\?\.\["modelId"\],\s*\} : undefined/
    );
  } finally {
    result.cleanup();
  }
});

test("写请求里的特殊 query 名应生成合法的对象键和属性访问", async () => {
  const spec = createBaseSpec("/model/carbonbom/v1/search", {
    summary: "查询碳BOM清单",
    tags: [MODULE_TAG],
    parameters: [
      {
        name: "foo-bar",
        in: "query",
        required: true,
        schema: { type: "string" },
      },
      {
        name: "category[0]",
        in: "query",
        required: false,
        schema: { type: "string" },
      },
    ],
    responses: createJsonResponse(),
  });

  const result = await generateModuleFile(spec);

  try {
    assert.match(
      result.serviceCode,
      /params: params \? \{\s*"foo-bar": params\?\.\["foo-bar"\],\s*"category\[0\]": params\?\.\["category\[0\]"\],\s*\} : undefined/
    );
  } finally {
    result.cleanup();
  }
});

test("只有可选 query 参数的写请求在不传 params 时也不应先崩溃", async () => {
  const spec = createBaseSpec("/model/carbonbom/v1/optional-check", {
    summary: "可选参数校验",
    tags: [MODULE_TAG],
    parameters: [
      {
        name: "keyword",
        in: "query",
        required: false,
        schema: { type: "string" },
      },
    ],
    responses: createJsonResponse(),
  });

  const result = await generateModuleFile(spec);

  try {
    assert.match(
      result.serviceCode,
      /params\?: ApiPostModelCarbonbomV1OptionalCheckRequest/
    );
    assert.match(
      result.serviceCode,
      /params: params \? \{\s*"keyword": params\?\.\["keyword"\],\s*\} : undefined/
    );
  } finally {
    result.cleanup();
  }
});

test.after(() => {
  apiConfig.API_CONFIG = ORIGINAL_API_CONFIG;
  generator.fetchOpenApiSpec = ORIGINAL_FETCH_OPENAPI_SPEC;
});
