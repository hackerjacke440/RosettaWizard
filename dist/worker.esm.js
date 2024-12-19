// src/lib/env.ts
var FoundationsTimeRequestKey = "foundations_time_request";
var FoundationsCourseRequestKey = "foundations_course_request";
var FluencyBuilderTimeRequestKey = "fluency_builder_time_request";
var BeforeSendHeadersParams = [
  "requestHeaders"
];
var BeforeSendRequestParams = [
  "requestBody"
];
var FoundationsRequestFilter = {
  urls: [
    "https://tracking.rosettastone.com/*"
  ]
};
var FluencyBuilderRequestFilter = {
  urls: [
    "https://gaia-server.rosettastone.com/*"
  ]
};

// src/worker/request.ts
function storeRequest(key) {
  return async (req) => {
    const slice = {};
    slice[key] = req;
    console.debug(`Storing request at "${key}"`, req);
    await chrome.storage.session.set(slice);
  };
}
function requestFromObject(req) {
  let body = null;
  if (req.requestBody != null) {
    body = new TextDecoder().decode(req.requestBody.raw[0].bytes);
  }
  const headers = {};
  if (req.requestHeaders !== void 0)
    req.requestHeaders.forEach(({ name, value }) => headers[name] = value);
  else if (req.headers !== void 0)
    Object.entries(req.headers).forEach(([name, value]) => headers[name] = value);
  let timestamp;
  if (req.timeStamp != null)
    timestamp = new Date(req.timeStamp);
  else
    timestamp = /* @__PURE__ */ new Date();
  return {
    ...req,
    body,
    timestamp,
    headers
  };
}
var foundationsTimeRequest = {
  filter: (details) => {
    if (details.method !== "POST" || details.tabId === -1)
      return false;
    const url = URL.parse(details.url);
    return url?.pathname?.endsWith("path_scores") || false;
  },
  onMatched: storeRequest(FoundationsTimeRequestKey)
};
var foundationsCourseRequest = {
  filter: (details) => {
    if (details.method !== "GET" || details.tabId === -1)
      return false;
    const url = URL.parse(details.url);
    return url?.pathname?.endsWith("path_step_scores") || false;
  },
  onMatched: storeRequest(FoundationsCourseRequestKey)
};
var fluencyBuilderTimeRequest = {
  filter: (details) => {
    if (details.method !== "POST" || details.body === null || details.tabId === -1)
      return false;
    const url = URL.parse(details.url);
    if (url?.pathname !== "/graphql")
      return false;
    const body = JSON.parse(details.body);
    return body.operationName === "AddProgress";
  },
  onMatched: storeRequest(FluencyBuilderTimeRequestKey)
};
function setupRequestListeners(urlFilters, filters) {
  const requestBuffers = new Array(filters.length);
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      for (let i = 0; i < filters.length; i++) {
        const req = requestFromObject(details);
        if (filters[i].filter(req))
          requestBuffers[i] = req;
      }
    },
    urlFilters,
    BeforeSendRequestParams
  );
  chrome.webRequest.onBeforeSendHeaders.addListener(
    async (details) => {
      for (let i = 0; i < requestBuffers.length; i++) {
        const req = requestBuffers[i];
        if (req?.requestId !== details.requestId)
          continue;
        if (details.requestHeaders !== void 0)
          details.requestHeaders.forEach(({ name, value }) => req.headers[name] = value);
        else if (details.headers !== void 0)
          Object.entries(details.headers).forEach(([name, value]) => req.headers[name] = value);
        await filters[i].onMatched(req);
        requestBuffers[i] = null;
      }
    },
    urlFilters,
    BeforeSendHeadersParams
  );
}
function setupListeners() {
  setupRequestListeners(FoundationsRequestFilter, [
    foundationsTimeRequest,
    foundationsCourseRequest
  ]);
  setupRequestListeners(FluencyBuilderRequestFilter, [
    fluencyBuilderTimeRequest
  ]);
}

// src/lib/product.ts
function getProductFromUrl(url) {
  switch (url.hostname) {
    case "totale.rosettastone.com":
      return "foundations" /* Foundations */;
    case "learn.rosettastone.com":
      return "fluency builder" /* FluencyBuilder */;
    default:
      throw new Error("Invalid site for product");
  }
}

// src/worker/tab.ts
function onTabUpdate(tab) {
  const effectiveUrl = URL.parse(tab.url);
  if (effectiveUrl === null)
    return;
  try {
    getProductFromUrl(effectiveUrl);
    chrome.action.enable(tab.id);
  } catch (_e) {
    chrome.action.disable(tab.id);
  }
}
function setupTabListeners() {
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId, onTabUpdate);
  });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete")
      onTabUpdate(tab);
  });
}

// src/worker/index.ts
setupListeners();
setupTabListeners();
console.info("Successfully started RosettaStonks");
