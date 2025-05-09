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
exports.writeUpdatedDeployable = exports.writeDeployComments = exports.isCacheUpToDate = exports.writeCacheRevision = exports.getCacheDeploymentsRevision = exports.getGitRevision = exports.getDeployableFileRevision = exports.getAllDeployableFiles = exports.getAllDeployableFilesLinux = exports.getAllDeployableFilesWindows = exports.removeDeployableRecords = exports.saveDeployableRecords = exports.loadDeployableRecords = exports.prepareDeployableDirectory = exports.DeployableTsTypeToName = exports.DeployableTypeEntries = exports.CACHE_DIR = exports.CACHE_VERSION_FILE = void 0;
var os_1 = require("os");
var fs_1 = require("fs");
var promises_1 = require("node:fs/promises");
var shelljs_1 = require("shelljs");
var crypto_1 = require("crypto");
exports.CACHE_VERSION_FILE = './node_modules/.poly/deployments_revision';
exports.CACHE_DIR = './node_modules/.poly/deployables';
exports.DeployableTypeEntries = [];
exports.DeployableTypeEntries.push(['PolyServerFunction', 'server-function']);
exports.DeployableTypeEntries.push(['PolyClientFunction', 'client-function']);
// DeployableTypeEntries.push(['PolyApiFunction', 'api-function']);
// DeployableTypeEntries.push(['PolyVariable', 'variable']);
exports.DeployableTypeEntries.push(['PolyWebhook', 'webhook']);
// DeployableTypeEntries.push(['PolyTrigger', 'trigger']);
exports.DeployableTsTypeToName = Object.fromEntries(exports.DeployableTypeEntries);
var prepareDeployableDirectory = function () { return __awaiter(void 0, void 0, void 0, function () {
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                return [4 /*yield*/, (0, promises_1.mkdir)(exports.CACHE_DIR, { recursive: true })];
            case 1:
                _b.sent();
                return [3 /*break*/, 3];
            case 2:
                _a = _b.sent();
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); };
exports.prepareDeployableDirectory = prepareDeployableDirectory;
var loadDeployableRecords = function () { return __awaiter(void 0, void 0, void 0, function () {
    var cachedRecords;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, promises_1.readdir)(exports.CACHE_DIR, { withFileTypes: true })];
            case 1:
                cachedRecords = (_a.sent())
                    .filter(function (d) { return d.isFile() && d.name.endsWith('.json'); })
                    .map(function (d) { return d.name; });
                return [2 /*return*/, Promise.all(cachedRecords.map(function (name) {
                        return readJsonFile("".concat(exports.CACHE_DIR, "/").concat(name));
                    }))];
        }
    });
}); };
exports.loadDeployableRecords = loadDeployableRecords;
var saveDeployableRecords = function (records) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, Promise.all(records.map(function (record) {
                    return writeJsonFile("".concat(exports.CACHE_DIR, "/").concat(record.context, ".").concat(record.name, ".json"), record);
                }))];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); };
