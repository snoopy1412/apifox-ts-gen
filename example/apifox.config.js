/** @type {import('apifox-ts-gen').ApifoxConfig} */
module.exports = {
  url: "http://localhost:4523/export/openapi/2?version=3.0",
  outputDir: "src/types",
  typePrefix: "Api",
  alibabaCloud: {
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  },
  requestConfig: {
    importPath: "@/utils/request",
    servicesPath: "src/services",
    typesPath: "@/out/types",
    baseURL: "https://dev.demo.com/api",
  },
};
