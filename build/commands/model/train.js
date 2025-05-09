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
exports.train = void 0;
var fs_1 = require("fs");
var util_1 = require("util");
var chalk_1 = require("chalk");
var shelljs_1 = require("shelljs");
var child_process_1 = require("child_process");
var dotenv_1 = require("dotenv");
var lodash_1 = require("lodash");
var api_1 = require("../../api");
var utils_1 = require("../../utils");
var readFile = (0, util_1.promisify)(fs_1.default.readFile);
var exec = (0, util_1.promisify)(child_process_1.exec);
dotenv_1.default.config();
var generateClientCode = function (polyPath) { return __awaiter(void 0, void 0, void 0, function () {
    var response, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                shelljs_1.default.echo('Re-generating poly library...');
                return [4 /*yield*/, exec("npx poly generate --customPath ".concat(polyPath))];
            case 1:
                response = _a.sent();
                if (response.stderr) {
                    throw new Error();
                }
                shelljs_1.default.echo(chalk_1.default.green('Success: '), 'Poly library re-generated.');
                return [3 /*break*/, 3];
            case 2:
                error_1 = _a.sent();
                shelljs_1.default.echo(chalk_1.default.yellow('Warning:', '"npx poly generate" command failed.'));
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); };
var executeTraining = function (_a) {
    var resources = _a.resources, resourceName = _a.resourceName, upsertFn = _a.upsertFn;
    return __awaiter(void 0, void 0, void 0, function () {
        var chunkSize, resourceChunks, chunkIterations, results, _i, resourceChunks_1, resourceChunk, calls, lastResourceNumberInChunk, _b, resourceChunk_1, resource, _c, _d, _e, failedResources, createdResources, i, settledResult, resource, httpStatusCode, errMessage, message, response, _f, failedResources_1, failedResource;
        var _g, _h, _j, _k, _l;
        return __generator(this, function (_m) {
            switch (_m.label) {
                case 0:
                    chunkSize = 5;
                    resourceChunks = (0, lodash_1.chunk)(resources, chunkSize);
                    chunkIterations = 0;
                    results = [];
                    shelljs_1.default.echo('\n');
                    _i = 0, resourceChunks_1 = resourceChunks;
                    _m.label = 1;
                case 1:
                    if (!(_i < resourceChunks_1.length)) return [3 /*break*/, 4];
                    resourceChunk = resourceChunks_1[_i];
                    calls = [];
                    lastResourceNumberInChunk = chunkSize * (chunkIterations + 1);
                    shelljs_1.default.echo("Training from ".concat(resourceName, " number ").concat((chunkSize * chunkIterations) + 1, " to ").concat(resourceName, " number ").concat(lastResourceNumberInChunk <= resources.length ? lastResourceNumberInChunk : resources.length, " out of ").concat(resources.length));
                    for (_b = 0, resourceChunk_1 = resourceChunk; _b < resourceChunk_1.length; _b++) {
                        resource = resourceChunk_1[_b];
                        calls.push(upsertFn(resource));
                    }
                    chunkIterations++;
                    _d = (_c = results.push).apply;
                    _e = [results];
                    return [4 /*yield*/, Promise.allSettled(calls)];
                case 2:
                    _d.apply(_c, _e.concat([(_m.sent())]));
                    _m.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    failedResources = [];
                    createdResources = [];
                    for (i = 0; i < results.length; i++) {
                        settledResult = results[i];
                        resource = resources[i];
                        if (settledResult.status === 'rejected') {
                            httpStatusCode = (_h = (_g = settledResult.reason) === null || _g === void 0 ? void 0 : _g.response) === null || _h === void 0 ? void 0 : _h.status;
                            errMessage = (_l = (_k = (_j = settledResult.reason) === null || _j === void 0 ? void 0 : _j.response) === null || _k === void 0 ? void 0 : _k.data) === null || _l === void 0 ? void 0 : _l.message;
                            message = 'Request failure';
                            if (httpStatusCode) {
                                message = "".concat(message, " with status code ").concat(chalk_1.default.redBright(httpStatusCode));
                            }
                            if (errMessage) {
                                message = "".concat(message, " - \"").concat(errMessage, "\"");
                            }
                            failedResources.push(__assign(__assign({}, resource), { index: i, reason: message }));
                        }
                        else {
                            response = settledResult.value;
                            createdResources.push(response);
                        }
                    }
                    if (createdResources.length) {
                        shelljs_1.default.echo('\n');
                        shelljs_1.default.echo(chalk_1.default.green('Success:'), "Trained ".concat(resourceName, "s:"));
                        shelljs_1.default.echo('\n');
                        shelljs_1.default.echo(createdResources.map(function (_a, index) {
                            var id = _a.id, name = _a.name, context = _a.context;
                            return chalk_1.default.blueBright("".concat(index + 1, ". ").concat(context ? context + '.' : '').concat(name, " - ").concat(id));
                        }).join('\n'));
                        shelljs_1.default.echo('\n');
                    }
                    if (failedResources.length) {
                        shelljs_1.default.echo('\n');
                        shelljs_1.default.echo(chalk_1.default.redBright('Danger:'), "Failed to train ".concat(resourceName, "s for:"));
                        shelljs_1.default.echo('\n');
                        for (_f = 0, failedResources_1 = failedResources; _f < failedResources_1.length; _f++) {
                            failedResource = failedResources_1[_f];
                            shelljs_1.default.echo("".concat((0, utils_1.firstLetterToUppercase)(resourceName), " with context"), "\"".concat(failedResource.context || '', "\" and"), 'name', "\"".concat(failedResource.name || '', "\""), 'at index:', chalk_1.default.yellow("".concat(failedResource.index)), "- Reason: ".concat(failedResource.reason));
                        }
                        shelljs_1.default.echo('\n');
                    }
                    return [2 /*return*/, createdResources.length];
            }
        });
    });
};
var train = function (polyPath, path) { return __awaiter(void 0, void 0, void 0, function () {
    var contents, error_2, specificationInput, createdApiFunctionsCount, createdWebhooksCount, createdSchemasCount, error_3;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                shelljs_1.default.echo('Training poly resources...');
                contents = '';
                _c.label = 1;
            case 1:
                _c.trys.push([1, 3, , 4]);
                return [4 /*yield*/, readFile(path, { encoding: 'utf-8' })];
            case 2:
                contents = _c.sent();
                return [3 /*break*/, 4];
            case 3:
                error_2 = _c.sent();
                throw new Error('File does not exist.');
            case 4:
                _c.trys.push([4, 10, , 11]);
                specificationInput = JSON.parse(contents);
                return [4 /*yield*/, executeTraining({
                        resources: specificationInput.functions,
                        resourceName: 'api function',
                        upsertFn: function (resource) {
                            return (0, api_1.upsertApiFunction)(resource);
                        },
                    })];
            case 5:
                createdApiFunctionsCount = _c.sent();
                return [4 /*yield*/, executeTraining({
                        resources: specificationInput.webhooks,
                        resourceName: 'webhook',
                        upsertFn: function (resource) {
                            return (0, api_1.upsertWebhookHandle)(resource);
                        },
                    })];
            case 6:
                createdWebhooksCount = _c.sent();
                return [4 /*yield*/, executeTraining({
                        resources: specificationInput.schemas,
                        resourceName: 'schema',
                        upsertFn: function (resource) {
                            return (0, api_1.upsertSchema)(resource);
                        },
                    })];
            case 7:
                createdSchemasCount = _c.sent();
                if (!(createdApiFunctionsCount > 0 || createdWebhooksCount > 0 || createdSchemasCount > 0)) return [3 /*break*/, 9];
                return [4 /*yield*/, generateClientCode(polyPath)];
            case 8:
                _c.sent();
                _c.label = 9;
            case 9: return [3 /*break*/, 11];
            case 10:
                error_3 = _c.sent();
                if (((_a = error_3.response) === null || _a === void 0 ? void 0 : _a.status) === 400) {
                    shelljs_1.default.echo(chalk_1.default.red('Error:'), (_b = error_3.response.data) === null || _b === void 0 ? void 0 : _b.message);
                }
                else {
                    shelljs_1.default.echo(chalk_1.default.red('Error:'), error_3.message);
                }
                return [3 /*break*/, 11];
            case 11: return [2 /*return*/];
        }
    });
}); };
exports.train = train;
