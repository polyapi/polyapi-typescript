"use strict";
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
exports.handleAxiosError = exports.validateBaseUrl = exports.URL_REGEX = exports.isValidHttpUrl = exports.firstLetterToUppercase = exports.getStringPaths = exports.upsertResourceInSpec = exports.generateContextDataFile = exports.showErrGettingSpecs = exports.prettyPrint = exports.loadTemplate = exports.echoGenerationError = exports.getSpecsFromContextData = exports.getContextDataFileContent = exports.getPolyLibPath = void 0;
var fs_1 = require("fs");
var jsonpath_1 = require("jsonpath");
var prettier_1 = require("prettier");
var chalk_1 = require("chalk");
var shelljs_1 = require("shelljs");
var api_1 = require("./api");
var getPolyLibPath = function (polyPath) { return polyPath.startsWith('/')
    ? "".concat(polyPath, "/lib")
    : "".concat(__dirname, "/../../../../../").concat(polyPath, "/lib"); };
exports.getPolyLibPath = getPolyLibPath;
var getContextDataFileContent = function (libPath) {
    try {
        var contents = fs_1.default.readFileSync("".concat(libPath, "/specs.json"), 'utf-8');
        return JSON.parse(contents);
    }
    catch (err) {
        return {};
    }
};
exports.getContextDataFileContent = getContextDataFileContent;
var getSpecsFromContextData = function (contextData) {
    var specs = [];
    var traverseAndGetSpec = function (data) {
        for (var _i = 0, _a = Object.keys(data); _i < _a.length; _i++) {
            var key = _a[_i];
            if (typeof data[key].context === 'string') {
                specs.push(data[key]);
            }
            else {
                traverseAndGetSpec(data[key]);
            }
        }
    };
    traverseAndGetSpec(contextData);
    return specs;
};
exports.getSpecsFromContextData = getSpecsFromContextData;
var echoGenerationError = function (specification) {
    var typeMap = {
        apiFunction: 'API Function',
        customFunction: 'Custom Function',
        authFunction: 'Auth Function',
        webhookHandle: 'Webhook Handle',
        serverFunction: 'Server Function',
        serverVariable: 'Variable',
        schema: 'Schema',
        snippet: 'Snippet',
    };
    var type = typeMap[specification.type];
    shelljs_1.default.echo(chalk_1.default.red("\nError encountered while processing ".concat(type, " '").concat(specification.contextName, "' (id: '").concat(specification.id, "'). ").concat(type, " is unavailable.")));
};
exports.echoGenerationError = echoGenerationError;
var loadTemplate = function (fileName) { return fs_1.default.readFileSync("".concat(__dirname, "/templates/").concat(fileName), 'utf8'); };
exports.loadTemplate = loadTemplate;
var prettyPrint = function (code, parser) {
    if (parser === void 0) { parser = 'typescript'; }
    return prettier_1.default.format(code, {
        parser: parser,
        singleQuote: true,
        printWidth: 160,
    });
};
exports.prettyPrint = prettyPrint;
var showErrGettingSpecs = function (error) {
    var _a;
    shelljs_1.default.echo(chalk_1.default.red('ERROR'));
    shelljs_1.default.echo('Error while getting data from Poly server. Make sure the version of library/server is up to date.');
    shelljs_1.default.echo(chalk_1.default.red(error.message), chalk_1.default.red(JSON.stringify((_a = error.response) === null || _a === void 0 ? void 0 : _a.data)));
    shelljs_1.default.exit(1);
};
exports.showErrGettingSpecs = showErrGettingSpecs;
var generateContextDataFile = function (libPath, specs) {
    fs_1.default.writeFileSync("".concat(libPath, "/specs.json"), JSON.stringify(specs.filter(function (spec) {
        if (spec.type === 'snippet') {
            return spec.language === 'javascript';
        }
        if (spec.type === 'customFunction') {
            return spec.language === 'javascript';
        }
        return true;
    }), null, 2));
};
exports.generateContextDataFile = generateContextDataFile;
var upsertResourceInSpec = function (polyPath, _a) {
    var resourceId = _a.resourceId, resourceName = _a.resourceName, updated = _a.updated;
    return __awaiter(void 0, void 0, void 0, function () {
        var contextData, prevSpecs, specs, error_1, resource;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    shelljs_1.default.echo('-n', updated ? "Updating ".concat(resourceName, " in specs...") : "Adding ".concat(resourceName, " to SDK..."));
                    contextData = {};
                    try {
                        contextData = (0, exports.getContextDataFileContent)((0, exports.getPolyLibPath)(polyPath));
                    }
                    catch (error) {
                        shelljs_1.default.echo(chalk_1.default.red('ERROR'));
                        shelljs_1.default.echo('Error while fetching local context data.');
                        shelljs_1.default.echo(chalk_1.default.red(error.message));
                        shelljs_1.default.echo(chalk_1.default.red(error.stack));
                        return [2 /*return*/];
                    }
                    prevSpecs = (0, exports.getSpecsFromContextData)(contextData);
                    specs = [];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, api_1.getSpecs)([], [], [resourceId], false)];
                case 2:
                    specs = _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _b.sent();
                    (0, exports.showErrGettingSpecs)(error_1);
                    return [2 /*return*/];
                case 4:
                    resource = specs[0];
                    if (prevSpecs.some(function (prevSpec) { return prevSpec.id === resource.id; })) {
                        specs = prevSpecs.map(function (prevSpec) {
                            if (prevSpec.id === resource.id) {
                                return resource;
                            }
                            return prevSpec;
                        });
                    }
                    else {
                        prevSpecs.push(resource);
                        specs = prevSpecs;
                    }
                    (0, exports.generateContextDataFile)((0, exports.getPolyLibPath)(polyPath), specs);
                    shelljs_1.default.echo(chalk_1.default.green('DONE'));
                    return [2 /*return*/];
            }
        });
    });
};
exports.upsertResourceInSpec = upsertResourceInSpec;
var getStringPaths = function (data) {
    var paths = jsonpath_1.default.paths(data, '$..*', 100);
    var stringPaths = [];
    for (var i = 0; i < paths.length; i++) {
        var stringPath = '';
        for (var _i = 0, _a = paths[i]; _i < _a.length; _i++) {
            var part = _a[_i];
            var isString = typeof part === 'string';
            var delimiter = (stringPath.length > 0 && isString) ? '.' : '';
            if (isString) {
                stringPath = "".concat(stringPath).concat(delimiter).concat(part);
            }
            else {
                stringPath = "".concat(stringPath).concat(delimiter, "[").concat(part, "]");
            }
        }
        stringPaths.push(stringPath);
    }
    return stringPaths;
};
exports.getStringPaths = getStringPaths;
var firstLetterToUppercase = function (value) { return "".concat(value.charAt(0).toUpperCase()).concat(value.slice(1)); };
exports.firstLetterToUppercase = firstLetterToUppercase;
var isValidHttpUrl = function (url) {
    try {
        var parsedUrl = new URL(url);
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    }
    catch (_a) {
        return false;
    }
};
exports.isValidHttpUrl = isValidHttpUrl;
var sanitizeUrl = function (url) {
    if (url === null || url === void 0 ? void 0 : url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    return url;
};
exports.URL_REGEX = /^(https?:\/\/)?(?:w{1,3}\.)?((localhost|(\d{1,3}(\.\d{1,3}){3})|[^\s.]+\.[a-z]{2,})(?:\.[a-z]{2,})?)(:\d+)?(\/[^\s]*)?(?![^<]*(?:<\/\w+>|\/?>))$/;
var validateBaseUrl = function (url) {
    var sanitizedUrl = sanitizeUrl(url);
    if (sanitizedUrl && !exports.URL_REGEX.test(sanitizedUrl)) {
        throw new Error('Given URL is not valid. Please enter a valid URL.');
    }
    return sanitizedUrl;
};
exports.validateBaseUrl = validateBaseUrl;
var handleAxiosError = function (error, axios) {
    var errorMessage = '';
    if (error instanceof AggregateError) {
        errorMessage = 'Multiple errors occurred:\n';
        error.errors.forEach(function (err, index) {
            errorMessage += "Error #".concat(index + 1, ": ").concat(err.message, "\n");
        });
    }
    else if (axios.isAxiosError(error)) {
        if (error.response) {
            errorMessage = "Request failed with status code ".concat(error.response.status, "\n");
            errorMessage += "Status text: ".concat(error.response.statusText, "\n");
        }
        else if (error.request) {
            errorMessage = 'No response received from the server.\n';
        }
        else {
            errorMessage = "Axios error occurred: ".concat(error.message, "\n");
        }
    }
    else if (error.code === 'ECONNREFUSED') {
        errorMessage = "Connection refused. Is the server running?\nDetails: ".concat(error.message, "\n");
    }
    else if (error.code === 'ENOTFOUND') {
        errorMessage = "DNS resolution failed. Is the hostname correct?\nDetails: ".concat(error.message, "\n");
    }
    else {
        errorMessage = "Unexpected error occurred: ".concat(error.message, "\n");
        if (error.stack) {
            errorMessage += "Stack trace: ".concat(error.stack, "\n");
        }
    }
    return errorMessage.trim();
};
exports.handleAxiosError = handleAxiosError;
