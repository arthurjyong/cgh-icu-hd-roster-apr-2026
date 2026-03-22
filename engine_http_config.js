function getTrialComputeExternalHttpConfigPropertyKeys_() {
  return {
    url: "TRIAL_COMPUTE_EXTERNAL_URL",
    token: "TRIAL_COMPUTE_EXTERNAL_TOKEN"
  };
}

function getTrialComputeExternalHttpConfig_() {
  const keys = getTrialComputeExternalHttpConfigPropertyKeys_();
  const properties = PropertiesService.getScriptProperties();

  return {
    url: properties.getProperty(keys.url),
    token: properties.getProperty(keys.token)
  };
}

function validateTrialComputeExternalHttpConfig_(config) {
  const issues = [];
  const value = config || {};

  if (typeof value.url !== "string" || !value.url.trim()) {
    issues.push("External HTTP config url is required.");
  }

  if (typeof value.token !== "string" || !value.token.trim()) {
    issues.push("External HTTP config token is required.");
  }

  return issues.length > 0
    ? {
        ok: false,
        message: issues[0],
        issues: issues
      }
    : {
        ok: true,
        url: value.url.trim(),
        hasToken: true
      };
}

function maskSecretForLog_(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  if (value.length <= 8) {
    return "***";
  }

  return value.slice(0, 4) + "..." + value.slice(-4);
}

function debugReadTrialComputeExternalHttpConfig() {
  const config = getTrialComputeExternalHttpConfig_();
  const validation = validateTrialComputeExternalHttpConfig_(config);

  Logger.log(JSON.stringify({
    ok: validation.ok === true,
    message: validation.message || "External HTTP config loaded.",
    issues: validation.issues || [],
    url: config && config.url ? config.url : null,
    hasToken: !!(config && config.token),
    tokenPreview: maskSecretForLog_(config && config.token ? config.token : null),
    propertyKeys: getTrialComputeExternalHttpConfigPropertyKeys_()
  }, null, 2));
}
