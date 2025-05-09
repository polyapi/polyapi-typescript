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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var shelljs_1 = require("shelljs");
var prompts_1 = require("@inquirer/prompts");
var fs_1 = require("fs");
var config_1 = require("../config");
var chalk_1 = require("chalk");
var axios_1 = require("axios");
var path_1 = require("path");
var adm_zip_1 = require("adm-zip");
var client_dependencies_1 = require("@poly/common/client-dependencies");
var api_1 = require("../api");
var utils_1 = require("../utils");
var setup = function (polyPath, baseUrl, apiKey, apiVersion) {
    if (apiVersion === void 0) { apiVersion = '1'; }
    return __awaiter(void 0, void 0, void 0, function () {
        var isNonInteractive, polyApiBaseUrl, polyApiKey, _a, tenantId, environmentId, projectTemplatesConfig, templateChoices, projectTemplateFileUrl, error_1, errorMessage;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 11, , 12]);
                    (0, config_1.loadConfig)(polyPath);
                    process.env.POLY_API_KEY = process.env.POLY_API_KEY || apiVersion;
                    isNonInteractive = baseUrl && apiKey;
                    baseUrl = (0, utils_1.validateBaseUrl)(baseUrl);
                    if (!!process.env.ENVIRONMENT_SETUP_COMPLETE) return [3 /*break*/, 2];
                    return [4 /*yield*/, setupEnvironment(polyPath)];
                case 1:
                    _b.sent();
                    _b.label = 2;
                case 2:
                    polyApiBaseUrl = baseUrl;
                    polyApiKey = apiKey;
                    if (!!isNonInteractive) return [3 /*break*/, 10];
                    return [4 /*yield*/, shelljs_1.default.echo('Please setup your connection to Poly service.')];
                case 3:
                    _b.sent();
                    return [4 /*yield*/, (0, prompts_1.input)({
                            message: 'Poly API Base URL:',
                            default: process.env.POLY_API_BASE_URL || 'https://na1.polyapi.io',
                            transformer: function (value) { return value.trim(); },
                            validate: function (url) {
                                if (!utils_1.URL_REGEX.test(url)) {
                                    return 'Given URL is not valid. Please enter a valid URL.';
                                }
                                return true;
                            },
                        })];
                case 4:
                    polyApiBaseUrl = _b.sent();
                    polyApiBaseUrl = (0, utils_1.validateBaseUrl)(polyApiBaseUrl);
                    return [4 /*yield*/, (0, prompts_1.input)({
                            message: 'Poly App Key or User Key:',
                            default: process.env.POLY_API_KEY,
                            transformer: function (value) { return value.trim(); },
                        })];
                case 5:
                    polyApiKey = _b.sent();
                    if (!(process.env.ENVIRONMENT_SETUP_COMPLETE !== 'true')) return [3 /*break*/, 10];
                    return [4 /*yield*/, (0, api_1.getAuthData)(polyApiBaseUrl, polyApiKey)];
                case 6:
                    _a = _b.sent(), tenantId = _a.tenant.id, environmentId = _a.environment.id;
                    return [4 /*yield*/, (0, api_1.getProjectTemplatesConfig)(polyApiBaseUrl, polyApiKey, tenantId, environmentId)];
                case 7:
                    projectTemplatesConfig = _b.sent();
                    templateChoices = __spreadArray([
                        { name: 'No (empty project)', value: null }
                    ], projectTemplatesConfig.templates
                        .filter(function (template) { return template.typescript; })
                        .map(function (template) { return ({ name: template.name, value: template.typescript }); }), true);
                    return [4 /*yield*/, (0, prompts_1.rawlist)({
                            message: 'Do you want to use a project template?',
                            choices: templateChoices,
                        })];
                case 8:
                    projectTemplateFileUrl = _b.sent();
                    if (!projectTemplateFileUrl) return [3 /*break*/, 10];
                    return [4 /*yield*/, initProjectStructure(projectTemplateFileUrl)];
                case 9:
                    _b.sent();
                    _b.label = 10;
                case 10:
                    polyApiBaseUrl = (0, utils_1.validateBaseUrl)(polyApiBaseUrl);
                    (0, config_1.saveConfig)(polyPath, {
                        POLY_API_BASE_URL: polyApiBaseUrl,
                        POLY_API_KEY: polyApiKey,
                        API_VERSION: apiVersion || '1',
                        DISABLE_AI: process.env.DISABLE_AI || 'false',
                        NO_COLOR: process.env.NO_COLOR || 'false',
                        ENVIRONMENT_SETUP_COMPLETE: 'true',
                    });
                    shelljs_1.default.echo(chalk_1.default.green('Poly setup complete.'));
                    return [3 /*break*/, 12];
                case 11:
                    error_1 = _b.sent();
                    errorMessage = (0, utils_1.handleAxiosError)(error_1, axios_1.default);
                    shelljs_1.default.echo(chalk_1.default.redBright('ERROR:'), errorMessage);
                    return [3 /*break*/, 12];
                case 12: return [2 /*return*/];
            }
        });
    });
};
var initProjectStructure = function (fileUrl) { return __awaiter(void 0, void 0, void 0, function () {
    var response, fileName, filePath, zip, zipBaseName, extractedDirPath, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                shelljs_1.default.echo('-n', 'Downloading project template...');
                return [4 /*yield*/, axios_1.default.get(fileUrl, {
                        responseType: 'arraybuffer',
                    })];
            case 1:
                response = _a.sent();
                fileName = path_1.default.basename(fileUrl);
                filePath = path_1.default.join(process.cwd(), fileName);
                fs_1.default.writeFileSync(filePath, response.data);
                shelljs_1.default.echo(chalk_1.default.green('DONE'));
                shelljs_1.default.echo('-n', 'Extracting project template...');
                zip = new adm_zip_1.default(filePath);
                zip.extractAllTo(process.cwd(), true);
                shelljs_1.default.echo(chalk_1.default.green('DONE'));
                zipBaseName = path_1.default.parse(filePath).name;
                extractedDirPath = path_1.default.join(process.cwd(), zipBaseName);
                // Check if single directory with same name as zip file exists
                if (fs_1.default.existsSync(extractedDirPath) && fs_1.default.statSync(extractedDirPath).isDirectory()) {
                    // Move all contents to current directory and remove extracted directory
                    shelljs_1.default.mv("".concat(extractedDirPath, "/*"), process.cwd());
                    fs_1.default.rmdirSync(extractedDirPath);
                }
                fs_1.default.unlinkSync(filePath);
                return [3 /*break*/, 3];
            case 2:
                error_2 = _a.sent();
                shelljs_1.default.echo(chalk_1.default.red('ERROR'));
                shelljs_1.default.echo(chalk_1.default.red('Project template cannot be downloaded or extracted. Continuing...'));
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); };
var setupEnvironment = function (polyPath) { return __awaiter(void 0, void 0, void 0, function () {
    var packageJson;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                (0, config_1.loadConfig)(polyPath);
                (0, client_dependencies_1.checkNodeVersion)({
                    onOldVersion: function (message) {
                        shelljs_1.default.echo(chalk_1.default.red(message));
                        throw new Error('Node.js version is too old.');
                    },
                });
                packageJson = getPackageJson();
                return [4 /*yield*/, (0, client_dependencies_1.checkLibraryVersions)(packageJson, {
                        createOrUpdateLib: function (library, create) {
                            return __awaiter(this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, shelljs_1.default.echo("".concat(create ? 'Installing' : 'Updating', " ").concat(library, "..."))];
                                        case 1:
                                            _a.sent();
                                            return [4 /*yield*/, shelljs_1.default.exec("".concat((0, client_dependencies_1.getPackageManager)(), " add ").concat(library, "@latest"))];
                                        case 2:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            });
                        },
                        requestUserPermissionToUpdateLib: function (library, version, minVersion) {
                            return __awaiter(this, void 0, void 0, function () {
                                var updateVersion;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, (0, prompts_1.confirm)({
                                                message: (0, client_dependencies_1.getUpdateLibraryVersionMessage)(version, minVersion, library),
                                                default: true,
                                            })];
                                        case 1:
                                            updateVersion = _a.sent();
                                            return [2 /*return*/, updateVersion];
                                    }
                                });
                            });
                        },
                    })];
            case 1:
                _a.sent();
                return [4 /*yield*/, (0, client_dependencies_1.checkTsConfig)({
                        getCurrentConfig: function () {
                            return __awaiter(this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    if (!fs_1.default.existsSync("".concat(process.cwd(), "/tsconfig.json"))) {
                                        return [2 /*return*/, undefined];
                                    }
                                    return [2 /*return*/, fs_1.default.readFileSync("".concat(process.cwd(), "/tsconfig.json")).toString()];
                                });
                            });
                        },
                        requestUserPermissionToCreateTsConfig: function () {
                            return __awaiter(this, void 0, void 0, function () {
                                var createTsConfig;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, (0, prompts_1.confirm)({
                                                message: 'tsconfig.json does not exist. Do you want to create it?',
                                                default: true,
                                            })];
                                        case 1:
                                            createTsConfig = _a.sent();
                                            return [2 /*return*/, createTsConfig];
                                    }
                                });
                            });
                        },
                        requestUserPermissionToUpdateTsConfig: function () {
                            return __awaiter(this, void 0, void 0, function () {
                                var updateTsConfig;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, (0, prompts_1.confirm)({
                                                message: 'tsconfig.json does not have esModuleInterop set to true. Do you want to update it?',
                                                default: true,
                                            })];
                                        case 1:
                                            updateTsConfig = _a.sent();
                                            return [2 /*return*/, updateTsConfig];
                                    }
                                });
                            });
                        },
                        saveTsConfig: function (tsConfig) {
                            return __awaiter(this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    fs_1.default.writeFileSync("".concat(process.cwd(), "/tsconfig.json"), tsConfig);
                                    return [2 /*return*/];
                                });
                            });
                        },
                    })];
            case 2:
                _a.sent();
                shelljs_1.default.exec("".concat((0, client_dependencies_1.getPackageManager)(), " install"));
                return [2 /*return*/];
        }
    });
}); };
var getPackageJson = function () {
    var packageJson;
    try {
        packageJson = fs_1.default.readFileSync("".concat(process.cwd(), "/package.json"));
    }
    catch (error) {
        throw new Error("Failed to open package.json file, details: ".concat(error.message));
    }
    try {
        var contents = JSON.parse(packageJson.toString());
        return contents;
    }
    catch (error) {
        throw new Error('package.json file contains JSON syntax errors, please fix and try again.');
    }
};
exports.default = setup;
