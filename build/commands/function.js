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
exports.addOrUpdateCustomFunction = void 0;
/* eslint-disable @typescript-eslint/ban-ts-comment */
var fs_1 = require("fs");
var chalk_1 = require("chalk");
var shelljs_1 = require("shelljs");
var api_1 = require("../api");
var config_1 = require("../config");
var generate_1 = require("./generate");
var transpiler_1 = require("../transpiler");
var deployables_1 = require("../deployables");
var addOrUpdateCustomFunction = function (polyPath, context, name, description, file, server, logsEnabled, generateContexts, executionApiKey) { return __awaiter(void 0, void 0, void 0, function () {
    var code, tsConfigBaseUrl, customFunction, specs, functionSpec, updating, typeSchemas, dependencies, other, traceId, e_1;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                (0, config_1.loadConfig)(polyPath);
                code = '';
                try {
                    code = fs_1.default.readFileSync(file, 'utf8');
                }
                catch (err) {
                    // Handle various file-system related issues, or silly errors like the file not existing
                    shelljs_1.default.echo(chalk_1.default.redBright('ERROR:'), err);
                    return [2 /*return*/];
                }
                tsConfigBaseUrl = (0, transpiler_1.getTSBaseUrl)();
                _c.label = 1;
            case 1:
                _c.trys.push([1, 8, , 9]);
                customFunction = void 0;
                return [4 /*yield*/, (0, api_1.getSpecs)([context], [name])];
            case 2:
                specs = _c.sent();
                functionSpec = specs.find(function (spec) { return spec.name === name && spec.context === context; });
                updating = !!functionSpec;
                if (server === undefined && updating) {
                    server = functionSpec.type === 'serverFunction';
                }
                else {
                    server = server !== null && server !== void 0 ? server : false;
                }
                typeSchemas = (0, transpiler_1.generateTypeSchemas)(file, tsConfigBaseUrl, deployables_1.DeployableTypeEntries.map(function (d) { return d[0]; }));
                if (!server) return [3 /*break*/, 4];
                shelljs_1.default.echo('-n', "".concat(updating ? 'Updating' : 'Adding', " custom server side function..."));
                dependencies = (0, transpiler_1.getDependencies)(code, file, tsConfigBaseUrl);
                if (dependencies.length) {
                    shelljs_1.default.echo(chalk_1.default.yellow('Please note that deploying your functions will take a few minutes because it makes use of libraries other than polyapi.'));
                }
                other = {};
                if (generateContexts)
                    other.generateContexts = generateContexts.split(',');
                if (logsEnabled !== undefined)
                    other.logsEnabled = logsEnabled;
                return [4 /*yield*/, (0, api_1.createOrUpdateServerFunction)(context, name, description, code, typeSchemas, dependencies, other, executionApiKey)];
            case 3:
                customFunction = _c.sent();
                traceId = customFunction.traceId;
                if (traceId) {
                    shelljs_1.default.echo(chalk_1.default.yellow('\nWarning:'), 'Failed to generate descriptions while deploying the server function, trace id:', chalk_1.default.bold(traceId));
                }
                shelljs_1.default.echo(chalk_1.default.green('DEPLOYED'));
                shelljs_1.default.echo("Function ID: ".concat(customFunction.id));
                return [3 /*break*/, 6];
            case 4:
                shelljs_1.default.echo('-n', "".concat(updating ? 'Updating' : 'Adding', " Client Function to PolyAPI Catalog..."));
                return [4 /*yield*/, (0, api_1.createOrUpdateClientFunction)(context, name, description, code, typeSchemas)];
            case 5:
                customFunction = _c.sent();
                shelljs_1.default.echo(chalk_1.default.green('DONE'));
                shelljs_1.default.echo("Client Function ID: ".concat(customFunction.id));
                _c.label = 6;
            case 6: return [4 /*yield*/, (0, generate_1.generateSingleCustomFunction)(polyPath, customFunction.id, updating)];
            case 7:
                _c.sent();
                return [3 /*break*/, 9];
            case 8:
                e_1 = _c.sent();
                shelljs_1.default.echo(chalk_1.default.red('ERROR\n'));
                shelljs_1.default.echo("".concat(((_b = (_a = e_1.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) || e_1.message));
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/];
        }
    });
}); };
exports.addOrUpdateCustomFunction = addOrUpdateCustomFunction;