exports.saveDeployableRecords = saveDeployableRecords;
var removeDeployableRecords = function (records) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        shelljs_1.default.rm.apply(shelljs_1.default, __spreadArray(['-f'], records.map(function (record) { return "".concat(exports.CACHE_DIR, "/").concat(record.context, ".").concat(record.name, ".json"); }), false));
        return [2 /*return*/];
    });
}); };
exports.removeDeployableRecords = removeDeployableRecords;
var readJsonFile = function (path) { return __awaiter(void 0, void 0, void 0, function () {
    var file;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, promises_1.readFile)(path, { encoding: 'utf8' })];
            case 1:
                file = _a.sent();
                return [2 /*return*/, JSON.parse(file)];
        }
    });
}); };
var writeJsonFile = function (path, contents) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, promises_1.open)(path, 'w')];
            case 1:
                _a.sent();
                return [2 /*return*/, (0, promises_1.writeFile)(path, JSON.stringify(contents, undefined, 2), { encoding: 'utf8', flag: 'w' })];
        }
    });
}); };
var getAllDeployableFilesWindows = function (_a) {
    var typeNames = _a.typeNames, includeDirs = _a.includeDirs, includeFilesOrExtensions = _a.includeFilesOrExtensions, excludeDirs = _a.excludeDirs;
    // To get the equivalent of grep in Windows we use a combination of `dir` and `findstr`
    var includePattern = includeFilesOrExtensions.length > 0 ? includeFilesOrExtensions.map(function (f) { return f.includes('.') ? f : "*.".concat(f); }).join(' ') : '*';
    var excludePattern = excludeDirs.length > 0 ? excludeDirs.join('|') : '';
    var pattern = typeNames.length > 0
        ? typeNames.map(function (name) { return "polyConfig: ".concat(name); }).join('|')
        : 'polyConfig';
    var excludeCommand = excludePattern ? " | findstr /V /I \"".concat(excludePattern, "\"") : '';
    var searchCommand = " | findstr /M /I /F:/ /C:\"".concat(pattern, "\"");
    var result = [];
    for (var _i = 0, includeDirs_1 = includeDirs; _i < includeDirs_1.length; _i++) {
        var dir = includeDirs_1[_i];
        var dirCommand = "dir /S /P /B ".concat(includePattern, " ").concat(dir);
        var fullCommand = "".concat(dirCommand).concat(excludeCommand).concat(searchCommand);
        try {
            var output = shelljs_1.default.exec(fullCommand).toString('utf8');
            result = result.concat(output.split(/\r?\n/).filter(Boolean));
        }
        catch (_b) { }
    }
    return result;
};
exports.getAllDeployableFilesWindows = getAllDeployableFilesWindows;
var getAllDeployableFilesLinux = function (_a) {
    var typeNames = _a.typeNames, includeDirs = _a.includeDirs, includeFilesOrExtensions = _a.includeFilesOrExtensions, excludeDirs = _a.excludeDirs;
    // In Linux we can just use `grep` to find possible poly deployables
    var include = includeFilesOrExtensions.length
        ? includeFilesOrExtensions.map(function (f) {
            return "--include=".concat(f.includes('.') ? f : "*.".concat(f));
        }).join(' ')
        : '';
    var excludeDir = excludeDirs.length ? excludeDirs.map(function (dir) { return "--exclude-dir=".concat(dir); }).join(' ') : '';
    var searchPath = includeDirs.length
        ? includeDirs.join(' ')
        : '.';
    var patterns = typeNames.length > 0
        ? typeNames.map(function (name) { return "-e 'polyConfig: ".concat(name, "'"); }).join(' ')
        : '-e \'polyConfig\'';
    var grepCommand = "grep ".concat(include, " ").concat(excludeDir, " -Rl ").concat(patterns, " ").concat(searchPath);
    var output = shelljs_1.default.exec(grepCommand).toString('utf8');
    return output.split('\n').filter(Boolean);
};
exports.getAllDeployableFilesLinux = getAllDeployableFilesLinux;
var getAllDeployableFiles = function (config) {
    if (config === void 0) { config = {}; }
    config.typeNames = config.typeNames = exports.DeployableTypeEntries.map(function (p) { return p[0]; });
    config.includeDirs = config.includeDirs = ['.'];
    config.includeFilesOrExtensions = config.includeFilesOrExtensions = ['ts', 'js'];
    config.excludeDirs = config.excludeDirs = [
        'node_modules',
        'dist',
        'build',
        'output',
        '.vscode',
        '.poly',
        '.github',
        '.husky',
        '.yarn',
    ];
    var isWindows = os_1.default.platform() === 'win32';
    return isWindows
        ? (0, exports.getAllDeployableFilesWindows)(config)
        : (0, exports.getAllDeployableFilesLinux)(config);
};
exports.getAllDeployableFiles = getAllDeployableFiles;
var getDeployableFileRevision = function (fileContents) {
    return (0, crypto_1.createHash)('sha256')
        .update(
    // We want the file_revision to reflect the actual contents of the deployable
    // So trim all leading single-line comments before we hash the file
    // This prevents our deployment receipt comments from inadvertently changing the file revision
    fileContents.replace(/^(\/\/.*\n)+/, ''))
        .digest('hex')
        // Trimming to 7 characters to align with git revision format and to keep this nice and short!
        .substring(0, 7);
};
exports.getDeployableFileRevision = getDeployableFileRevision;
var getGitRevision = function (branchOrTag) {
    if (branchOrTag === void 0) { branchOrTag = 'HEAD'; }
    try {
        var result = shelljs_1.default.exec("git rev-parse --short ".concat(branchOrTag)).toString('utf8').trim();
        if (!result)
            throw new Error('Failed to get git revision.');
        return result;
    }
    catch (err) {
        console.warn('Failed to get git revision. Falling back to random hash.');
        return Array.from({ length: 8 }, function () { return Math.floor(Math.random() * 16).toString(16); }).join('');
    }
};
exports.getGitRevision = getGitRevision;
var getCacheDeploymentsRevision = function () {
    if (!(0, fs_1.existsSync)(exports.CACHE_VERSION_FILE))
        return Promise.resolve('');
    return (0, promises_1.readFile)(exports.CACHE_VERSION_FILE, {
        flag: 'r',
        encoding: 'utf8',
    });
};
exports.getCacheDeploymentsRevision = getCacheDeploymentsRevision;
var writeCacheRevision = function (gitRevision) {
    if (gitRevision === void 0) { gitRevision = (0, exports.getGitRevision)(); }
    return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, promises_1.writeFile)(exports.CACHE_VERSION_FILE, gitRevision, {
                        flag: 'w',
                        encoding: 'utf8',
                    })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
};
exports.writeCacheRevision = writeCacheRevision;
var isCacheUpToDate = function () { return __awaiter(void 0, void 0, void 0, function () {
    var cachedRevision, gitRevision;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, exports.getCacheDeploymentsRevision)()];
            case 1:
                cachedRevision = _a.sent();
                gitRevision = (0, exports.getGitRevision)();
                return [2 /*return*/, cachedRevision === gitRevision];
        }
    });
}); };
exports.isCacheUpToDate = isCacheUpToDate;
var writeDeployComments = function (deployments) {
    var _a;
    var canopyPath = ((_a = process.env.POLY_API_BASE_URL) === null || _a === void 0 ? void 0 : _a.includes('localhost'))
        ? 'polyui/collections'
        : 'canopy/polyui/collections';
    return deployments
        .map(function (d) {
        return "// Poly deployed @ ".concat(d.deployed, " - ").concat(d.context, ".").concat(d.name, " - ").concat(d.instance.endsWith(':8000') ? d.instance.replace(':8000', ':3000') : d.instance, "/").concat(canopyPath, "/").concat(d.type, "s/").concat(d.id, " - ").concat(d.fileRevision);
    }).join('\n');
};
exports.writeDeployComments = writeDeployComments;
var printJSDocFunctionComment = function (_a) {
    var description = _a.description, params = _a.params, returns = _a.returns;
    return "/**\n".concat(__spreadArray(__spreadArray(__spreadArray([], description.split('\n').filter(Boolean), true), params.map(function (p) { return "@param {".concat(p.type, "} ").concat(p.name).concat(p.description ? ' - ' : '').concat(p.description); }), true), [
        "@returns {".concat(returns.type, "} ").concat(returns.description),
    ], false).map(function (l) { return " * ".concat(l); }).join('\n'), "\n */\n");
};
var updateDeploymentComments = function (fileContent, deployable) {
    while (deployable.deploymentCommentRanges.length > 0) {
        var range = deployable.deploymentCommentRanges.pop();
        fileContent = "".concat(fileContent.substring(0, range[0])).concat(fileContent.substring(range[1]));
    }
    if (deployable.deployments.length) {
        var deploymentComments = (0, exports.writeDeployComments)(deployable.deployments);
        // +1 because of the newline character we insert afterwards
        deployable.deploymentCommentRanges.push([0, deploymentComments.length + 1]);
        // Then add deploy comments to the top
        fileContent = "".concat(deploymentComments, "\n").concat(fileContent);
    }
    return fileContent;
};
var updateDeployableFunctionComments = function (fileContent, deployable, disableDocs) {
    if (disableDocs === void 0) { disableDocs = false; }
    if (!disableDocs) {
        // First write/overwrite the JSDoc comment
        fileContent = "".concat(fileContent.substring(0, deployable.docStartIndex)).concat(printJSDocFunctionComment(deployable.types)).concat(fileContent.substring(deployable.docEndIndex));
    }
    return fileContent;
};
var writeUpdatedDeployable = function (deployable, disableDocs) {
    if (disableDocs === void 0) { disableDocs = false; }
    return __awaiter(void 0, void 0, void 0, function () {
        var fileContents;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, promises_1.readFile)(deployable.file, {
                        flag: 'r',
                        encoding: 'utf8',
                    })];
                case 1:
                    fileContents = _a.sent();
                    switch (deployable.type) {
                        case 'client-function':
                        case 'server-function': {
                            fileContents = updateDeployableFunctionComments(fileContents, deployable, disableDocs);
                            break;
                        }
                        case 'webhook':
                            break;
                        default:
                            throw new Error("Unsupported deployable type: '".concat(deployable.type, "'"));
                    }
                    // Then write/overwrite any deployment comments (must happen last to prevent the JSDoc comment ranges from breaking)
                    if (deployable.type !== 'webhook')
                        fileContents = updateDeploymentComments(fileContents, deployable);
                    return [4 /*yield*/, (0, promises_1.writeFile)(deployable.file, fileContents, {
                            flag: 'w',
                            encoding: 'utf8',
                        })];
                case 2:
                    _a.sent();
                    // Get an updated fileRevision
                    deployable.fileRevision = (0, exports.getDeployableFileRevision)(fileContents);
                    return [2 /*return*/, deployable];
            }
        });
    });
};
exports.writeUpdatedDeployable = writeUpdatedDeployable;
