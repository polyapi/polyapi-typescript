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
exports.prepareDeployables = void 0;
var shelljs_1 = require("shelljs");
var transpiler_1 = require("../transpiler");
var deployables_1 = require("../deployables");
var api_1 = require("../api");
var getFunctionDescription = function (type, description, args, code) {
    return type === 'server-function'
        ? (0, api_1.getServerFunctionDescription)({ description: description, arguments: args, code: code })
        : (0, api_1.getClientFunctionDescription)({ description: description, arguments: args, code: code });
};
var fillInMissingFunctionDetails = function (deployable, code) { return __awaiter(void 0, void 0, void 0, function () {
    var isMissingDescriptions, aiGenerated_1, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                isMissingDescriptions = !deployable.types.description ||
                    !deployable.types.returns.description ||
                    deployable.types.params.some(function (p) { return !p.description; });
                if (!isMissingDescriptions) return [3 /*break*/, 4];
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, getFunctionDescription(deployable.type, deployable.types.description, deployable.types.params.map(function (p) { return (__assign(__assign({}, p), { key: p.name })); }), code)];
            case 2:
                aiGenerated_1 = _b.sent();
                if (!deployable.types.description && aiGenerated_1.description) {
                    deployable.types.description = aiGenerated_1.description;
                    deployable.dirty = true;
                }
                deployable.types.params = deployable.types.params.map(function (p) {
                    if (p.description)
                        return p;
                    var aiArg = aiGenerated_1.arguments.find(function (a) { return a.name === p.name; });
                    if (!aiArg || !aiArg.description)
                        return p;
                    deployable.dirty = true;
                    return __assign(__assign({}, p), { description: aiArg.description });
                });
                return [3 /*break*/, 4];
            case 3:
                _a = _b.sent();
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/, deployable];
        }
    });
}); };
var fillInMissingDetails = function (deployable, code) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (deployable.type) {
            case 'server-function':
            case 'client-function':
                return [2 /*return*/, fillInMissingFunctionDetails(deployable, code)];
        }
        throw new Error("Unsupported deployable type: '".concat(deployable.type, "'"));
    });
}); };
var getAllDeployables = function (disableDocs, disableAi, gitRevision) { return __awaiter(void 0, void 0, void 0, function () {
    var baseUrl, possibleDeployables, found, _i, possibleDeployables_1, possible, _a, deployable, code, fullName, _b, _c, _d, _e, err_1;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                console.log('Searching for poly deployables.');
                baseUrl = (0, transpiler_1.getTSBaseUrl)() || '.';
                possibleDeployables = (0, deployables_1.getAllDeployableFiles)({ includeDirs: [baseUrl] });
                console.log("Found ".concat(possibleDeployables.length, " possible deployable file").concat(possibleDeployables.length === 1 ? '' : 's', "."));
                found = new Map();
                _i = 0, possibleDeployables_1 = possibleDeployables;
                _f.label = 1;
            case 1:
                if (!(_i < possibleDeployables_1.length)) return [3 /*break*/, 11];
                possible = possibleDeployables_1[_i];
                _f.label = 2;
            case 2:
                _f.trys.push([2, 9, , 10]);
                return [4 /*yield*/, (0, transpiler_1.parseDeployable)(possible, baseUrl, gitRevision)];
            case 3:
                _a = _f.sent(), deployable = _a[0], code = _a[1];
                fullName = "".concat(deployable.context, ".").concat(deployable.name);
                if (!found.has(fullName)) return [3 /*break*/, 4];
                console.error("Prepared ".concat(deployable.type.replaceAll('-', ' '), " ").concat(fullName, ": DUPLICATE"));
                return [3 /*break*/, 8];
            case 4:
                _c = (_b = found).set;
                _d = [fullName];
                if (!(disableAi || deployable.disableAi || deployable.type === 'webhook')) return [3 /*break*/, 5];
                _e = deployable;
                return [3 /*break*/, 7];
            case 5: return [4 /*yield*/, fillInMissingDetails(deployable, code)];
            case 6:
                _e = _f.sent();
                _f.label = 7;
            case 7:
                _c.apply(_b, _d.concat([_e]));
                console.log("Prepared ".concat(deployable.type.replaceAll('-', ' '), " ").concat(fullName, ": ").concat(deployable.dirty && !disableDocs ? 'UPDATED' : 'OK'));
                _f.label = 8;
            case 8: return [3 /*break*/, 10];
            case 9:
                err_1 = _f.sent();
                console.error("ERROR parsing ".concat(possible));
                console.error(err_1);
                return [3 /*break*/, 10];
            case 10:
                _i++;
                return [3 /*break*/, 1];
            case 11: return [2 /*return*/, Array.from(found.values())];
        }
    });
}); };
var prepareDeployables = function (lazy, disableDocs, disableAi) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, gitRevision, parsedDeployables, dirtyDeployables;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = lazy;
                if (!_a) return [3 /*break*/, 2];
                return [4 /*yield*/, (0, deployables_1.isCacheUpToDate)()];
            case 1:
                _a = (_b.sent());
                _b.label = 2;
            case 2:
                if (_a) {
                    console.log('Poly deployments are prepared.');
                    return [2 /*return*/];
                }
                shelljs_1.default.echo('Preparing Poly deployments...');
                return [4 /*yield*/, (0, deployables_1.prepareDeployableDirectory)()];
            case 3:
                _b.sent();
                gitRevision = (0, deployables_1.getGitRevision)();
                return [4 /*yield*/, getAllDeployables(disableDocs, disableAi, gitRevision)];
            case 4:
                parsedDeployables = _b.sent();
                if (!parsedDeployables.length) {
                    console.warn('No deployable files found. Did you define a `polyConfig` within your deployment?');
                    return [2 /*return*/, process.exit(1)];
                }
                dirtyDeployables = parsedDeployables.filter(function (d) { return !!d.dirty; });
                if (!dirtyDeployables.length) return [3 /*break*/, 6];
                // Write back deployables files with updated comments
                console.log("Fixing ".concat(dirtyDeployables.length, " deployable file").concat(dirtyDeployables.length === 1 ? '' : 's', "."));
                // NOTE: writeUpdatedDeployable has side effects that update deployable.fileRevision which is in both this list and parsedDeployables
                return [4 /*yield*/, Promise.all(dirtyDeployables.map(function (deployable) { return (0, deployables_1.writeUpdatedDeployable)(deployable, disableDocs); }))];
            case 5:
                // NOTE: writeUpdatedDeployable has side effects that update deployable.fileRevision which is in both this list and parsedDeployables
                _b.sent();
                _b.label = 6;
            case 6:
                console.log('Poly deployments are prepared.');
                return [4 /*yield*/, (0, deployables_1.saveDeployableRecords)(parsedDeployables)];
            case 7:
                _b.sent();
                return [4 /*yield*/, (0, deployables_1.writeCacheRevision)(gitRevision)];
            case 8:
                _b.sent();
                console.log('Cached deployables and generated typedefs into node_modules/.poly/deployables directory.');
                return [2 /*return*/];
        }
    });
}); };
exports.prepareDeployables = prepareDeployables;
