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
exports.syncDeployables = void 0;
var fs_1 = require("fs");
var lodash_1 = require("lodash");
var deployables_1 = require("../deployables");
var api_1 = require("../api");
var DEPLOY_ORDER = [
    'server-function',
    'client-function',
    'webhook',
];
var removeDeployable = function (deployable) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, instance, instance, webhook;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = deployable.type;
                switch (_a) {
                    case 'server-function': return [3 /*break*/, 1];
                    case 'client-function': return [3 /*break*/, 4];
                    case 'webhook': return [3 /*break*/, 7];
                }
                return [3 /*break*/, 10];
            case 1: return [4 /*yield*/, (0, api_1.getServerFunctionByName)(deployable.context, deployable.name)];
            case 2:
                instance = _b.sent();
                if (!instance)
                    return [2 /*return*/, false];
                return [4 /*yield*/, (0, api_1.deleteServerFunction)(instance.id)];
            case 3:
                _b.sent();
                return [2 /*return*/, true];
            case 4: return [4 /*yield*/, (0, api_1.getClientFunctionByName)(deployable.context, deployable.name)];
            case 5:
                instance = _b.sent();
                if (!instance)
                    return [2 /*return*/, false];
                return [4 /*yield*/, (0, api_1.deleteClientFunction)(instance.id)];
            case 6:
                _b.sent();
                return [2 /*return*/, true];
            case 7: return [4 /*yield*/, (0, api_1.getWebhookByName)(deployable.context, deployable.name)];
            case 8:
                webhook = _b.sent();
                if (!webhook)
                    return [2 /*return*/, false];
                return [4 /*yield*/, (0, api_1.deleteWebhook)(webhook.id)];
            case 9:
                _b.sent();
                return [2 /*return*/, true];
            case 10: return [2 /*return*/, false];
        }
    });
}); };
var syncDeployableAndGetId = function (deployable, code) { return __awaiter(void 0, void 0, void 0, function () {
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = deployable.type;
                switch (_a) {
                    case 'server-function': return [3 /*break*/, 1];
                    case 'client-function': return [3 /*break*/, 3];
                    case 'webhook': return [3 /*break*/, 5];
                }
                return [3 /*break*/, 7];
            case 1: return [4 /*yield*/, (0, api_1.createOrUpdateServerFunction)(deployable.context, deployable.name, deployable.description, code, deployable.typeSchemas, deployable.dependencies, deployable.config)];
            case 2: return [2 /*return*/, (_b.sent()).id];
            case 3: return [4 /*yield*/, (0, api_1.createOrUpdateClientFunction)(deployable.context, deployable.name, deployable.description, code, deployable.typeSchemas, deployable.config)];
            case 4: return [2 /*return*/, (_b.sent()).id];
            case 5: return [4 /*yield*/, (0, api_1.createOrUpdateWebhook)(deployable.context, deployable.name, deployable.description, deployable.config)];
            case 6: return [2 /*return*/, (_b.sent()).id];
            case 7: throw new Error("Unsupported deployable type: '".concat(deployable.type, "'"));
        }
    });
}); };
var syncDeployable = function (deployable) { return __awaiter(void 0, void 0, void 0, function () {
    var code, id;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                code = fs_1.default.readFileSync(deployable.file, 'utf8');
                return [4 /*yield*/, syncDeployableAndGetId(deployable, code)];
            case 1:
                id = _a.sent();
                return [2 /*return*/, {
                        name: deployable.name,
                        context: deployable.context,
                        instance: deployable.instance,
                        type: deployable.type,
                        id: id,
                        deployed: new Date().toISOString(),
                        fileRevision: deployable.fileRevision,
                    }];
        }
    });
}); };
var syncDeployables = function (dryRun, instance) {
    if (instance === void 0) { instance = process.env.POLY_API_BASE_URL; }
    return __awaiter(void 0, void 0, void 0, function () {
        var gitRevision, allDeployables, toRemove, groupedDeployables, _i, DEPLOY_ORDER_1, type, deployables, _loop_1, _a, deployables_2, deployable;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, deployables_1.prepareDeployableDirectory)()];
                case 1:
                    _d.sent();
                    return [4 /*yield*/, (0, deployables_1.getCacheDeploymentsRevision)()];
                case 2:
                    gitRevision = _d.sent();
                    return [4 /*yield*/, (0, deployables_1.loadDeployableRecords)()];
                case 3:
                    allDeployables = _d.sent();
                    toRemove = [];
                    if (!allDeployables.length) {
                        console.log('No deployables found. Skipping sync.');
                        return [2 /*return*/];
                    }
                    groupedDeployables = (0, lodash_1.groupBy)(allDeployables, 'type');
                    _i = 0, DEPLOY_ORDER_1 = DEPLOY_ORDER;
                    _d.label = 4;
                case 4:
                    if (!(_i < DEPLOY_ORDER_1.length)) return [3 /*break*/, 9];
                    type = DEPLOY_ORDER_1[_i];
                    deployables = groupedDeployables[type] || [];
                    _loop_1 = function (deployable) {
                        var previousDeployment, gitRevisionChanged, fileRevisionChanged, action, syncDeployment, deployment, found, removeIndex;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    previousDeployment = deployable.deployments.find(function (i) { return i.instance === instance; });
                                    gitRevisionChanged = gitRevision !== deployable.gitRevision;
                                    fileRevisionChanged = (previousDeployment === null || previousDeployment === void 0 ? void 0 : previousDeployment.fileRevision) !== deployable.fileRevision;
                                    action = gitRevisionChanged
                                        ? 'REMOVED'
                                        : !(previousDeployment === null || previousDeployment === void 0 ? void 0 : previousDeployment.id)
                                            ? 'ADDED'
                                            : fileRevisionChanged
                                                ? 'UPDATED'
                                                : 'OK';
                                    if (!(!dryRun && (gitRevisionChanged || fileRevisionChanged))) return [3 /*break*/, 6];
                                    if (!(previousDeployment && deployable.type !== previousDeployment.type)) return [3 /*break*/, 2];
                                    return [4 /*yield*/, removeDeployable(previousDeployment)];
                                case 1:
                                    _e.sent();
                                    _e.label = 2;
                                case 2:
                                    syncDeployment = __assign(__assign(__assign({}, deployable), previousDeployment), { type: deployable.type, description: (_b = deployable.description) !== null && _b !== void 0 ? _b : (_c = deployable.types) === null || _c === void 0 ? void 0 : _c.description, instance: instance });
                                    if (!(gitRevision === deployable.gitRevision)) return [3 /*break*/, 4];
                                    return [4 /*yield*/, syncDeployable(syncDeployment)];
                                case 3:
                                    deployment = _e.sent();
                                    if (previousDeployment) {
                                        previousDeployment.id = deployment.id;
                                        previousDeployment.context = deployment.context;
                                        previousDeployment.name = deployment.name;
                                        previousDeployment.type = deployment.type;
                                        previousDeployment.deployed = deployment.deployed;
                                        previousDeployment.fileRevision = deployment.fileRevision;
                                    }
                                    else {
                                        deployable.deployments.unshift(deployment);
                                    }
                                    return [3 /*break*/, 6];
                                case 4: return [4 /*yield*/, removeDeployable(syncDeployment)];
                                case 5:
                                    found = _e.sent();
                                    if (!found)
                                        action = 'NOT FOUND';
                                    removeIndex = allDeployables.findIndex(function (d) { return d.name === deployable.name && d.context === deployable.context && d.file === deployable.file; });
                                    toRemove.push.apply(toRemove, allDeployables.splice(removeIndex, 1));
                                    _e.label = 6;
                                case 6:
                                    console.log("".concat(dryRun ? 'Would sync' : 'Synced', " ").concat(deployable.type.replaceAll('-', ' '), " ").concat(deployable.context, ".").concat(deployable.name, ": ").concat(dryRun ? 'TO BE ' : '').concat(action));
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _a = 0, deployables_2 = deployables;
                    _d.label = 5;
                case 5:
                    if (!(_a < deployables_2.length)) return [3 /*break*/, 8];
                    deployable = deployables_2[_a];
                    return [5 /*yield**/, _loop_1(deployable)];
                case 6:
                    _d.sent();
                    _d.label = 7;
                case 7:
                    _a++;
                    return [3 /*break*/, 5];
                case 8:
                    _i++;
                    return [3 /*break*/, 4];
                case 9:
                    if (dryRun)
                        return [2 /*return*/];
                    return [4 /*yield*/, Promise.all(allDeployables.map(function (deployable) { return (0, deployables_1.writeUpdatedDeployable)(deployable, true); }))];
                case 10:
                    _d.sent();
                    return [4 /*yield*/, (0, deployables_1.saveDeployableRecords)(allDeployables)];
                case 11:
                    _d.sent();
                    if (!toRemove.length) return [3 /*break*/, 13];
                    return [4 /*yield*/, (0, deployables_1.removeDeployableRecords)(toRemove)];
                case 12:
                    _d.sent();
                    _d.label = 13;
                case 13: return [2 /*return*/];
            }
        });
    });
};
exports.syncDeployables = syncDeployables;
