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
exports.create = void 0;
var shelljs_1 = require("shelljs");
var prompts_1 = require("@inquirer/prompts");
var chalk_1 = require("chalk");
var api_1 = require("../api");
var config_1 = require("../config");
var child_process_1 = require("child_process");
var util_1 = require("util");
var isEmail_1 = require("validator/lib/isEmail");
var exec = (0, util_1.promisify)(child_process_1.exec);
var create = function (instance, loadedTenantSignUp) {
    if (loadedTenantSignUp === void 0) { loadedTenantSignUp = null; }
    return __awaiter(void 0, void 0, void 0, function () {
        var tenantSignUp, credentials, email, tenantName, requestEmail, requestTenant, signUp, err_1, verifyTenant, error_1, generate, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    tenantSignUp = loadedTenantSignUp;
                    credentials = null;
                    email = '';
                    tenantName = null;
                    requestEmail = function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, (0, prompts_1.input)({
                                        message: 'Enter your email:',
                                        transformer: function (value) { return value.trim(); },
                                        validate: function (email) {
                                            if (typeof email !== 'string' || !(0, isEmail_1.default)(email)) {
                                                return 'Given email is not valid. Enter a valid email.';
                                            }
                                            return true;
                                        },
                                    })];
                                case 1:
                                    email = _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); };
                    requestTenant = function () { return __awaiter(void 0, void 0, void 0, function () {
                        var result;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, (0, prompts_1.input)({
                                        message: 'Enter your desired tenant name (optional):',
                                        transformer: function (value) { return value.trim(); },
                                    })];
                                case 1:
                                    result = _a.sent();
                                    tenantName = result || null;
                                    return [2 /*return*/];
                            }
                        });
                    }); };
                    signUp = function (data) {
                        if (data === void 0) { data = ''; }
                        return __awaiter(void 0, void 0, void 0, function () {
                            var acceptedTos, response, error_3;
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        _b.trys.push([0, 8, , 9]);
                                        if (!(data === 'tenant')) return [3 /*break*/, 2];
                                        return [4 /*yield*/, requestTenant()];
                                    case 1:
                                        _b.sent();
                                        return [3 /*break*/, 6];
                                    case 2: return [4 /*yield*/, requestEmail()];
                                    case 3:
                                        _b.sent();
                                        return [4 /*yield*/, requestTenant()];
                                    case 4:
                                        _b.sent();
                                        return [4 /*yield*/, (0, prompts_1.confirm)({
                                                message: 'Do you agree with our terms of service expressed here: https://polyapi.io/terms-of-service ?',
                                            })];
                                    case 5:
                                        acceptedTos = _b.sent();
                                        if (!acceptedTos) {
                                            return [2 /*return*/, false];
                                        }
                                        _b.label = 6;
                                    case 6:
                                        shelljs_1.default.echo('-n', '\n\nChecking email and tenant name...\n\n');
                                        return [4 /*yield*/, (0, api_1.createTenantSignUp)(instance, email, tenantName)];
                                    case 7:
                                        response = _b.sent();
                                        tenantSignUp = response;
                                        return [3 /*break*/, 9];
                                    case 8:
                                        error_3 = _b.sent();
                                        shelljs_1.default.echo(chalk_1.default.red('ERROR\n'));
                                        if (((_a = error_3.response) === null || _a === void 0 ? void 0 : _a.status) === 409) {
                                            if (error_3.response.data.code === 'TENANT_ALREADY_EXISTS') {
                                                shelljs_1.default.echo('Tenant already in use.\n');
                                                return [2 /*return*/, signUp('tenant')];
                                            }
                                            else if (error_3.response.data.code === 'EMAIL_ALREADY_EXISTS') {
                                                shelljs_1.default.echo('Email already in use.\n');
                                                return [2 /*return*/, signUp()];
                                            }
                                        }
                                        shelljs_1.default.echo('Error during sign up process.\n');
                                        throw error_3;
                                    case 9: return [2 /*return*/, true];
                                }
                            });
                        });
                    };
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, signUp()];
                case 2:
                    if (!(_a.sent())) {
                        return [2 /*return*/];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _a.sent();
                    return [2 /*return*/];
                case 4:
                    verifyTenant = function (showDescription) {
                        if (showDescription === void 0) { showDescription = true; }
                        return __awaiter(void 0, void 0, void 0, function () {
                            var code, error_4, response, error_5;
                            var _a, _b, _c, _d, _e, _f, _g;
                            return __generator(this, function (_h) {
                                switch (_h.label) {
                                    case 0:
                                        if (showDescription) {
                                            shelljs_1.default.echo('A verification code has been sent to your email address', chalk_1.default.bold("(".concat(tenantSignUp.email, "),")), 'check your email and enter your verification code. \nIf you didn\'t receive your verification code you can enter', chalk_1.default.bold('resend'), 'to send it again\n');
                                        }
                                        return [4 /*yield*/, (0, prompts_1.input)({
                                                message: 'Enter your verification code:',
                                                transformer: function (value) { return value.trim(); },
                                                validate: function (verificationCode) { return !!verificationCode.length; },
                                            })];
                                    case 1:
                                        code = _h.sent();
                                        if (!(code === 'resend')) return [3 /*break*/, 6];
                                        _h.label = 2;
                                    case 2:
                                        _h.trys.push([2, 4, , 5]);
                                        shelljs_1.default.echo('\n\nResending your verification code...\n');
                                        return [4 /*yield*/, (0, api_1.resendVerificationCode)(instance, tenantSignUp.email)];
                                    case 3:
                                        _h.sent();
                                        return [3 /*break*/, 5];
                                    case 4:
                                        error_4 = _h.sent();
                                        shelljs_1.default.echo(chalk_1.default.red('ERROR\n'));
                                        shelljs_1.default.echo('Error sending verification code to', "".concat(chalk_1.default.bold(tenantSignUp.email), "."), '\n');
                                        throw error_4;
                                    case 5: return [2 /*return*/, verifyTenant(false)];
                                    case 6:
                                        shelljs_1.default.echo('-n', 'Verifying your code...\n\n');
                                        _h.label = 7;
                                    case 7:
                                        _h.trys.push([7, 9, , 13]);
                                        return [4 /*yield*/, (0, api_1.verifyTenantSignUp)(instance, tenantSignUp.email, code)];
                                    case 8:
                                        response = _h.sent();
                                        shelljs_1.default.echo(chalk_1.default.green('Tenant created successfully, details:\n'));
                                        shelljs_1.default.echo(chalk_1.default.bold('Instance url:'), response.apiBaseUrl, '\n');
                                        shelljs_1.default.echo(chalk_1.default.bold('Admin polyApiKey:'), response.apiKey, '\n');
                                        credentials = {
                                            apiBaseUrl: response.apiBaseUrl,
                                            apiKey: response.apiKey,
                                        };
                                        return [3 /*break*/, 13];
                                    case 9:
                                        error_5 = _h.sent();
                                        shelljs_1.default.echo(chalk_1.default.red('ERROR\n'));
                                        if (!(((_a = error_5.response) === null || _a === void 0 ? void 0 : _a.status) === 409)) return [3 /*break*/, 12];
                                        if (((_c = (_b = error_5.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.code) === 'INVALID_VERIFICATION_CODE') {
                                            shelljs_1.default.echo('Wrong verification code. If you didn\'t receive your verification code, you can type', chalk_1.default.bold('resend'), 'to send a new one.');
                                        }
                                        if (((_e = (_d = error_5.response) === null || _d === void 0 ? void 0 : _d.data) === null || _e === void 0 ? void 0 : _e.code) === 'EXPIRED_VERIFICATION_CODE') {
                                            shelljs_1.default.echo('Verification code has expired.\n');
                                            return [2 /*return*/, verifyTenant()];
                                        }
                                        if (!(((_g = (_f = error_5.response) === null || _f === void 0 ? void 0 : _f.data) === null || _g === void 0 ? void 0 : _g.code) === 'TENANT_ALREADY_EXISTS')) return [3 /*break*/, 11];
                                        shelljs_1.default.echo('Tenant already in use.\n');
                                        return [4 /*yield*/, signUp('tenant')];
                                    case 10:
                                        _h.sent();
                                        return [2 /*return*/, verifyTenant()];
                                    case 11: return [2 /*return*/, verifyTenant()];
                                    case 12:
                                        shelljs_1.default.echo('Error during sign up process.\n');
                                        throw error_5;
                                    case 13: return [2 /*return*/, true];
                                }
                            });
                        });
                    };
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, verifyTenant()];
                case 6:
                    if (!(_a.sent())) {
                        return [2 /*return*/];
                    }
                    return [3 /*break*/, 8];
                case 7:
                    error_1 = _a.sent();
                    return [2 /*return*/];
                case 8: return [4 /*yield*/, (0, prompts_1.confirm)({
                        message: 'Would you like to generate the poly client library using the new tenant key?',
                    })];
                case 9:
                    generate = _a.sent();
                    if (!generate) return [3 /*break*/, 13];
                    (0, config_1.saveConfig)(undefined, {
                        POLY_API_BASE_URL: credentials.apiBaseUrl,
                        POLY_API_KEY: credentials.apiKey,
                    });
                    _a.label = 10;
                case 10:
                    _a.trys.push([10, 12, , 13]);
                    shelljs_1.default.echo('Generating your poly client library...\n');
                    return [4 /*yield*/, exec('npx poly generate')];
                case 11:
                    _a.sent();
                    shelljs_1.default.echo(chalk_1.default.green('Poly client library generated.'));
                    return [3 /*break*/, 13];
                case 12:
                    error_2 = _a.sent();
                    shelljs_1.default.echo(chalk_1.default.red('ERROR\n'));
                    shelljs_1.default.echo('Error generating your poly client library.');
                    return [3 /*break*/, 13];
                case 13: return [2 /*return*/];
            }
        });
    });
};
exports.create = create;
