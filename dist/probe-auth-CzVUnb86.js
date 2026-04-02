import { Cm as GATEWAY_CLIENT_MODES, Fs as READ_SCOPE, Lh as isGatewaySecretRefUnavailableError, Xh as isLoopbackHost, js as resolveGatewayCredentialsWithSecretInputs, wm as GATEWAY_CLIENT_NAMES, zh as resolveGatewayProbeCredentialsFromConfig, zs as GatewayClient } from "./reply-Bm8VrLQh.js";
import { r as formatErrorMessage } from "./errors-C1t_6llh.js";
import { randomUUID } from "node:crypto";
//#region src/gateway/probe.ts
async function probeGateway(opts) {
	const startedAt = Date.now();
	const instanceId = randomUUID();
	let connectLatencyMs = null;
	let connectError = null;
	let close = null;
	const disableDeviceIdentity = false;
	return await new Promise((resolve) => {
		let settled = false;
		const settle = (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			client.stop();
			resolve({
				url: opts.url,
				...result
			});
		};
		const client = new GatewayClient({
			url: opts.url,
			token: opts.auth?.token,
			password: opts.auth?.password,
			scopes: [READ_SCOPE],
			clientName: GATEWAY_CLIENT_NAMES.CLI,
			clientVersion: "dev",
			mode: GATEWAY_CLIENT_MODES.PROBE,
			instanceId,
			deviceIdentity: disableDeviceIdentity ? null : void 0,
			onConnectError: (err) => {
				connectError = formatErrorMessage(err);
			},
			onClose: (code, reason) => {
				close = {
					code,
					reason
				};
			},
			onHelloOk: async () => {
				connectLatencyMs = Date.now() - startedAt;
				if (opts.includeDetails === false) {
					settle({
						ok: true,
						connectLatencyMs,
						error: null,
						close,
						health: null,
						status: null,
						presence: null,
						configSnapshot: null
					});
					return;
				}
				const [healthResult, statusResult, presenceResult, configResult] = await Promise.allSettled([
					client.request("health"),
					client.request("status"),
					client.request("system-presence"),
					client.request("config.get", {})
				]);
				const health = healthResult.status === "fulfilled" ? healthResult.value : null;
				const status = statusResult.status === "fulfilled" ? statusResult.value : null;
				const presence = presenceResult.status === "fulfilled" && Array.isArray(presenceResult.value) ? presenceResult.value : null;
				const configSnapshot = configResult.status === "fulfilled" ? configResult.value : null;
				const errors = [healthResult, statusResult, presenceResult, configResult].flatMap((result) => result.status === "rejected" ? [formatErrorMessage(result.reason)] : []);
				settle({
					ok: health !== null,
					connectLatencyMs,
					error: errors.length > 0 ? errors.join("; ") : null,
					close,
					health,
					status,
					presence,
					configSnapshot
				});
			}
		});
		const timer = setTimeout(() => {
			settle({
				ok: false,
				connectLatencyMs,
				error: connectError ? `connect failed: ${connectError}` : "timeout",
				close,
				health: null,
				status: null,
				presence: null,
				configSnapshot: null
			});
		}, Math.max(250, opts.timeoutMs));
		client.start();
	});
}
//#endregion
//#region src/gateway/probe-auth.ts
function buildGatewayProbeCredentialPolicy(params) {
	return {
		config: params.cfg,
		cfg: params.cfg,
		env: params.env,
		explicitAuth: params.explicitAuth,
		modeOverride: params.mode,
		mode: params.mode,
		includeLegacyEnv: false,
		remoteTokenFallback: "remote-only"
	};
}
function resolveGatewayProbeAuth(params) {
	return resolveGatewayProbeCredentialsFromConfig(buildGatewayProbeCredentialPolicy(params));
}
async function resolveGatewayProbeAuthWithSecretInputs(params) {
	const policy = buildGatewayProbeCredentialPolicy(params);
	return await resolveGatewayCredentialsWithSecretInputs({
		config: policy.config,
		env: policy.env,
		explicitAuth: policy.explicitAuth,
		modeOverride: policy.modeOverride,
		includeLegacyEnv: policy.includeLegacyEnv,
		remoteTokenFallback: policy.remoteTokenFallback
	});
}
function resolveGatewayProbeAuthSafe(params) {
	try {
		return { auth: resolveGatewayProbeAuth(params) };
	} catch (error) {
		if (!isGatewaySecretRefUnavailableError(error)) throw error;
		return {
			auth: {},
			warning: `${error.path} SecretRef is unresolved in this command path; probing without configured auth credentials.`
		};
	}
}
//#endregion
export { resolveGatewayProbeAuthWithSecretInputs as n, probeGateway as r, resolveGatewayProbeAuthSafe as t };
