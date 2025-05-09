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
exports.deleteWebhook = exports.getWebhookByName = exports.createOrUpdateWebhook = exports.getProjectTemplatesConfig = exports.getAuthData = exports.getWebhookHandleDescription = exports.upsertSnippet = exports.getApiFunctionDescription = exports.getClientFunctionDescription = exports.getServerFunctionDescription = exports.validateWebhookHandleDto = exports.validateApiFunctionDto = exports.translateSpecification = exports.upsertSchema = exports.upsertWebhookHandle = exports.upsertApiFunction = exports.getLastTos = exports.resendVerificationCode = exports.verifyTenantSignUp = exports.createTenantSignUp = exports.deleteClientFunction = exports.getClientFunctionByName = exports.createOrUpdateClientFunction = exports.deleteServerFunction = exports.getServerFunctionByName = exports.createOrUpdateServerFunction = exports.getSpecs = void 0;
var axios_1 = require("axios");
var http_proxy_agent_1 = require("http-proxy-agent");
var https_proxy_agent_1 = require("https-proxy-agent");
var https_1 = require("https");
var dotenv_1 = require("dotenv");
var utils_1 = require("@poly/common/utils");
var constants_1 = require("@poly/common/constants");
dotenv_1.default.config();
var httpProxy = process.env.HTTP_PROXY || process.env.http_proxy || process.env.npm_config_proxy;
var httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.npm_config_https_proxy;
var nodeEnv = process.env.NODE_ENV;
var isDevEnv = nodeEnv === 'development';
var getApiBaseURL = function () {
    if (isDevEnv) {
        return process.env.POLY_API_BASE_URL;
    }
    else {
        return process.env.POLY_API_BASE_URL.replace(/^http:/, 'https://');
    }
};
var getApiHeaders = function () {
    var _a;
    return (_a = {
            Authorization: "Bearer ".concat(process.env.POLY_API_KEY || '')
        },
        _a[constants_1.POLY_API_VERSION_HEADER] = process.env.POLY_API_VERSION || '',
        _a);
};
var axios = axios_1.default.create({
    httpAgent: httpProxy
        ? new http_proxy_agent_1.HttpProxyAgent(httpProxy)
        : undefined,
    httpsAgent: httpsProxy
        ? new https_proxy_agent_1.HttpsProxyAgent(httpsProxy, {
            rejectUnauthorized: !isDevEnv,
        })
        : isDevEnv
            ? new https_1.default.Agent({ rejectUnauthorized: false })
            : undefined,
    proxy: false,
});
var getSpecs = function (contexts, names, ids, noTypes) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.get("".concat(getApiBaseURL(), "/specs"), {
                    headers: getApiHeaders(),
                    params: {
                        contexts: contexts,
                        names: names,
                        ids: ids,
                        noTypes: noTypes,
                    },
                })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.getSpecs = getSpecs;
