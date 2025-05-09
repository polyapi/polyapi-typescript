"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateModel = void 0;
var fs_1 = require("fs");
var util_1 = require("util");
var chalk_1 = require("chalk");
var shelljs_1 = require("shelljs");
var lodash_1 = require("lodash");
var axios_1 = require("axios");
var api_1 = require("../../api");
var utils_1 = require("../../utils");
var path_1 = require("path");
var slugify_1 = require("slugify");
var lodash_2 = require("lodash");
var readFile = (0, util_1.promisify)(fs_1.default.readFile);
var readDir = (0, util_1.promisify)(fs_1.default.readdir);
var access = (0, util_1.promisify)(fs_1.default.access);
var write = (0, util_1.promisify)(fs_1.default.writeFile);
var slugify = function (content) { return (0, slugify_1.default)(content, {
    lower: true,
    strict: true,
}); };
var axiosClient = axios_1.default.create();
var writeModelFile = function (title, specificationInput, destination, rename) {
    if (rename === void 0) { rename = []; }
    return __awaiter(void 0, void 0, void 0, function () {
        var adjustLines, contents, _i, rename_1, _a, prevName, newName, writeFile, getFilename, lastCount, foundSingleName, error_1, _b, _c, file, matchResult, count, fileName;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    title = slugify(title);
                    adjustLines = function (v) {
                        var lines = v.split('\n');
                        return lines.map(function (line, index) {
                            if (index === 0) {
                                return line;
                            }
                            return "    ".concat(line);
                        }).join('\n');
                    };
                    contents = "{\n  \"functions\": [\n    ".concat(specificationInput.functions.map(function (f) { return JSON.stringify(f, null, 2); }).map(adjustLines).join(',\n    '), "\n  ],\n  \"webhooks\": [\n    ").concat(specificationInput.webhooks.map(function (w) { return JSON.stringify(w, null, 2); }).map(adjustLines).join(',\n    '), "\n  ],\n  \"schemas\": [\n    ").concat(specificationInput.schemas.map(function (s) { return JSON.stringify(s, null, 2); }).map(adjustLines).join(',\n    '), "\n  ]\n}");
                    for (_i = 0, rename_1 = rename; _i < rename_1.length; _i++) {
                        _a = rename_1[_i], prevName = _a[0], newName = _a[1];
                        // Match name with full word boundaries
                        // So given prevName = "foo", newName = "bar":
                        // ` foo ` becomes ` bar `,
                        // and `{{foo}}` becomes `{{bar}}`,
                        // but ` foobaz ` stays ` foobaz `
                        contents = contents.replaceAll(new RegExp("\\b".concat(prevName, "\\b"), 'g'), newName);
                    }
                    writeFile = function (fileName) {
                        return write(path_1.default.join('./', fileName), contents, { encoding: 'utf-8' });
                    };
                    if (!destination) return [3 /*break*/, 2];
                    return [4 /*yield*/, writeFile(destination)];
                case 1:
                    _d.sent();
                    return [2 /*return*/, path_1.default.join('./', destination)];
                case 2:
                    getFilename = function (currentCount) {
                        return currentCount === 0 ? "".concat(title, ".json") : "".concat(title, "-").concat(currentCount, ".json");
                    };
                    lastCount = 0;
                    foundSingleName = false;
                    _d.label = 3;
                case 3:
                    _d.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, access(path_1.default.join('./', "".concat(title, ".json")))];
                case 4:
                    _d.sent();
                    foundSingleName = true;
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _d.sent();
                    return [3 /*break*/, 6];
                case 6:
                    _b = 0;
                    return [4 /*yield*/, readDir('.')];
                case 7:
                    _c = _d.sent();
                    _d.label = 8;
                case 8:
                    if (!(_b < _c.length)) return [3 /*break*/, 10];
                    file = _c[_b];
                    matchResult = file.match(new RegExp("".concat((0, lodash_1.escapeRegExp)(title), "-([0-9])+")));
                    if (matchResult) {
                        count = matchResult[1];
                        if (Number(count) > lastCount) {
                            lastCount = Number(count);
                        }
                    }
                    _d.label = 9;
                case 9:
                    _b++;
                    return [3 /*break*/, 8];
                case 10:
                    fileName = getFilename(lastCount === 0 && !foundSingleName ? 0 : lastCount + 1);
                    return [4 /*yield*/, writeFile(fileName)];
                case 11:
                    _d.sent();
                    return [2 /*return*/, fileName];
            }
        });
    });
};
var processResources = function (_a) {
    var resources = _a.resources, disableAi = _a.disableAi, context = _a.context, defaultAIDataGenerator = _a.defaultAIDataGenerator, aiDataProcessor = _a.aiDataProcessor, getAIDataFn = _a.getAIDataFn, resourceName = _a.resourceName;
    return __awaiter(void 0, void 0, void 0, function () {
        var chunkSize, resourceChunks, chunkIterations, descriptionSettledResults, _i, resourceChunks_1, resourceChunk, calls, lastFunctionNumberInChunk, _loop_1, _b, resourceChunk_1, resource, _c, _d, _e, failedDescriptions, resourcesWithNoName, i, descriptionSettledResult, resource, httpStatusCode, errMessage, message, response, _f, failedDescriptions_1, failedResourceDescription, _g, resourcesWithNoName_1, resourceWithNoName;
        var _h, _j, _k, _l, _m;
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0:
                    chunkSize = 5;
                    resourceChunks = (0, lodash_2.chunk)(resources, chunkSize);
                    chunkIterations = 0;
                    descriptionSettledResults = [];
                    shelljs_1.default.echo('\n');
                    _i = 0, resourceChunks_1 = resourceChunks;
                    _o.label = 1;
                case 1:
                    if (!(_i < resourceChunks_1.length)) return [3 /*break*/, 4];
                    resourceChunk = resourceChunks_1[_i];
                    calls = [];
                    lastFunctionNumberInChunk = chunkSize * (chunkIterations + 1);
                    if (!disableAi) {
                        shelljs_1.default.echo("Processing from ".concat(resourceName, " number ").concat((chunkSize * chunkIterations) + 1, " to ").concat(resourceName, " number ").concat(lastFunctionNumberInChunk <= resources.length ? lastFunctionNumberInChunk : resources.length, " out of ").concat(resources.length));
                    }
                    _loop_1 = function (resource) {
                        if (disableAi) {
                            calls.push(new Promise(function (resolve) { return resolve(defaultAIDataGenerator(resource)); }));
                        }
                        else {
                            calls.push(getAIDataFn(resource));
                        }
                    };
                    for (_b = 0, resourceChunk_1 = resourceChunk; _b < resourceChunk_1.length; _b++) {
                        resource = resourceChunk_1[_b];
                        _loop_1(resource);
                    }
                    chunkIterations++;
                    _d = (_c = descriptionSettledResults.push).apply;
                    _e = [descriptionSettledResults];
                    return [4 /*yield*/, Promise.allSettled(calls)];
                case 2:
                    _d.apply(_c, _e.concat([(_o.sent())]));
                    _o.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    failedDescriptions = [];
                    resourcesWithNoName = [];
                    for (i = 0; i < descriptionSettledResults.length; i++) {
                        descriptionSettledResult = descriptionSettledResults[i];
                        resource = resources[i];
                        if (descriptionSettledResult.status === 'rejected') {
                            if (context) {
                                resource.context = context;
                            }
                            httpStatusCode = (_j = (_h = descriptionSettledResult.reason) === null || _h === void 0 ? void 0 : _h.response) === null || _j === void 0 ? void 0 : _j.status;
                            errMessage = (_m = (_l = (_k = descriptionSettledResult.reason) === null || _k === void 0 ? void 0 : _k.response) === null || _l === void 0 ? void 0 : _l.data) === null || _m === void 0 ? void 0 : _m.message;
                            message = 'Request failure';
                            if (httpStatusCode) {
                                message = "".concat(message, " with status code ").concat(chalk_1.default.redBright(httpStatusCode));
                            }
                            if (errMessage) {
                                message = "".concat(message, " - \"").concat(errMessage, "\"");
                            }
                            failedDescriptions.push(__assign(__assign({}, resource), { index: i, reason: message }));
                            if (!resource.name) {
                                resourcesWithNoName.push(__assign(__assign({}, resource), { index: i }));
                            }
                        }
                        else {
                            response = descriptionSettledResult.value;
                            aiDataProcessor(resource, response);
                            if (response.traceId) {
                                failedDescriptions.push(__assign(__assign({}, resource), { index: i, traceId: response.traceId }));
                            }
                            if (!resource.name && !response.name) {
                                resourcesWithNoName.push(__assign(__assign({}, resource), { index: i }));
                            }
                        }
                    }
                    if (failedDescriptions.length) {
                        shelljs_1.default.echo('\n');
                        shelljs_1.default.echo(chalk_1.default.yellowBright('Warning:'), "Failed to generate some descriptions for ".concat(resourceName, "s:"));
                        shelljs_1.default.echo('\n');
                        for (_f = 0, failedDescriptions_1 = failedDescriptions; _f < failedDescriptions_1.length; _f++) {
                            failedResourceDescription = failedDescriptions_1[_f];
                            shelljs_1.default.echo("".concat((0, utils_1.firstLetterToUppercase)(resourceName), " with context"), "\"".concat(failedResourceDescription.context || '', "\" and"), 'name', "\"".concat(failedResourceDescription.name || '', "\""), 'at index:', chalk_1.default.yellow("".concat(failedResourceDescription.index)), failedResourceDescription.reason ? "- Reason: ".concat(failedResourceDescription.reason) : "- Trace id: ".concat(failedResourceDescription.traceId));
                        }
                    }
                    if (resourcesWithNoName.length) {
                        shelljs_1.default.echo('\n');
                        shelljs_1.default.echo(chalk_1.default.redBright('Action required:'), "The following ".concat(resourceName, "s from your specification input do not have a name:"));
                        shelljs_1.default.echo('\n');
                        for (_g = 0, resourcesWithNoName_1 = resourcesWithNoName; _g < resourcesWithNoName_1.length; _g++) {
                            resourceWithNoName = resourcesWithNoName_1[_g];
                            shelljs_1.default.echo("".concat((0, utils_1.firstLetterToUppercase)(resourceName), " at index:"), chalk_1.default.redBright(resourceWithNoName.index));
                        }
                    }
                    return [2 /*return*/];
            }
        });
    });
};
var generateModel = function (specPath, destination, context, hostUrl, hostUrlAsArgument, disableAi, rename) {
    if (disableAi === void 0) { disableAi = false; }
    if (rename === void 0) { rename = []; }
    return __awaiter(void 0, void 0, void 0, function () {
        var contents, response, error_2, error_3, specificationInputDto, createdFileName, error_4, error_5;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 15, , 16]);
                    shelljs_1.default.echo('Translating specification into poly api specification input and generating context, names and descriptions for all resources...');
                    contents = '';
                    if (!specPath.startsWith('https://')) return [3 /*break*/, 5];
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    shelljs_1.default.echo('Fetching open api specs from provided url...');
                    return [4 /*yield*/, axiosClient.get(specPath)];
                case 2:
                    response = _c.sent();
                    contents = response.data;
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _c.sent();
                    throw new Error("Failed to fetch contents from url \"".concat(specPath, "\""));
                case 4: return [3 /*break*/, 8];
                case 5:
                    _c.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, readFile(specPath, { encoding: 'utf-8' })];
                case 6:
                    contents = _c.sent();
                    return [3 /*break*/, 8];
                case 7:
                    error_3 = _c.sent();
                    throw new Error('File does not exist.');
                case 8:
                    _c.trys.push([8, 13, , 14]);
                    if (disableAi) {
                        shelljs_1.default.echo('Ai generation is disabled.');
                    }
                    if (destination && fs_1.default.existsSync(path_1.default.join('./', destination))) {
                        throw new Error('Destination file already exists.');
                    }
                    if (hostUrlAsArgument === '') {
                        hostUrlAsArgument = 'hostUrl';
                    }
                    return [4 /*yield*/, (0, api_1.translateSpecification)(contents, context, hostUrl, hostUrlAsArgument)];
                case 9:
                    specificationInputDto = _c.sent();
                    return [4 /*yield*/, processResources({
                            resources: specificationInputDto.functions,
                            aiDataProcessor: function (resource, aiData) {
                                resource.name = aiData.name;
                                resource.context = context || aiData.context;
                                resource.description = aiData.description;
                                resource.arguments = aiData.arguments;
                            },
                            defaultAIDataGenerator: function (resource) {
                                return {
                                    name: resource.name,
                                    context: resource.context,
                                    description: resource.description,
                                    arguments: resource.arguments,
                                };
                            },
                            disableAi: disableAi,
                            getAIDataFn: function (resource) {
                                return (0, api_1.getApiFunctionDescription)({
                                    name: resource.name,
                                    context: resource.context,
                                    description: resource.description,
                                    arguments: resource.arguments,
                                    source: resource.source,
                                });
                            },
                            context: context,
                            resourceName: 'function',
                        })];
                case 10:
                    _c.sent();
                    return [4 /*yield*/, processResources({
                            resources: specificationInputDto.webhooks,
                            aiDataProcessor: function (resource, aiData) {
                                resource.name = aiData.name;
                                resource.context = context || aiData.context;
                                resource.description = aiData.description;
                            },
                            defaultAIDataGenerator: function (resource) {
                                return {
                                    name: resource.name,
                                    context: resource.context,
                                    description: resource.description,
                                };
                            },
                            disableAi: disableAi,
                            getAIDataFn: function (resource) {
                                return (0, api_1.getWebhookHandleDescription)({
                                    name: resource.name,
                                    context: resource.context,
                                    description: resource.description,
                                    eventPayload: resource.eventPayloadTypeSchema,
                                });
                            },
                            context: context,
                            resourceName: 'webhook',
                        })];
                case 11:
                    _c.sent();
                    return [4 /*yield*/, writeModelFile(specificationInputDto.title, specificationInputDto, destination, rename)];
                case 12:
                    createdFileName = _c.sent();
                    shelljs_1.default.echo(chalk_1.default.green('Poly api specification input created:'), 'Open file', chalk_1.default.blueBright(createdFileName), 'to check details.');
                    return [3 /*break*/, 14];
                case 13:
                    error_4 = _c.sent();
                    if ((_b = (_a = error_4.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) {
                        throw new Error(error_4.response.data.message);
                    }
                    throw error_4;
                case 14: return [3 /*break*/, 16];
                case 15:
                    error_5 = _c.sent();
                    shelljs_1.default.echo(chalk_1.default.red('Error:'), error_5.message);
                    return [3 /*break*/, 16];
                case 16: return [2 /*return*/];
            }
        });
    });
};
exports.generateModel = generateModel;
