"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.validateModel = void 0;
var shelljs_1 = require("shelljs");
var fs_1 = require("fs");
var chalk_1 = require("chalk");
var util_1 = require("util");
var lodash_1 = require("lodash");
var api_1 = require("../../api");
var readFile = (0, util_1.promisify)(fs_1.default.readFile);
var DuplicatedIdentifierError = /** @class */ (function (_super) {
    __extends(DuplicatedIdentifierError, _super);
    function DuplicatedIdentifierError(identifier) {
        var _this = _super.call(this, 'Duplicated name and context') || this;
        _this.identifier = identifier;
        return _this;
    }
    return DuplicatedIdentifierError;
}(Error));
var getDuplicatedIdentifier = function (apiFunctions) {
    for (var i = 0; i < apiFunctions.length; i++) {
        var firstApiFunction = apiFunctions[i];
        for (var c = 0; c < apiFunctions.length; c++) {
            var secondApiFunction = apiFunctions[c];
            if (firstApiFunction.name && firstApiFunction.context === secondApiFunction.context && firstApiFunction.name === secondApiFunction.name && c !== i) {
                return firstApiFunction.context ? "".concat(firstApiFunction.context, ".").concat(firstApiFunction.name) : firstApiFunction.name;
            }
        }
    }
    return null;
};
var validateModel = function (path) { return __awaiter(void 0, void 0, void 0, function () {
    var contents, error_1, specificationInput, duplicatedIdentifier, chunkSize, apiFunctionChunks, _i, apiFunctionChunks_1, apiFunctionsChunk, _a, apiFunctionsChunk_1, apiFunction, duplicatedIdentifier, chunkSize, webhookHandleChunks, _b, webhookHandleChunks_1, webhookHandleChunk, _c, webhookHandleChunk_1, webhookHandle, error_2;
    var _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                shelljs_1.default.echo('Validating poly specification input...');
                contents = '';
                _f.label = 1;
            case 1:
                _f.trys.push([1, 3, , 4]);
                return [4 /*yield*/, readFile(path, { encoding: 'utf-8' })];
            case 2:
                contents = _f.sent();
                return [3 /*break*/, 4];
            case 3:
                error_1 = _f.sent();
                throw new Error('File does not exist.');
            case 4:
                _f.trys.push([4, 17, , 18]);
                specificationInput = JSON.parse(contents);
                if (!('functions' in specificationInput) && !('webhooks' in specificationInput)) {
                    throw new Error('Expected specification to contain "webhooks" and/or "functions", but found neither.');
                }
                if (!('functions' in specificationInput)) return [3 /*break*/, 10];
                duplicatedIdentifier = getDuplicatedIdentifier(specificationInput.functions);
                if (duplicatedIdentifier) {
                    throw new DuplicatedIdentifierError(duplicatedIdentifier);
                }
                chunkSize = 5;
                apiFunctionChunks = (0, lodash_1.chunk)(specificationInput.functions, chunkSize);
                _i = 0, apiFunctionChunks_1 = apiFunctionChunks;
                _f.label = 5;
            case 5:
                if (!(_i < apiFunctionChunks_1.length)) return [3 /*break*/, 10];
                apiFunctionsChunk = apiFunctionChunks_1[_i];
                _a = 0, apiFunctionsChunk_1 = apiFunctionsChunk;
                _f.label = 6;
            case 6:
                if (!(_a < apiFunctionsChunk_1.length)) return [3 /*break*/, 9];
                apiFunction = apiFunctionsChunk_1[_a];
                return [4 /*yield*/, (0, api_1.validateApiFunctionDto)(apiFunction)];
            case 7:
                _f.sent();
                _f.label = 8;
            case 8:
                _a++;
                return [3 /*break*/, 6];
            case 9:
                _i++;
                return [3 /*break*/, 5];
            case 10:
                if (!('webhooks' in specificationInput)) return [3 /*break*/, 16];
                duplicatedIdentifier = getDuplicatedIdentifier(specificationInput.webhooks);
                if (duplicatedIdentifier) {
                    throw new DuplicatedIdentifierError(duplicatedIdentifier);
                }
                chunkSize = 5;
                webhookHandleChunks = (0, lodash_1.chunk)(specificationInput.webhooks, chunkSize);
                _b = 0, webhookHandleChunks_1 = webhookHandleChunks;
                _f.label = 11;
            case 11:
                if (!(_b < webhookHandleChunks_1.length)) return [3 /*break*/, 16];
                webhookHandleChunk = webhookHandleChunks_1[_b];
                _c = 0, webhookHandleChunk_1 = webhookHandleChunk;
                _f.label = 12;
            case 12:
                if (!(_c < webhookHandleChunk_1.length)) return [3 /*break*/, 15];
                webhookHandle = webhookHandleChunk_1[_c];
                return [4 /*yield*/, (0, api_1.validateWebhookHandleDto)(webhookHandle)];
            case 13:
                _f.sent();
                _f.label = 14;
            case 14:
                _c++;
                return [3 /*break*/, 12];
            case 15:
                _b++;
                return [3 /*break*/, 11];
            case 16:
                shelljs_1.default.echo(chalk_1.default.green('Poly specification input is valid.'));
                return [3 /*break*/, 18];
            case 17:
                error_2 = _f.sent();
                if (error_2 instanceof DuplicatedIdentifierError) {
                    shelljs_1.default.echo(chalk_1.default.red('Error:'), error_2.message, chalk_1.default.red(error_2.identifier));
                }
                else if (((_d = error_2.response) === null || _d === void 0 ? void 0 : _d.status) === 400) {
                    shelljs_1.default.echo(chalk_1.default.red('Error:'), (_e = error_2.response.data) === null || _e === void 0 ? void 0 : _e.message);
                }
                else {
                    shelljs_1.default.echo(chalk_1.default.red('Error:'), error_2.message);
                }
                return [3 /*break*/, 18];
            case 18: return [2 /*return*/];
        }
    });
}); };
exports.validateModel = validateModel;