var createOrUpdateServerFunction = function (context, name, description, code, typeSchemas, requirements, other, executionApiKey) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.post("".concat(getApiBaseURL(), "/functions/server"), __assign({ context: context, name: name, description: description, code: code, typeSchemas: typeSchemas, requirements: requirements, executionApiKey: executionApiKey }, other), {
                    headers: __assign({ 'Content-Type': 'application/json' }, getApiHeaders()),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.createOrUpdateServerFunction = createOrUpdateServerFunction;
var getServerFunctionByName = function (context, name) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.get("".concat(getApiBaseURL(), "/functions/server"), {
                    headers: __assign({ 'Content-Type': 'application/json' }, getApiHeaders()),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data.find(function (fn) { return fn.name === name && fn.context === context; })];
        }
    });
}); };
exports.getServerFunctionByName = getServerFunctionByName;
var deleteServerFunction = function (id) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.delete("".concat(getApiBaseURL(), "/functions/server/").concat(id), {
                    headers: __assign({ 'Content-Type': 'application/json' }, getApiHeaders()),
                })];
            case 1: return [2 /*return*/, (_a.sent())];
        }
    });
}); };
exports.deleteServerFunction = deleteServerFunction;
var createOrUpdateClientFunction = function (context, name, description, code, typeSchemas, other) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.post("".concat(getApiBaseURL(), "/functions/client"), __assign({ context: context, name: name, description: description, code: code, typeSchemas: typeSchemas }, other), {
                    headers: __assign({ 'Content-Type': 'application/json' }, getApiHeaders()),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.createOrUpdateClientFunction = createOrUpdateClientFunction;
var getClientFunctionByName = function (context, name) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.get("".concat(getApiBaseURL(), "/functions/client"), {
                    headers: __assign({ 'Content-Type': 'application/json' }, getApiHeaders()),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data.find(function (fn) { return fn.name === name && fn.context === context; })];
        }
    });
}); };
exports.getClientFunctionByName = getClientFunctionByName;
var deleteClientFunction = function (id) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.delete("".concat(getApiBaseURL(), "/functions/client/").concat(id), {
                    headers: __assign({ 'Content-Type': 'application/json' }, getApiHeaders()),
                })];
            case 1: return [2 /*return*/, (_a.sent())];
        }
    });
}); };
exports.deleteClientFunction = deleteClientFunction;
var createTenantSignUp = function (instance, email, tenantName) {
    if (tenantName === void 0) { tenantName = null; }
    return __awaiter(void 0, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, axios.post("".concat((0, utils_1.getInstanceUrl)(instance), "/tenants/sign-up"), {
                        email: email,
                        tenantName: tenantName,
                    }, {
                        headers: (_a = {
                                'Content-Type': 'application/json'
                            },
                            _a[constants_1.POLY_API_VERSION_HEADER] = process.env.POLY_API_VERSION || '',
                            _a),
                    })];
                case 1: return [2 /*return*/, (_b.sent()).data];
            }
        });
    });
};
exports.createTenantSignUp = createTenantSignUp;
var verifyTenantSignUp = function (instance, email, code) { return __awaiter(void 0, void 0, void 0, function () {
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, axios.post("".concat((0, utils_1.getInstanceUrl)(instance), "/tenants/sign-up/verify"), {
                    code: code,
                    email: email,
                }, {
                    headers: (_a = {
                            'Content-Type': 'application/json'
                        },
                        _a[constants_1.POLY_API_VERSION_HEADER] = process.env.POLY_API_VERSION || '',
                        _a),
                })];
            case 1: return [2 /*return*/, (_b.sent()).data];
        }
    });
}); };
exports.verifyTenantSignUp = verifyTenantSignUp;
var resendVerificationCode = function (instance, email) {
    var _a;
    return axios.post("".concat((0, utils_1.getInstanceUrl)(instance), "/tenants/sign-up/resend-verification-code"), {
        email: email,
    }, {
        headers: (_a = {},
            _a[constants_1.POLY_API_VERSION_HEADER] = process.env.POLY_API_VERSION || '',
            _a),
    });
};
exports.resendVerificationCode = resendVerificationCode;
var getLastTos = function (instance) { return __awaiter(void 0, void 0, void 0, function () {
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, axios.get("".concat((0, utils_1.getInstanceUrl)(instance), "/tos"), {
                    headers: (_a = {},
                        _a[constants_1.POLY_API_VERSION_HEADER] = process.env.POLY_API_VERSION || '',
                        _a),
                })];
            case 1: return [2 /*return*/, (_b.sent()).data];
        }
    });
}); };
exports.getLastTos = getLastTos;
var upsertApiFunction = function (data) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.put("".concat(getApiBaseURL(), "/functions/api"), data, {
                    headers: getApiHeaders(),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.upsertApiFunction = upsertApiFunction;
var upsertWebhookHandle = function (data) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.put("".concat(getApiBaseURL(), "/webhooks"), data, {
                    headers: getApiHeaders(),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.upsertWebhookHandle = upsertWebhookHandle;
var upsertSchema = function (data) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.put("".concat(getApiBaseURL(), "/schemas"), data, {
                    headers: getApiHeaders(),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.upsertSchema = upsertSchema;
var translateSpecification = function (contents, context, hostUrl, hostUrlAsArgument) { return __awaiter(void 0, void 0, void 0, function () {
    var params, url;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                params = new URLSearchParams();
                if (context)
                    params.append('context', context);
                if (hostUrl)
                    params.append('hostUrl', hostUrl);
                if (hostUrlAsArgument)
                    params.append('hostUrlAsArgument', hostUrlAsArgument);
                url = "".concat(getApiBaseURL(), "/specification-input/oas?").concat(params.toString());
                return [4 /*yield*/, axios.post(url, contents, {
                        headers: __assign({ 'Content-Type': 'text/plain' }, getApiHeaders()),
                    })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.translateSpecification = translateSpecification;
var validateApiFunctionDto = function (data) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.post("".concat(getApiBaseURL(), "/specification-input/validation/api-function"), data, {
                    headers: getApiHeaders(),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.validateApiFunctionDto = validateApiFunctionDto;
var validateWebhookHandleDto = function (data) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.post("".concat(getApiBaseURL(), "/specification-input/validation/webhook-handle"), data, {
                    headers: getApiHeaders(),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.validateWebhookHandleDto = validateWebhookHandleDto;
var getServerFunctionDescription = function (data) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.post("".concat(getApiBaseURL(), "/functions/server/description-generation"), data, {
                    headers: getApiHeaders(),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.getServerFunctionDescription = getServerFunctionDescription;
var getClientFunctionDescription = function (data) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.post("".concat(getApiBaseURL(), "/functions/client/description-generation"), data, {
                    headers: getApiHeaders(),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.getClientFunctionDescription = getClientFunctionDescription;
var getApiFunctionDescription = function (data) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.post("".concat(getApiBaseURL(), "/functions/api/description-generation"), data, {
                    headers: getApiHeaders(),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.getApiFunctionDescription = getApiFunctionDescription;
var upsertSnippet = function (data) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.put("".concat(getApiBaseURL(), "/snippets"), data, {
                    headers: getApiHeaders(),
                })];
            case 1: return [2 /*return*/, (_a.sent())];
        }
    });
}); };
exports.upsertSnippet = upsertSnippet;
var getWebhookHandleDescription = function (data) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.post("".concat(getApiBaseURL(), "/webhooks/description-generation"), data, {
                    headers: getApiHeaders(),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.getWebhookHandleDescription = getWebhookHandleDescription;
var getAuthData = function (baseUrl, apiKey) { return __awaiter(void 0, void 0, void 0, function () {
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, axios.get("".concat(baseUrl, "/auth"), {
                    headers: (_a = {
                            Authorization: "Bearer ".concat(apiKey)
                        },
                        _a[constants_1.POLY_API_VERSION_HEADER] = process.env.POLY_API_VERSION || '',
                        _a),
                })];
            case 1: return [2 /*return*/, (_b.sent()).data];
        }
    });
}); };
exports.getAuthData = getAuthData;
var getProjectTemplatesConfig = function (baseUrl, apiKey, tenantId, environmentId) { return __awaiter(void 0, void 0, void 0, function () {
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, axios.get("".concat(baseUrl, "/tenants/").concat(tenantId, "/environments/").concat(environmentId, "/config-variables/ProjectTemplates"), {
                    headers: (_a = {
                            Authorization: "Bearer ".concat(apiKey)
                        },
                        _a[constants_1.POLY_API_VERSION_HEADER] = process.env.POLY_API_VERSION || '',
                        _a),
                })];
            case 1: return [2 /*return*/, (_b.sent()).data.value];
        }
    });
}); };
exports.getProjectTemplatesConfig = getProjectTemplatesConfig;
var createOrUpdateWebhook = function (context, name, description, config) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.put("".concat(getApiBaseURL(), "/webhooks"), __assign({ context: context, name: name, description: description }, config), {
                    headers: __assign({ 'Content-Type': 'application/json' }, getApiHeaders()),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data];
        }
    });
}); };
exports.createOrUpdateWebhook = createOrUpdateWebhook;
var getWebhookByName = function (context, name) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.get("".concat(getApiBaseURL(), "/webhooks"), {
                    headers: __assign({ 'Content-Type': 'application/json' }, getApiHeaders()),
                })];
            case 1: return [2 /*return*/, (_a.sent()).data.find(function (webhook) { return webhook.name === name && webhook.context === context; })];
        }
    });
}); };
exports.getWebhookByName = getWebhookByName;
var deleteWebhook = function (webhookId) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, axios.delete("".concat(getApiBaseURL(), "/webhooks/").concat(webhookId), {
                    headers: __assign({ 'Content-Type': 'application/json' }, getApiHeaders()),
                })];
            case 1: return [2 /*return*/, (_a.sent())];
        }
    });
}); };
exports.deleteWebhook = deleteWebhook;
