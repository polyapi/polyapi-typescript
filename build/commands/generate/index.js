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
exports.generateSingleCustomFunction = exports.generate = exports.generateSpecs = void 0;
var fs_1 = require("fs");
var handlebars_1 = require("handlebars");
var chalk_1 = require("chalk");
var shelljs_1 = require("shelljs");
var uuid_1 = require("uuid");
var utils_1 = require("@poly/common/utils");
var specs_1 = require("@poly/common/specs");
var api_1 = require("../../api");
var config_1 = require("../../config");
var utils_2 = require("../../utils");
var constants_1 = require("../../constants");
var types_1 = require("./types");
var schemaTypes_1 = require("./schemaTypes");
var fsWriteAsync = function (file, data) {
    return new Promise(function (resolve, reject) {
        fs_1.default.writeFile(file, data, function (err) { return err ? reject(err) : resolve(); });
    });
};
var getApiBaseUrl = function () { return process.env.POLY_API_BASE_URL || 'http://localhost:8000'; };
var getApiKey = function () { return process.env.POLY_API_KEY; };
var prepareDir = function (polyPath) { return __awaiter(void 0, void 0, void 0, function () {
    var libPath, err_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                libPath = (0, utils_2.getPolyLibPath)(polyPath);
                fs_1.default.rmSync(libPath, { recursive: true, force: true });
                fs_1.default.mkdirSync(libPath, { recursive: true });
                fs_1.default.mkdirSync("".concat(libPath, "/api"));
                fs_1.default.mkdirSync("".concat(libPath, "/client"));
                fs_1.default.mkdirSync("".concat(libPath, "/auth"));
                fs_1.default.mkdirSync("".concat(libPath, "/webhooks"));
                fs_1.default.mkdirSync("".concat(libPath, "/server"));
                fs_1.default.mkdirSync("".concat(libPath, "/vari"));
                fs_1.default.mkdirSync("".concat(libPath, "/schemas"));
                if (!(polyPath !== constants_1.DEFAULT_POLY_PATH)) return [3 /*break*/, 4];
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, generateRedirectIndexFiles(polyPath)];
            case 2:
                _a.sent();
                return [3 /*break*/, 4];
            case 3:
                err_1 = _a.sent();
                shelljs_1.default.echo(chalk_1.default.red("Could not generate redirect index files: ".concat(err_1.message, ", continuing...")));
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
var generateRedirectIndexFiles = function (polyPath) { return __awaiter(void 0, void 0, void 0, function () {
    var defaultPolyLib, indexRedirectJSTemplate, indexTSRedirectJSTemplate;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                defaultPolyLib = (0, utils_2.getPolyLibPath)(constants_1.DEFAULT_POLY_PATH);
                polyPath = polyPath.startsWith('/') ? polyPath : "../../../".concat(polyPath);
                fs_1.default.rmSync(defaultPolyLib, { recursive: true, force: true });
                fs_1.default.mkdirSync(defaultPolyLib, { recursive: true });
                indexRedirectJSTemplate = handlebars_1.default.compile((0, utils_2.loadTemplate)('index-redirect.js.hbs'));
                indexTSRedirectJSTemplate = handlebars_1.default.compile((0, utils_2.loadTemplate)('index-redirect.d.ts.hbs'));
                return [4 /*yield*/, Promise.all([
                        fsWriteAsync("".concat(defaultPolyLib, "/index.js"), indexRedirectJSTemplate({ polyPath: polyPath })),
                        fsWriteAsync("".concat(defaultPolyLib, "/index.d.ts"), indexTSRedirectJSTemplate({ polyPath: polyPath })),
                    ])];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); };
var generateJSFiles = function (libPath, specs) { return __awaiter(void 0, void 0, void 0, function () {
    var apiFunctions, customFunctions, webhookHandles, authFunctions, serverFunctions, serverVariables, customFnCodeGenerationErrors;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                apiFunctions = specs.filter(function (spec) { return spec.type === 'apiFunction'; });
                customFunctions = specs
                    .filter(function (spec) { return spec.type === 'customFunction'; })
                    .filter(function (spec) { return spec.language === 'javascript'; });
                webhookHandles = specs.filter(function (spec) { return spec.type === 'webhookHandle'; });
                authFunctions = specs.filter(function (spec) { return spec.type === 'authFunction'; });
                serverFunctions = specs.filter(function (spec) { return spec.type === 'serverFunction'; });
                serverVariables = specs.filter(function (spec) { return spec.type === 'serverVariable'; });
                return [4 /*yield*/, generateIndexJSFile(libPath)];
            case 1:
                _a.sent();
                return [4 /*yield*/, generatePolyCustomJSFile(libPath)];
            case 2:
                _a.sent();
                return [4 /*yield*/, generateAxiosJSFile(libPath)];
            case 3:
                _a.sent();
                return [4 /*yield*/, generateErrorHandlerFile(libPath)];
            case 4:
                _a.sent();
                return [4 /*yield*/, tryAsync(generateApiFunctionJSFiles(libPath, apiFunctions), 'api functions')];
            case 5:
                _a.sent();
                return [4 /*yield*/, tryAsync(generateCustomFunctionJSFiles(libPath, customFunctions), 'custom functions')];
            case 6:
                customFnCodeGenerationErrors = _a.sent();
                return [4 /*yield*/, tryAsync(generateWebhooksJSFiles(libPath, webhookHandles), 'webhooks')];
            case 7:
                _a.sent();
                return [4 /*yield*/, tryAsync(generateAuthFunctionJSFiles(libPath, authFunctions), 'auth functions')];
            case 8:
                _a.sent();
                return [4 /*yield*/, tryAsync(generateServerFunctionJSFiles(libPath, serverFunctions), 'server functions')];
            case 9:
                _a.sent();
                return [4 /*yield*/, tryAsync(generateServerVariableJSFiles(libPath, serverVariables), 'variables')];
            case 10:
                _a.sent();
                return [2 /*return*/, customFnCodeGenerationErrors];
        }
    });
}); };
var generateIndexJSFile = function (libPath) { return __awaiter(void 0, void 0, void 0, function () {
    var indexJSTemplate;
    return __generator(this, function (_a) {
        indexJSTemplate = handlebars_1.default.compile((0, utils_2.loadTemplate)('index.js.hbs'));
        fs_1.default.writeFileSync("".concat(libPath, "/index.js"), indexJSTemplate({
            clientID: (0, uuid_1.v4)(),
            apiBaseUrl: getApiBaseUrl(),
            apiKey: getApiKey(),
        }));
        return [2 /*return*/];
    });
}); };
var generatePolyCustomJSFile = function (libPath) { return __awaiter(void 0, void 0, void 0, function () {
    var polyCustomJSTemplate;
    return __generator(this, function (_a) {
        polyCustomJSTemplate = handlebars_1.default.compile((0, utils_2.loadTemplate)('poly-custom.js.hbs'));
        fs_1.default.writeFileSync("".concat(libPath, "/poly-custom.js"), polyCustomJSTemplate({
            apiBaseUrl: getApiBaseUrl(),
            apiKey: getApiKey(),
        }));
        return [2 /*return*/];
    });
}); };
var generateAxiosJSFile = function (libPath) { return __awaiter(void 0, void 0, void 0, function () {
    var axiosJSTemplate;
    return __generator(this, function (_a) {
        axiosJSTemplate = handlebars_1.default.compile((0, utils_2.loadTemplate)('axios.js.hbs'));
        fs_1.default.writeFileSync("".concat(libPath, "/axios.js"), axiosJSTemplate({
            apiBaseUrl: getApiBaseUrl(),
            apiKey: getApiKey(),
        }));
        return [2 /*return*/];
    });
}); };
var generateErrorHandlerFile = function (libPath) { return __awaiter(void 0, void 0, void 0, function () {
    var errorHandlerJSTemplate;
    return __generator(this, function (_a) {
        errorHandlerJSTemplate = handlebars_1.default.compile((0, utils_2.loadTemplate)('error-handler.js.hbs'));
        fs_1.default.writeFileSync("".concat(libPath, "/error-handler.js"), errorHandlerJSTemplate({}));
        return [2 /*return*/];
    });
}); };
var generateApiFunctionJSFiles = function (libPath, specifications) { return __awaiter(void 0, void 0, void 0, function () {
    var template;
    return __generator(this, function (_a) {
        template = handlebars_1.default.compile((0, utils_2.loadTemplate)('api-index.js.hbs'));
        fs_1.default.writeFileSync("".concat(libPath, "/api/index.js"), template({
            specifications: specifications,
        }));
        return [2 /*return*/];
    });
}); };
var generateCustomFunctionJSFiles = function (libPath, specifications) { return __awaiter(void 0, void 0, void 0, function () {
    var codeGenerationErrors, customFunctionJSTemplate_1, customIndexJSTemplate;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                codeGenerationErrors = {};
                if (!specifications.length) return [3 /*break*/, 2];
                customFunctionJSTemplate_1 = handlebars_1.default.compile((0, utils_2.loadTemplate)('custom-function.js.hbs'));
                return [4 /*yield*/, Promise.all(specifications.map(function (spec) {
                        return fsWriteAsync("".concat(libPath, "/client/").concat(spec.context ? "".concat(spec.context, "-") : '').concat(spec.name, ".js"), customFunctionJSTemplate_1(spec))
                            .catch(function (error) {
                            codeGenerationErrors[spec.id] = {
                                stack: error.stack,
                                specification: spec,
                            };
                        });
                    }))];
            case 1:
                _a.sent();
                _a.label = 2;
            case 2:
                customIndexJSTemplate = handlebars_1.default.compile((0, utils_2.loadTemplate)('custom-index.js.hbs'));
                fs_1.default.writeFileSync("".concat(libPath, "/client/index.js"), customIndexJSTemplate({
                    specifications: specifications.filter(function (spec) { return !codeGenerationErrors[spec.id]; }),
                }));
                return [2 /*return*/, Array.from(Object.values(codeGenerationErrors))];
        }
    });
}); };
var generateWebhooksJSFiles = function (libPath, specifications) { return __awaiter(void 0, void 0, void 0, function () {
    var template;
    return __generator(this, function (_a) {
        template = handlebars_1.default.compile((0, utils_2.loadTemplate)('webhooks-index.js.hbs'));
        fs_1.default.writeFileSync("".concat(libPath, "/webhooks/index.js"), template({
            specifications: specifications,
            apiKey: getApiKey(),
        }));
        return [2 /*return*/];
    });
}); };
var generateServerFunctionJSFiles = function (libPath, specifications) { return __awaiter(void 0, void 0, void 0, function () {
    var serverIndexJSTemplate;
    return __generator(this, function (_a) {
        serverIndexJSTemplate = handlebars_1.default.compile((0, utils_2.loadTemplate)('server-index.js.hbs'));
        fs_1.default.writeFileSync("".concat(libPath, "/server/index.js"), serverIndexJSTemplate({
            specifications: specifications,
        }));
        return [2 /*return*/];
    });
}); };
var generateServerVariableJSFiles = function (libPath, specifications) { return __awaiter(void 0, void 0, void 0, function () {
    var contextData, contextPaths, template, arrPaths, _i, specifications_1, specification;
    return __generator(this, function (_a) {
        contextData = (0, specs_1.getContextData)(specifications);
        contextPaths = getContextPaths(contextData);
        template = handlebars_1.default.compile((0, utils_2.loadTemplate)('vari/index.js.hbs'));
        arrPaths = [];
        for (_i = 0, specifications_1 = specifications; _i < specifications_1.length; _i++) {
            specification = specifications_1[_i];
            if ((0, utils_1.isPlainObjectPredicate)(specification.variable.value) || Array.isArray(specification.variable.value)) {
                arrPaths.push({
                    context: specification.context || '',
                    paths: (0, utils_2.getStringPaths)(specification.variable.value),
                });
            }
        }
        fs_1.default.writeFileSync("".concat(libPath, "/vari/index.js"), template({
            specifications: specifications,
            contextPaths: contextPaths,
            apiKey: getApiKey(),
            arrPaths: JSON.stringify(arrPaths),
        }));
        return [2 /*return*/];
    });
}); };
var generateAuthFunctionJSFiles = function (libPath, specifications) { return __awaiter(void 0, void 0, void 0, function () {
    var apiBaseUrl, apiKey, authIndexJSTemplate, specsToGenerate, authFunctionJSTemplate, codeGenerationErrors;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                apiBaseUrl = getApiBaseUrl();
                apiKey = getApiKey();
                authIndexJSTemplate = handlebars_1.default.compile((0, utils_2.loadTemplate)('auth-index.js.hbs'));
                fs_1.default.writeFileSync("".concat(libPath, "/auth/index.js"), authIndexJSTemplate({
                    getTokenFunctions: specifications.filter(function (spec) { return spec.name === 'getToken'; }),
                    subResourceFunctions: specifications.filter(function (spec) { return spec.subResource; }),
                    apiBaseUrl: apiBaseUrl,
                    apiKey: apiKey,
                }));
                specsToGenerate = specifications.filter(function (spec) { return !spec.subResource; });
                if (specsToGenerate.length === 0)
                    return [2 /*return*/, []];
                authFunctionJSTemplate = handlebars_1.default.compile((0, utils_2.loadTemplate)('auth-function.js.hbs'));
                codeGenerationErrors = {};
                return [4 /*yield*/, Promise.all(specifications.map(function (spec) {
                        return fsWriteAsync("".concat(libPath, "/auth/").concat(spec.context ? "".concat(spec.context, "-") : '').concat(spec.name, ".js"), authFunctionJSTemplate(__assign(__assign({}, spec), { audienceRequired: spec.function.arguments.some(function (arg) { return arg.name === 'audience'; }), apiBaseUrl: apiBaseUrl, apiKey: apiKey })))
                            .catch(function (error) {
                            codeGenerationErrors[spec.id] = {
                                stack: error.stack,
                                specification: spec,
                            };
                        });
                    }))];
            case 1:
                _a.sent();
                return [2 /*return*/, Array.from(Object.values(codeGenerationErrors))];
        }
    });
}); };
var getContextPaths = function (contextData) {
    var paths = [];
    var traverseAndAddPath = function (data, path) {
        if (path === void 0) { path = ''; }
        for (var _i = 0, _a = Object.keys(data); _i < _a.length; _i++) {
            var key = _a[_i];
            if (typeof data[key].context === 'string') {
                continue;
            }
            var currentPath = path ? "".concat(path, ".").concat(key) : key;
            paths.push(currentPath);
            traverseAndAddPath(data[key], currentPath);
        }
    };
    traverseAndAddPath(contextData);
    return paths;
};
var showErrGeneratingFiles = function (error) {
    shelljs_1.default.echo(chalk_1.default.red('ERROR'));
    shelljs_1.default.echo('Error while generating code files. Make sure the version of library/server is up to date.');
    shelljs_1.default.echo(chalk_1.default.red(error.message));
    shelljs_1.default.echo(chalk_1.default.red(error.stack));
    shelljs_1.default.exit(2);
};
var generateSingleCustomFunction = function (polyPath, functionId, updated, noTypes) {
    if (noTypes === void 0) { noTypes = false; }
    return __awaiter(void 0, void 0, void 0, function () {
        var libPath, contextData, prevSpecs, specs, error_1, customFunction;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    shelljs_1.default.echo('-n', updated ? 'Regenerating TypeScript SDK...' : 'Generating TypeScript SDK...');
                    libPath = (0, utils_2.getPolyLibPath)(polyPath);
                    contextData = {};
                    try {
                        contextData = (0, utils_2.getContextDataFileContent)(libPath);
                    }
                    catch (error) {
                        shelljs_1.default.echo(chalk_1.default.red('ERROR'));
                        shelljs_1.default.echo('Error while fetching local context data.');
                        shelljs_1.default.echo(chalk_1.default.red(error.message));
                        shelljs_1.default.echo(chalk_1.default.red(error.stack));
                        return [2 /*return*/];
                    }
                    prevSpecs = (0, utils_2.getSpecsFromContextData)(contextData);
                    specs = [];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, api_1.getSpecs)([], [], [functionId], noTypes)];
                case 2:
                    specs = _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    (0, utils_2.showErrGettingSpecs)(error_1);
                    return [2 /*return*/];
                case 4:
                    customFunction = specs[0];
                    if (prevSpecs.some(function (prevSpec) { return prevSpec.id === customFunction.id; })) {
                        specs = prevSpecs.map(function (prevSpec) {
                            if (prevSpec.id === customFunction.id) {
                                return customFunction;
                            }
                            return prevSpec;
                        });
                    }
                    else {
                        prevSpecs.push(customFunction);
                        specs = prevSpecs;
                    }
                    return [4 /*yield*/, prepareDir(polyPath)];
                case 5:
                    _a.sent();
                    (0, types_1.setGenerationErrors)(false);
                    return [4 /*yield*/, (0, exports.generateSpecs)(libPath, specs, noTypes)];
                case 6:
                    _a.sent();
                    if ((0, types_1.getGenerationErrors)()) {
                        shelljs_1.default.echo(chalk_1.default.yellow('Generate DONE with errors. Please investigate the errors and contact support@polyapi.io for assistance.'));
                    }
                    else {
                        shelljs_1.default.echo(chalk_1.default.green('DONE'));
                    }
                    return [2 /*return*/];
            }
        });
    });
};
exports.generateSingleCustomFunction = generateSingleCustomFunction;
var generate = function (_a) {
    var polyPath = _a.polyPath, contexts = _a.contexts, names = _a.names, functionIds = _a.functionIds, noTypes = _a.noTypes;
    return __awaiter(void 0, void 0, void 0, function () {
        var specs, generateMsg, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    specs = [];
                    generateMsg = contexts ? "Generating Poly TypeScript SDK for contexts \"".concat(contexts, "\"...") : 'Generating Poly TypeScript SDK...';
                    shelljs_1.default.echo('-n', generateMsg);
                    return [4 /*yield*/, prepareDir(polyPath)];
                case 1:
                    _b.sent();
                    (0, config_1.loadConfig)(polyPath);
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, (0, api_1.getSpecs)(contexts, names, functionIds, noTypes)];
                case 3:
                    specs = _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_2 = _b.sent();
                    (0, utils_2.showErrGettingSpecs)(error_2);
                    return [2 /*return*/];
                case 5:
                    (0, types_1.setGenerationErrors)(false);
                    return [4 /*yield*/, (0, exports.generateSpecs)((0, utils_2.getPolyLibPath)(polyPath), specs, noTypes)];
                case 6:
                    _b.sent();
                    if ((0, types_1.getGenerationErrors)()) {
                        shelljs_1.default.echo(chalk_1.default.yellow('Generate DONE with errors. Please investigate the errors and contact support@polyapi.io for assistance.'));
                    }
                    else {
                        shelljs_1.default.echo(chalk_1.default.green('DONE'));
                    }
                    return [2 /*return*/];
            }
        });
    });
};
exports.generate = generate;
var tryAsync = function (promise, generatingName) { return __awaiter(void 0, void 0, void 0, function () {
    var err_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, promise];
            case 1: return [2 /*return*/, _a.sent()];
            case 2:
                err_2 = _a.sent();
                shelljs_1.default.echo(chalk_1.default.red("\nUnexpected error encountered while generating ".concat(generatingName, ": ").concat(err_2)));
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); };
var generateSpecs = function (libPath, specs, noTypes) { return __awaiter(void 0, void 0, void 0, function () {
    var missingNames, jsFilesCodeGenerationErrors_1, filteredSpecs, error_3;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 6, , 7]);
                missingNames = [];
                _a = specs.reduce(function (acc, s) {
                    acc[s.name.trim() ? 1 : 0].push(s);
                    return acc;
                }, [[], []]), missingNames = _a[0], specs = _a[1];
                return [4 /*yield*/, generateJSFiles(libPath, specs)];
            case 1:
                jsFilesCodeGenerationErrors_1 = _b.sent();
                filteredSpecs = specs.filter(function (spec) { return !jsFilesCodeGenerationErrors_1.find(function (codeGenerationError) { return codeGenerationError.specification.id === spec.id; }); });
                if (!!noTypes) return [3 /*break*/, 5];
                return [4 /*yield*/, tryAsync((0, types_1.generateFunctionsTSDeclarationFile)(libPath, filteredSpecs), 'function types')];
            case 2:
                _b.sent();
                return [4 /*yield*/, tryAsync((0, types_1.generateVariablesTSDeclarationFile)(libPath, filteredSpecs), 'variable types')];
            case 3:
                _b.sent();
                return [4 /*yield*/, tryAsync((0, schemaTypes_1.generateSchemaTSDeclarationFiles)(libPath, filteredSpecs.filter(function (s) { return s.type === 'schema'; })), 'schemas')];
            case 4:
                _b.sent();
                _b.label = 5;
            case 5:
                (0, utils_2.generateContextDataFile)(libPath, filteredSpecs);
                if (missingNames.length) {
                    (0, types_1.setGenerationErrors)(true);
                    missingNames.map(function (s) { return (0, utils_2.echoGenerationError)(s); });
                }
                if (jsFilesCodeGenerationErrors_1.length) {
                    (0, types_1.setGenerationErrors)(true);
                    jsFilesCodeGenerationErrors_1.forEach(function (error) {
                        (0, utils_2.echoGenerationError)(error.specification);
                    });
                }
                return [3 /*break*/, 7];
            case 6:
                error_3 = _b.sent();
                showErrGeneratingFiles(error_3);
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); };
exports.generateSpecs = generateSpecs;
